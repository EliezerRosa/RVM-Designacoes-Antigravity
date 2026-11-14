/**
 * CardPlanner — Orquestrador de Visualizações e Micro-Painéis Derivados da Intenção
 *
 * Mapeia o resultado do NLU, verifica permissões com o PolicyGuard,
 * resolve entidades reais e gera a estrutura exata do card a ser renderizado na UI.
 */

import type { PermissionGate } from '../../../services/permissionService';
import type { Publisher } from '../../../types';
import type { ParsedSlots } from './nlu/l0Grammar';
import type { NLUResolution } from './nlu/l2Classifier';
import type { ChatMessageItem, ConversaContextState } from './conversationState';
import { checkIntentPermission } from './policyGuard';
import { resolvePublisher, resolveWeek } from './entityResolver';
import { queryPort } from '../ports/queryPort';
import { documentPort, formatDateBr } from '../ports/documentPort';
import { knowledgePort } from '../ports/knowledgePort';
import {
  actionPort,
  expandAbsenceDateRange,
  type ActionExecutionResult,
} from '../ports/actionPort';

export interface PlannedTurnResult {
  message: ChatMessageItem;
  updatedContext: ConversaContextState;
  spokenText?: string;
}

export interface PlanUserContext {
  publisherId?: string | null;
  publisherName?: string | null;
  isAdmin?: boolean;
}

export interface CardPlannerPorts {
  actions?: Pick<typeof actionPort, 'registerAbsence' | 'approveWeekProposal'> &
    Partial<
      Pick<
        typeof actionPort,
        | 'confirmAssignment'
        | 'refuseAssignment'
        | 'assignOrReplacePart'
        | 'rejectPartProposal'
        | 'generateWeekDesignations'
        | 'clearWeekDesignations'
        | 'completeWeekOrPart'
        | 'undoLastAction'
        | 'addLocalNeedToQueue'
      >
    >;
  queries?: Pick<
    typeof queryPort,
    'getPublisherAssignments' | 'getWeekParts' | 'getVacantParts' | 'getLastParticipation' | 'getPendingWeeks'
  > &
    Partial<
      Pick<
        typeof queryPort,
        | 'checkPublisherEligibility'
        | 'explainPartRanking'
        | 'getPublisherProfileSummary'
        | 'getPublisherListSummary'
        | 'getAnalyticsSummary'
      >
    >;
  documents?: Pick<typeof documentPort, 'getS140ChronologicalList' | 'getS89ChronologicalList'> &
    Partial<Pick<typeof documentPort, 'getS4ChronologicalList' | 'getS1ChronologicalList'>>;
}

function normText(value?: string | null): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type InternalSlots = ParsedSlots & { chosenPublisherId?: string };

function mentionsSelf(rawText: string): boolean {
  return /\b(eu|meu|minha|meus|minhas|comigo|mim|vou|estarei|estou|nao poderei|não poderei)\b/i.test(rawText);
}

function resolveTargetPerson(
  resolvedPerson: Publisher | undefined,
  rawText: string,
  context: ConversaContextState,
  userContext: PlanUserContext
): { id?: string; name?: string; isSelf: boolean } {
  if (resolvedPerson) {
    return {
      id: resolvedPerson.id,
      name: resolvedPerson.name,
      isSelf: Boolean(userContext.publisherId && resolvedPerson.id === userContext.publisherId),
    };
  }

  if (mentionsSelf(rawText) && userContext.publisherId) {
    return {
      id: userContext.publisherId,
      name: userContext.publisherName || undefined,
      isSelf: true,
    };
  }

  const fallbackId = context.lastPersonId || userContext.publisherId || undefined;
  const fallbackName = context.lastPersonId
    ? context.lastPersonName
    : userContext.publisherName || undefined;

  return {
    id: fallbackId,
    name: fallbackName,
    isSelf: Boolean(userContext.publisherId && fallbackId === userContext.publisherId),
  };
}

export async function planTurn(
  nlu: NLUResolution,
  context: ConversaContextState,
  gate: PermissionGate,
  allPublishers: Publisher[],
  availableWeeks: string[],
  userContext: PlanUserContext = {},
  ports: CardPlannerPorts = {}
): Promise<PlannedTurnResult> {
  const messageId = `msg_${Date.now()}`;
  const now = Date.now();
  const actions = ports.actions || actionPort;
  const queries = ports.queries || queryPort;
  const documents = ports.documents || documentPort;

  // 1. Resposta a Clarificação Numérica Ativa (0-based via L0 ou clique no card)
  if (context.activeDisambiguation && nlu.slots.choiceIndex !== undefined) {
    const idx = nlu.slots.choiceIndex;
    const chosen = context.activeDisambiguation.candidates[idx];
    if (chosen) {
      const intentId = context.activeDisambiguation.intentId;
      const updatedContext: ConversaContextState = {
        ...context,
        activeDisambiguation: undefined,
        lastPersonId: chosen.id,
        lastPersonName: chosen.label,
      };

      const resolvedSlots: InternalSlots = {
        ...context.activeDisambiguation.pendingSlots,
        personName: chosen.label,
        chosenPublisherId: chosen.id,
      };

      return planTurn(
        {
          intentId,
          slots: resolvedSlots,
          confidence: 1.0,
          layer: 'l0-grammar',
          rawText: chosen.label,
        },
        updatedContext,
        gate,
        allPublishers,
        availableWeeks,
        userContext,
        ports
      );
    }
  }

  // Cancelamento de Clarificação Ativa via "não" / "cancelar"
  if (context.activeDisambiguation && nlu.slots.confirmation === 'no') {
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: 'Seleção cancelada. Em que mais posso ajudar?',
        timestamp: now,
      },
      updatedContext: { ...context, activeDisambiguation: undefined },
      spokenText: 'Seleção cancelada.',
    };
  }

  // 2. Confirmação / Cancelamento de Ação Pendente
  if (context.pendingAction && nlu.slots.confirmation) {
    const action = context.pendingAction;
    const updatedContext: ConversaContextState = { ...context, pendingAction: undefined };

    if (nlu.slots.confirmation === 'yes') {
      let execResult: ActionExecutionResult | null = null;

      if (action.intentId === 'register-absence') {
        const personId = String(action.params.personId || '');
        const startDate = String(action.params.startDate || '');
        const endDate = action.params.endDate ? String(action.params.endDate) : undefined;
        const reason = action.params.reason ? String(action.params.reason) : undefined;

        if (!personId) {
          execResult = {
            success: false,
            actionType: 'UPDATE_AVAILABILITY',
            message: 'Não consegui identificar o publicador para registrar a ausência. Informe o nome completo ou vincule seu perfil.',
          };
        } else {
          execResult = await actions.registerAbsence(
            personId,
            startDate,
            endDate,
            reason,
            userContext.publisherName || 'Conversa IA'
          );
        }
      } else if (action.intentId === 'approve-week-proposal') {
        const weekId = String(action.params.weekId || '');
        if (!weekId) {
          execResult = {
            success: false,
            actionType: 'APPROVE_PROPOSAL',
            message: 'Semana não identificada para aprovação.',
          };
        } else {
          execResult = await actions.approveWeekProposal(
            weekId,
            userContext.publisherId || userContext.publisherName || 'conversa-ia'
          );
        }
      } else if (action.intentId === 'confirm-my-assignment') {
        const fn = actions.confirmAssignment || actionPort.confirmAssignment;
        execResult = await fn(String(action.params.partId || ''), String(action.params.publisherId || ''));
      } else if (action.intentId === 'refuse-my-assignment') {
        const fn = actions.refuseAssignment || actionPort.refuseAssignment;
        execResult = await fn(
          String(action.params.partId || ''),
          String(action.params.publisherId || ''),
          action.params.reason ? String(action.params.reason) : undefined
        );
      } else if (action.intentId === 'reassign-part-assignee') {
        const fn = actions.assignOrReplacePart || actionPort.assignOrReplacePart;
        const newPubId = String(action.params.newPublisherId || '');
        const newPub = allPublishers.find((p) => p.id === newPubId);
        if (!newPub) {
          execResult = {
            success: false,
            actionType: 'ASSIGN_PART',
            message: 'Publicador substituto não encontrado no cadastro.',
          };
        } else {
          execResult = await fn(
            String(action.params.weekId || ''),
            action.params.partHint ? String(action.params.partHint) : undefined,
            newPub,
            allPublishers,
            action.params.currentAssignee ? String(action.params.currentAssignee) : undefined,
            true
          );
        }
      } else if (action.intentId === 'reject-part-proposal') {
        const fn = actions.rejectPartProposal || actionPort.rejectPartProposal;
        execResult = await fn(
          String(action.params.weekId || ''),
          action.params.partHint ? String(action.params.partHint) : undefined,
          action.params.currentAssignee ? String(action.params.currentAssignee) : undefined,
          action.params.reason ? String(action.params.reason) : undefined
        );
      } else if (action.intentId === 'generate-week') {
        const fn = actions.generateWeekDesignations || actionPort.generateWeekDesignations;
        execResult = await fn(String(action.params.weekId || ''), allPublishers);
      } else if (action.intentId === 'clear-week') {
        const fn = actions.clearWeekDesignations || actionPort.clearWeekDesignations;
        execResult = await fn(String(action.params.weekId || ''));
      } else if (action.intentId === 'complete-part') {
        const fn = actions.completeWeekOrPart || actionPort.completeWeekOrPart;
        execResult = await fn(
          String(action.params.weekId || ''),
          action.params.partHint ? String(action.params.partHint) : undefined
        );
      } else if (action.intentId === 'undo-last-action') {
        const fn = actions.undoLastAction || actionPort.undoLastAction;
        execResult = await fn();
      } else if (action.intentId === 'manage-local-needs') {
        const fn = actions.addLocalNeedToQueue || actionPort.addLocalNeedToQueue;
        execResult = await fn(
          String(action.params.theme || ''),
          String(action.params.assigneeName || 'A definir'),
          action.params.weekId ? String(action.params.weekId) : null
        );
      }

      if (!execResult) {
        return {
          message: {
            id: messageId,
            sender: 'assistant',
            text: `Esta operação (${action.title}) requer execução pela tela principal do RVM no momento.`,
            timestamp: now,
            cardType: 'micro-panel',
            cardData: { status: 'error', title: action.title, description: action.description },
          },
          updatedContext,
          spokenText: 'Esta ação deve ser feita pela tela principal do RVM.',
        };
      }

      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: execResult.message,
          timestamp: now,
          cardType: 'micro-panel',
          cardData: {
            status: execResult.success ? 'success' : 'error',
            title: action.title,
            description: execResult.message,
          },
        },
        updatedContext,
        spokenText: execResult.message,
      };
    } else {
      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: `Operação cancelada. Nenhuma alteração foi realizada.`,
          timestamp: now,
        },
        updatedContext,
        spokenText: 'Operação cancelada.',
      };
    }
  }

  // 3. Intenção não reconhecida
  if (!nlu.intentId) {
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: 'Não consegui identificar a intenção com clareza. Você pode perguntar sobre suas designações, ver a programação da semana (S-140), o cartão S-89 ou consultar regras teocráticas.',
        timestamp: now,
      },
      updatedContext: context,
      spokenText: 'Não entendi com clareza. Em que posso ajudar?',
    };
  }

  // 4. Verificação de Permissão (PolicyGuard)
  const perm = checkIntentPermission(nlu.intentId, gate);
  if (!perm.allowed) {
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: perm.reason || 'Seu perfil de acesso não tem permissão para visualizar ou executar esta operação.',
        timestamp: now,
      },
      updatedContext: context,
      spokenText: 'Seu perfil não tem permissão para esta ação.',
    };
  }

  // 5. Resolução de Entidades (Pessoa e Semana)
  const chosenId = (nlu.slots as InternalSlots).chosenPublisherId;
  let resolvedPerson: Publisher | undefined;
  let explicitPersonNotFound = false;

  if (chosenId) {
    resolvedPerson = allPublishers.find((p) => p.id === chosenId) || ({
      id: chosenId,
      name: context.lastPersonName || chosenId,
    } as Publisher);
  } else if (nlu.slots.personName) {
    const pRes = resolvePublisher(nlu.slots.personName, allPublishers);
    if (pRes.disambiguationNeeded && pRes.candidates) {
      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: `Encontrei mais de um irmão com o nome "${nlu.slots.personName}". Por favor, toque no irmão desejado:`,
          timestamp: now,
          cardType: 'clarify',
          cardData: {
            title: 'Qual irmão você se refere?',
            candidates: pRes.candidates,
          },
        },
        updatedContext: {
          ...context,
          activeDisambiguation: {
            intentId: nlu.intentId,
            slotName: 'personName',
            candidates: pRes.candidates,
            pendingSlots: nlu.slots,
          },
        },
        spokenText: `Encontrei mais de um publicador com o nome ${nlu.slots.personName}. Escolha uma das opções na tela.`,
      };
    }
    resolvedPerson = pRes.person;
    if (!resolvedPerson) {
      explicitPersonNotFound = true;
    }
  }

  const weekRes = resolveWeek(nlu.slots.weekId, availableWeeks);
  const explicitWeekId = nlu.slots.weekId ? weekRes.weekId : undefined;
  const targetWeekId = weekRes.weekId || context.lastWeekId;

  // Atualizar contexto
  const updatedContext: ConversaContextState = {
    ...context,
    lastPersonId: resolvedPerson?.id || context.lastPersonId,
    lastPersonName: resolvedPerson?.name || context.lastPersonName,
    lastWeekId: targetWeekId,
    activeDisambiguation: undefined,
  };

  if (explicitPersonNotFound && nlu.slots.personName) {
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: `Não encontrei o publicador "${nlu.slots.personName}" no seu escopo de visualização.`,
        timestamp: now,
        intentId: nlu.intentId,
      },
      updatedContext,
      spokenText: `Não encontrei o publicador ${nlu.slots.personName}.`,
    };
  }

  // 6. Roteamento por Categoria de Intenção

  // A. EXPLICAÇÕES
  if (nlu.intentId === 'explain-engine-rules') {
    const queryHint = nlu.slots.ruleId || nlu.slots.ruleName || nlu.rawText;
    const expl = knowledgePort.getExplanation(queryHint);
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: expl.summary,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: 'explain',
        cardData: expl,
      },
      updatedContext,
      spokenText: expl.summary,
    };
  }

  if (nlu.intentId === 'explain-ranking') {
    if (availableWeeks.length === 0 && !ports.queries?.explainPartRanking) {
      const expl = knowledgePort.getExplanation(nlu.rawText);
      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: expl.summary,
          timestamp: now,
          intentId: nlu.intentId,
          cardType: 'explain',
          cardData: expl,
        },
        updatedContext,
        spokenText: expl.summary,
      };
    }

    const rankingFn = queries.explainPartRanking || queryPort.explainPartRanking.bind(queryPort);
    const res = await rankingFn(explicitWeekId || targetWeekId || availableWeeks[0], nlu.slots.partType, resolvedPerson, allPublishers);
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: res.summary,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: res.items.length ? 'micro-panel' : undefined,
        cardData: res.items.length
          ? {
            type: 'info-list',
            title: res.title,
            description: res.summary,
            items: res.items,
          }
          : undefined,
      },
      updatedContext,
      spokenText: res.summary,
    };
  }

  // B. DOCUMENTOS (Carrossel Cronológico)
  if (nlu.intentId === 'view-s140') {
    const items = await documents.getS140ChronologicalList(explicitWeekId, allPublishers);
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: items.length
          ? `Aqui está a programação semanal S-140. Você pode deslizar para navegar pelas semanas em ordem cronológica:`
          : `Nenhuma programação S-140 encontrada para as próximas semanas.`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: items.length ? 'document-carousel' : undefined,
        cardData: items.length
          ? { items, initialFocusId: items.find((i) => i.isInitialFocus)?.id }
          : undefined,
      },
      updatedContext,
      spokenText: items.length
        ? 'Exibindo programação S-140 no carrossel.'
        : 'Nenhuma programação S-140 encontrada.',
    };
  }

  if (nlu.intentId === 'view-s89') {
    const hasExplicitTarget = Boolean(resolvedPerson || mentionsSelf(nlu.rawText));
    const target = hasExplicitTarget
      ? resolveTargetPerson(resolvedPerson, nlu.rawText, context, userContext)
      : {
          id: userContext.publisherId || undefined,
          name: userContext.publisherName || undefined,
          isSelf: Boolean(userContext.publisherId || userContext.publisherName),
        };

    const filterPublisherId =
      resolvedPerson?.id ||
      (mentionsSelf(nlu.rawText)
        ? target.id
        : userContext.isAdmin
          ? undefined
          : target.id);

    const items = await documents.getS89ChronologicalList(
      filterPublisherId,
      explicitWeekId,
      target.isSelf,
      userContext.publisherId,
      userContext.publisherName
    );
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: items.length
          ? `Designações S-89 encontradas em ordem cronológica:`
          : `Nenhuma designação S-89 encontrada para o filtro especificado.`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: items.length ? 'document-carousel' : undefined,
        cardData: items.length ? { items } : undefined,
      },
      updatedContext,
      spokenText: items.length ? 'Exibindo designações S-89.' : 'Nenhuma designação encontrada.',
    };
  }

  if (nlu.intentId === 'view-s4') {
    const target = resolveTargetPerson(resolvedPerson, nlu.rawText, context, userContext);
    const targetName = resolvedPerson?.name || target.name || userContext.publisherName || undefined;
    const loader = documents.getS4ChronologicalList || documentPort.getS4ChronologicalList;
    const items = await loader(targetName, nlu.slots.month);

    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: items.length
          ? `Cartões S-4 de ${items[0].subtitle} em ordem cronológica:`
          : `Nenhum cartão S-4 disponível para visualização com o seu perfil atual.`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: items.length ? 'document-carousel' : undefined,
        cardData: items.length
          ? { items, initialFocusId: items.find((i) => i.isInitialFocus)?.id }
          : undefined,
      },
      updatedContext,
      spokenText: items.length
        ? 'Exibindo cartões S-4 no carrossel.'
        : 'Nenhum cartão S-4 disponível no momento.',
    };
  }

  if (nlu.intentId === 'view-s1-consolidation') {
    const loader = documents.getS1ChronologicalList || documentPort.getS1ChronologicalList;
    const items = await loader(nlu.slots.month);

    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: items.length
          ? `Relatórios mensais consolidados (S-1) em ordem cronológica:`
          : `Nenhuma consolidação mensal S-1 encontrada para o período solicitado.`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: items.length ? 'document-carousel' : undefined,
        cardData: items.length
          ? { items, initialFocusId: items.find((i) => i.isInitialFocus)?.id }
          : undefined,
      },
      updatedContext,
      spokenText: items.length
        ? 'Exibindo consolidação mensal S-1 no carrossel.'
        : 'Nenhuma consolidação S-1 encontrada.',
    };
  }

  if (nlu.intentId === 'proactive-briefing') {
    const target = resolveTargetPerson(resolvedPerson, nlu.rawText, context, userContext);
    const pubId = target.id;
    const pubName = target.name || 'Irmão';
    const assignments = pubId ? await queries.getPublisherAssignments(pubId, pubName, target.isSelf) : [];
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: assignments.length
          ? `Resumo das suas pendências (${pubName}): você tem ${assignments.length} designação(ões) próxima(s).`
          : `Tudo em dia! Você não possui designações pendentes no momento.`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: assignments.length ? 'micro-panel' : undefined,
        cardData: assignments.length
          ? {
            type: 'assignments-list',
            title: `Pendências de ${pubName}`,
            items: assignments,
          }
          : undefined,
      },
      updatedContext,
      spokenText: assignments.length
        ? `Você tem ${assignments.length} designações futuras.`
        : 'Tudo em dia com suas designações.',
    };
  }

  if (nlu.intentId === 'query-sync-status') {
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: 'A sincronização externa local opera de modo independente na estação do operador quando iniciada.',
        timestamp: now,
        intentId: nlu.intentId,
      },
      updatedContext,
      spokenText: 'O serviço de sincronização local opera na estação do operador quando ativo.',
    };
  }

  // C. CONSULTAS (Micro-Painéis)
  if (nlu.intentId === 'query-my-assignments') {
    const target = resolveTargetPerson(resolvedPerson, nlu.rawText, context, userContext);
    if (!target.id) {
      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: 'Para consultar designações, informe o nome do publicador desejado ou vincule seu perfil ao cadastro de publicadores.',
          timestamp: now,
          intentId: nlu.intentId,
        },
        updatedContext,
        spokenText: 'De qual publicador você deseja consultar as designações?',
      };
    }

    const pubName = target.name || 'Publicador';
    const allAssignments = await queries.getPublisherAssignments(target.id, pubName, target.isSelf);
    const partFilter = nlu.slots.partType ? normText(nlu.slots.partType) : '';
    const assignments = partFilter
      ? allAssignments.filter((a) => normText(`${a.tipoParte} ${a.tituloParte || ''}`).includes(partFilter))
      : allAssignments;

    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: assignments.length
          ? `Encontrei ${assignments.length} designação(ões)${nlu.slots.partType ? ` (${nlu.slots.partType})` : ''} para ${pubName}:`
          : `${pubName} não possui designações futuras${nlu.slots.partType ? ` para "${nlu.slots.partType}"` : ''} registradas no momento.`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: assignments.length ? 'micro-panel' : undefined,
        cardData: assignments.length
          ? {
            type: 'assignments-list',
            title: `Designações de ${pubName}`,
            items: assignments,
          }
          : undefined,
      },
      updatedContext,
      spokenText: assignments.length
        ? `${pubName} tem ${assignments.length} designações futuras.`
        : `${pubName} não tem designações futuras no momento.`,
    };
  }

  if (nlu.intentId === 'query-last-participation') {
    const target = resolveTargetPerson(resolvedPerson, nlu.rawText, context, userContext);
    if (!target.id) {
      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: 'Informe de qual publicador você deseja consultar o histórico recente.',
          timestamp: now,
          intentId: nlu.intentId,
        },
        updatedContext,
        spokenText: 'De qual publicador você deseja consultar o histórico?',
      };
    }

    const pubName = target.name || 'Publicador';
    const history = await queries.getLastParticipation(target.id, pubName);
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: history.length
          ? `Última(s) ${history.length} participação(ões) registrada(s) de ${pubName}:`
          : `Não encontrei participações anteriores registradas para ${pubName}.`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: history.length ? 'micro-panel' : undefined,
        cardData: history.length
          ? {
            type: 'assignments-list',
            title: `Histórico de ${pubName}`,
            items: history,
          }
          : undefined,
      },
      updatedContext,
      spokenText: history.length
        ? `${pubName} participou por último na semana de ${formatDateBr(history[0].weekId)}.`
        : `Sem participações anteriores registradas para ${pubName}.`,
    };
  }

  if (nlu.intentId === 'query-week-assignments') {
    const weekId = targetWeekId || availableWeeks[0];
    if (!weekId) {
      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: 'Nenhuma semana futura cadastrada foi encontrada para consulta.',
          timestamp: now,
          intentId: nlu.intentId,
        },
        updatedContext,
        spokenText: 'Nenhuma semana futura disponível.',
      };
    }

    const allParts = await queries.getWeekParts(weekId);
    const partFilter = nlu.slots.partType ? normText(nlu.slots.partType) : '';
    const filteredParts = partFilter
      ? allParts.filter((p) => normText(`${p.tipoParte} ${p.tituloParte || ''} ${p.modalidade || ''}`).includes(partFilter))
      : allParts;
    const parts = filteredParts.length ? filteredParts : allParts;
    const weekBr = formatDateBr(weekId);
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: parts.length
          ? `Designações da semana de ${weekBr}:`
          : `Nenhuma parte encontrada para a semana de ${weekBr}.`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: parts.length ? 'micro-panel' : undefined,
        cardData: parts.length
          ? {
            type: 'week-parts-list',
            title: `Semana de ${weekBr}`,
            items: parts,
          }
          : undefined,
      },
      updatedContext,
      spokenText: parts.length
        ? `Exibindo ${parts.length} partes da semana de ${weekBr}.`
        : `Nenhuma parte encontrada para ${weekBr}.`,
    };
  }

  if (nlu.intentId === 'query-eligibility') {
    const target = resolveTargetPerson(resolvedPerson, nlu.rawText, context, userContext);
    const pub = target.id ? allPublishers.find((p) => p.id === target.id) : undefined;
    if (!pub) {
      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: 'Informe de qual publicador você deseja verificar a elegibilidade (ex: "o irmão Carlos pode fazer leitura?").',
          timestamp: now,
          intentId: nlu.intentId,
        },
        updatedContext,
        spokenText: 'De qual publicador você deseja verificar a elegibilidade?',
      };
    }

    const eligFn = queries.checkPublisherEligibility || queryPort.checkPublisherEligibility.bind(queryPort);
    const res = await eligFn(pub, nlu.slots.partType, explicitWeekId || availableWeeks[0], allPublishers);
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: res.summary,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: 'micro-panel',
        cardData: {
          type: 'info-list',
          title: res.title,
          description: res.summary,
          items: res.items,
        },
      },
      updatedContext,
      spokenText: res.summary,
    };
  }

  if (nlu.intentId === 'query-publisher-profile') {
    const target = resolveTargetPerson(resolvedPerson, nlu.rawText, context, userContext);
    const pub = target.id ? allPublishers.find((p) => p.id === target.id) : undefined;
    if (!pub) {
      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: 'Informe o nome do publicador ou vincule seu perfil para consultar os privilégios e dados cadastrais.',
          timestamp: now,
          intentId: nlu.intentId,
        },
        updatedContext,
        spokenText: 'De qual publicador você deseja consultar o perfil?',
      };
    }

    const scope = typeof gate.getPublisherScope === 'function' ? gate.getPublisherScope() : undefined;
    const canSeeSensitive = Boolean(userContext.isAdmin || target.isSelf || scope?.canSeeSensitiveData);
    const profileFn = queries.getPublisherProfileSummary || queryPort.getPublisherProfileSummary.bind(queryPort);
    const res = profileFn(pub, canSeeSensitive);

    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: res.summary,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: 'micro-panel',
        cardData: {
          type: 'info-list',
          title: res.title,
          description: res.summary,
          items: res.items,
        },
      },
      updatedContext,
      spokenText: res.summary,
    };
  }

  if (nlu.intentId === 'query-publisher-list') {
    const listFn = queries.getPublisherListSummary || queryPort.getPublisherListSummary.bind(queryPort);
    const res = listFn(allPublishers, nlu.slots.filter);
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: res.summary,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: 'micro-panel',
        cardData: {
          type: 'info-list',
          title: res.title,
          description: res.summary,
          items: res.items,
        },
      },
      updatedContext,
      spokenText: res.summary,
    };
  }

  if (nlu.intentId === 'query-analytics') {
    const analyticsFn = queries.getAnalyticsSummary || queryPort.getAnalyticsSummary.bind(queryPort);
    const res = await analyticsFn(allPublishers, nlu.rawText);
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: res.summary,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: 'micro-panel',
        cardData: {
          type: 'info-list',
          title: res.title,
          description: res.summary,
          items: res.items,
        },
      },
      updatedContext,
      spokenText: res.summary,
    };
  }

  if (nlu.intentId === 'query-vacant-parts') {
    const vacant = await queries.getVacantParts(targetWeekId);
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: vacant.length
          ? `Encontrei ${vacant.length} parte(s) pendente(s) ou vaga(s):`
          : 'Excelente! Todas as partes já possuem designados confirmados.',
        timestamp: now,
        intentId: nlu.intentId,
        cardType: vacant.length ? 'micro-panel' : undefined,
        cardData: vacant.length
          ? {
            type: 'vacant-parts-list',
            title: 'Partes Vagas / Pendentes',
            items: vacant,
          }
          : undefined,
      },
      updatedContext,
      spokenText: vacant.length ? `Existem ${vacant.length} partes vagas.` : 'Todas as partes estão preenchidas.',
    };
  }

  if (nlu.intentId === 'query-pending-weeks') {
    const pendingWeeks = await queries.getPendingWeeks();
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: pendingWeeks.length
          ? `Encontrei ${pendingWeeks.length} semana(s) futura(s) pendente(s) de aprovação ou publicação:`
          : 'Nenhuma semana futura está pendente de publicação no momento.',
        timestamp: now,
        intentId: nlu.intentId,
        cardType: pendingWeeks.length ? 'micro-panel' : undefined,
        cardData: pendingWeeks.length
          ? {
            type: 'pending-weeks-list',
            title: 'Semanas Pendentes',
            items: pendingWeeks.map((weekId) => ({ weekId })),
          }
          : undefined,
      },
      updatedContext,
      spokenText: pendingWeeks.length
        ? `Há ${pendingWeeks.length} semanas pendentes.`
        : 'Nenhuma semana pendente no momento.',
    };
  }

  // D. ESCRITAS COM PRÉVIA OBRIGATÓRIA
  if (nlu.intentId === 'register-absence') {
    const target = resolveTargetPerson(resolvedPerson, nlu.rawText, context, userContext);
    if (!target.id) {
      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: 'Não consegui identificar para qual publicador registrar a ausência. Informe o nome completo ou vincule seu perfil.',
          timestamp: now,
          intentId: nlu.intentId,
        },
        updatedContext,
        spokenText: 'Informe para qual publicador registrar a ausência.',
      };
    }

    const startDate = nlu.slots.startDate;
    const endDate = nlu.slots.endDate;
    const expandedDates = startDate ? expandAbsenceDateRange(startDate, endDate) : [];
    if (!startDate || !expandedDates.length) {
      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: `Informe o período exato da ausência (ex: "vou viajar de 18/11 a 25/11") para registrar na disponibilidade de ${target.name || 'seu perfil'}.`,
          timestamp: now,
          intentId: nlu.intentId,
        },
        updatedContext,
        spokenText: 'Informe a data inicial e final da ausência.',
      };
    }

    const personName = target.name || 'Você';
    const startBr = formatDateBr(startDate);
    const endBr = endDate ? formatDateBr(endDate) : undefined;
    const rangeLabel = endBr && endBr !== startBr ? `${startBr} a ${endBr}` : startBr;
    const expandedBr = expandedDates.map(formatDateBr);

    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: `Deseja registrar indisponibilidade para ${personName} (${expandedBr.length} data(s): ${expandedBr.join(', ')})?`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: 'action-preview',
        cardData: {
          title: 'Confirmar Registro de Ausência',
          description: `Período: ${rangeLabel} (${expandedBr.length} dia(s)) para ${personName}.`,
          requiresConfirmation: true,
          actionType: 'UPDATE_AVAILABILITY',
        },
      },
      updatedContext: {
        ...updatedContext,
        pendingAction: {
          intentId: nlu.intentId,
          title: 'Registro de Ausência',
          description: `${rangeLabel} (${personName})`,
          params: {
            personId: target.id,
            startDate,
            endDate,
            reason: nlu.slots.reason,
          },
          requiresConfirmation: true,
        },
      },
      spokenText: `Confirmar registro de ausência para ${personName}?`,
    };
  }

  if (nlu.intentId === 'approve-week-proposal') {
    const weekId = targetWeekId || availableWeeks[0];
    if (!weekId) {
      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: 'Não consegui identificar qual semana aprovar. Informe a data da semana (ex: "aprovar semana de 24/11").',
          timestamp: now,
          intentId: nlu.intentId,
        },
        updatedContext,
        spokenText: 'Informe qual semana deseja aprovar.',
      };
    }

    const weekBr = formatDateBr(weekId);
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: `Deseja aprovar as propostas pendentes da semana de ${weekBr}?`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: 'action-preview',
        cardData: {
          title: 'Aprovar Proposta da Semana',
          description: `As partes em PROPOSTA na semana de ${weekBr} passarão para DESIGNADA.`,
          requiresConfirmation: true,
          actionType: 'APPROVE_PROPOSAL',
        },
      },
      updatedContext: {
        ...updatedContext,
        pendingAction: {
          intentId: nlu.intentId,
          title: `Aprovar Semana ${weekBr}`,
          description: `Propostas da semana de ${weekBr} -> DESIGNADA`,
          params: { weekId },
          requiresConfirmation: true,
        },
      },
      spokenText: `Confirmar aprovação da semana de ${weekBr}?`,
    };
  }

  if (nlu.intentId === 'confirm-my-assignment' || nlu.intentId === 'refuse-my-assignment') {
    const isConfirm = nlu.intentId === 'confirm-my-assignment';
    if (!userContext.publisherId) {
      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: 'Vincule seu perfil de publicador no portal para confirmar ou recusar suas próprias designações.',
          timestamp: now,
          intentId: nlu.intentId,
        },
        updatedContext,
        spokenText: 'Vincule seu perfil de publicador primeiro.',
      };
    }

    const upcoming = await queries.getPublisherAssignments(userContext.publisherId, userContext.publisherName || 'Publicador', true);
    const partHint = nlu.slots.partType ? normText(nlu.slots.partType) : '';
    const candidate =
      upcoming.find(
        (a) =>
          (!explicitWeekId || a.weekId === explicitWeekId) &&
          (!partHint || normText(`${a.tipoParte} ${a.tituloParte || ''}`).includes(partHint)) &&
          (!isConfirm || a.portalResponse !== 'confirmed')
      ) || upcoming[0];

    if (!candidate) {
      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: isConfirm
            ? 'Você não possui designações pendentes de confirmação no momento.'
            : 'Você não possui designações futuras ativas para recusar.',
          timestamp: now,
          intentId: nlu.intentId,
        },
        updatedContext,
        spokenText: 'Nenhuma designação aplicável encontrada.',
      };
    }

    const label = `${candidate.tipoParte} (${formatDateBr(candidate.weekId)})`;
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: isConfirm
          ? `Deseja confirmar sua designação em ${label}?`
          : `Deseja recusar sua designação em ${label}?`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: 'action-preview',
        cardData: {
          title: isConfirm ? 'Confirmar Designação (S-89)' : 'Recusar Designação (S-89)',
          description: `${candidate.tituloParte || candidate.tipoParte} — Semana de ${formatDateBr(candidate.weekId)}. O mesmo webhook do Z-API será notificado.`,
          requiresConfirmation: true,
        },
      },
      updatedContext: {
        ...updatedContext,
        pendingAction: {
          intentId: nlu.intentId,
          title: isConfirm ? 'Confirmação de Designação' : 'Recusa de Designação',
          description: label,
          params: {
            partId: candidate.partId,
            publisherId: userContext.publisherId,
            reason: nlu.slots.reason,
          },
          requiresConfirmation: true,
        },
      },
      spokenText: isConfirm ? `Confirmar ${label}?` : `Recusar ${label}?`,
    };
  }

  if (nlu.intentId === 'reassign-part-assignee') {
    const weekId = targetWeekId || availableWeeks[0];
    const targetCandidateName = nlu.slots.newAssignee || nlu.slots.personName;
    const newPubRes = targetCandidateName ? resolvePublisher(targetCandidateName, allPublishers) : undefined;
    const newPub = resolvedPerson || newPubRes?.person;

    if (!weekId || !newPub || (!nlu.slots.partType && !nlu.slots.currentAssignee)) {
      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: 'Informe a semana, a parte (ou atual designado) e o novo publicador (ex: "trocar João por Pedro na leitura da próxima semana").',
          timestamp: now,
          intentId: nlu.intentId,
        },
        updatedContext,
        spokenText: 'Informe a parte, o novo publicador e a semana para reatribuição.',
      };
    }

    const weekBr = formatDateBr(weekId);
    const partLabel = nlu.slots.partType || `parte de ${nlu.slots.currentAssignee}`;
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: `Deseja designar ${newPub.name} para ${partLabel} na semana de ${weekBr}?`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: 'action-preview',
        cardData: {
          title: 'Designar / Substituir Parte',
          description: `${newPub.name} em ${partLabel} — Semana de ${weekBr} (com checagem S-38/gênero).`,
          requiresConfirmation: true,
          actionType: 'ASSIGN_PART',
        },
      },
      updatedContext: {
        ...updatedContext,
        pendingAction: {
          intentId: nlu.intentId,
          title: 'Reatribuição de Parte',
          description: `${newPub.name} (${partLabel})`,
          params: {
            weekId,
            partHint: nlu.slots.partType,
            newPublisherId: newPub.id,
            currentAssignee: nlu.slots.currentAssignee,
          },
          requiresConfirmation: true,
        },
      },
      spokenText: `Confirmar substituição para ${newPub.name}?`,
    };
  }

  if (nlu.intentId === 'reject-part-proposal') {
    const weekId = targetWeekId || availableWeeks[0];
    const partHint = nlu.slots.partType;
    const currentAssignee = resolvedPerson?.name || nlu.slots.currentAssignee;
    if (!weekId || (!partHint && !currentAssignee)) {
      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: 'Informe qual parte ou designado você deseja remover/rejeitar e a semana correspondente.',
          timestamp: now,
          intentId: nlu.intentId,
        },
        updatedContext,
        spokenText: 'Informe a parte e a semana.',
      };
    }

    const weekBr = formatDateBr(weekId);
    const targetLabel = partHint || currentAssignee || 'parte';
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: `Deseja rejeitar/remover a designação de "${targetLabel}" na semana de ${weekBr}?`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: 'action-preview',
        cardData: {
          title: 'Rejeitar Proposta / Remover Designado',
          description: `${targetLabel} retornará para o status PENDENTE na semana de ${weekBr}.`,
          requiresConfirmation: true,
          actionType: 'REJECT_PROPOSAL',
        },
      },
      updatedContext: {
        ...updatedContext,
        pendingAction: {
          intentId: nlu.intentId,
          title: 'Rejeitar Proposta',
          description: `${targetLabel} (${weekBr})`,
          params: { weekId, partHint, currentAssignee, reason: nlu.slots.reason },
          requiresConfirmation: true,
        },
      },
      spokenText: `Confirmar remoção de ${targetLabel}?`,
    };
  }

  if (nlu.intentId === 'generate-week' || nlu.intentId === 'clear-week' || nlu.intentId === 'complete-part') {
    const weekId = targetWeekId || availableWeeks[0];
    if (!weekId) {
      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: 'Não encontrei uma semana alvo na apostila. Informe a data da semana.',
          timestamp: now,
          intentId: nlu.intentId,
        },
        updatedContext,
        spokenText: 'Informe a semana alvo.',
      };
    }

    const weekBr = formatDateBr(weekId);
    const meta =
      nlu.intentId === 'generate-week'
        ? {
          title: `Gerar Designações — ${weekBr}`,
          description: `O motor S-38 preencherá partes vagas da semana de ${weekBr} como PROPOSTA.`,
          actionType: 'GENERATE_WEEK' as const,
        }
        : nlu.intentId === 'clear-week'
          ? {
            title: `Limpar Semana — ${weekBr}`,
            description: `Todas as designações da semana de ${weekBr} voltarão para PENDENTE.`,
            actionType: 'CLEAR_WEEK' as const,
          }
          : {
            title: `Concluir Semana/Parte — ${weekBr}`,
            description: `As partes${nlu.slots.partType ? ` (${nlu.slots.partType})` : ''} da semana de ${weekBr} serão marcadas como CONCLUÍDA.`,
            actionType: 'COMPLETE_PART' as const,
          };

    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: `Deseja executar: ${meta.title}?`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: 'action-preview',
        cardData: {
          title: meta.title,
          description: meta.description,
          requiresConfirmation: true,
          actionType: meta.actionType,
        },
      },
      updatedContext: {
        ...updatedContext,
        pendingAction: {
          intentId: nlu.intentId,
          title: meta.title,
          description: meta.description,
          params: { weekId, partHint: nlu.slots.partType },
          requiresConfirmation: true,
        },
      },
      spokenText: `Confirmar ${meta.title}?`,
    };
  }

  if (nlu.intentId === 'undo-last-action') {
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: 'Deseja desfazer a última alteração realizada nesta sessão do Conversa RVM?',
        timestamp: now,
        intentId: nlu.intentId,
        cardType: 'action-preview',
        cardData: {
          title: 'Desfazer Última Ação',
          description: 'Restaura o estado anterior dos registros modificados na última operação.',
          requiresConfirmation: true,
          actionType: 'UNDO_LAST',
        },
      },
      updatedContext: {
        ...updatedContext,
        pendingAction: {
          intentId: nlu.intentId,
          title: 'Desfazer Última Ação',
          description: 'Restauração do snapshot anterior',
          params: {},
          requiresConfirmation: true,
        },
      },
      spokenText: 'Confirmar desfazer a última ação?',
    };
  }

  if (nlu.intentId === 'manage-local-needs') {
    const themeMatch = nlu.rawText.match(/(?:tema|sobre|titulo)\s+["']?([^"']+?)["']?(?:\s+(?:para|com|na\s+fila|na\s+semana)\b|$)/i);
    const extractedTheme = themeMatch?.[1]?.trim() || nlu.rawText.replace(/^(?:adicionar|incluir|inserir|cadastrar|colocar)\s+/i, '').trim();
    const assigneeName = resolvedPerson?.name || 'A definir';

    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: `Deseja adicionar "${extractedTheme}" (Orador: ${assigneeName}) à Fila de Necessidades Locais?`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: 'action-preview',
        cardData: {
          title: 'Adicionar à Fila de Necessidades Locais',
          description: `Tema: ${extractedTheme} · Orador: ${assigneeName}${explicitWeekId ? ` · Semana: ${formatDateBr(explicitWeekId)}` : ''}`,
          requiresConfirmation: true,
          actionType: 'MANAGE_LOCAL_NEEDS',
        },
      },
      updatedContext: {
        ...updatedContext,
        pendingAction: {
          intentId: nlu.intentId,
          title: 'Fila de Necessidades Locais',
          description: `${extractedTheme} (${assigneeName})`,
          params: {
            theme: extractedTheme,
            assigneeName,
            weekId: explicitWeekId,
          },
          requiresConfirmation: true,
        },
      },
      spokenText: 'Confirmar inclusão na Fila de Necessidades Locais?',
    };
  }

  // Fallback honesto para intenções catalogadas ainda sem execução direta neste canal
  return {
    message: {
      id: messageId,
      sender: 'assistant',
      text: 'Esta operação específica ainda não possui execução direta por aqui. Você pode consultar designações, semanas vagas, histórico, pendências, abrir S-140/S-89, registrar ausências, aprovar semanas ou tirar dúvidas sobre regras do motor.',
      timestamp: now,
      intentId: nlu.intentId,
    },
    updatedContext,
    spokenText: 'Esta operação ainda não é executada diretamente por este chat.',
  };
}
