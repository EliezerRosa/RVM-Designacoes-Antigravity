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
import { documentPort } from '../ports/documentPort';
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
  actions?: Pick<typeof actionPort, 'registerAbsence' | 'approveWeekProposal'>;
  queries?: Pick<
    typeof queryPort,
    'getPublisherAssignments' | 'getWeekParts' | 'getVacantParts' | 'getLastParticipation' | 'getPendingWeeks'
  >;
  documents?: Pick<typeof documentPort, 'getS140ChronologicalList' | 'getS89ChronologicalList'>;
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
  if (nlu.intentId === 'explain-engine-rules' || nlu.intentId === 'explain-ranking') {
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

  // B. DOCUMENTOS (Carrossel Cronológico)
  if (nlu.intentId === 'view-s140') {
    const items = await documents.getS140ChronologicalList(targetWeekId, allPublishers);
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
      : { id: userContext.publisherId || undefined, name: userContext.publisherName || undefined, isSelf: Boolean(userContext.publisherId) };

    const items = await documents.getS89ChronologicalList(
      resolvedPerson?.id || (mentionsSelf(nlu.rawText) ? target.id : userContext.isAdmin ? undefined : target.id),
      targetWeekId,
      target.isSelf
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

  if (nlu.intentId === 'view-s4' || nlu.intentId === 'view-s1-consolidation') {
    const isS4 = nlu.intentId === 'view-s4';
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: isS4
          ? 'Os cartões individuais S-4 (Relatório de Campo) são gerenciados em segurança na aba de Relatórios Mensais ou via HG-Sync. Você pode consultar suas designações de reunião ou abrir o S-140/S-89 aqui.'
          : 'A consolidação mensal S-1 da congregação fica protegida sob permissões administrativas na aba de Relatórios Mensais.',
        timestamp: now,
        intentId: nlu.intentId,
      },
      updatedContext,
      spokenText: isS4
        ? 'Consulte seus relatórios S-4 na aba de Relatórios Mensais.'
        : 'O relatório consolidado S-1 fica na aba administrativa de relatórios.',
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
        text: 'A sincronização de relatórios mensais com o Hourglass (HG-Sync) roda localmente em módulo isolado na porta 4610 quando iniciada.',
        timestamp: now,
        intentId: nlu.intentId,
      },
      updatedContext,
      spokenText: 'O módulo HG Sync roda localmente na porta 4610 quando ativo.',
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
    const assignments = await queries.getPublisherAssignments(target.id, pubName, target.isSelf);
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: assignments.length
          ? `Encontrei ${assignments.length} designação(ões) para ${pubName}:`
          : `${pubName} não possui designações futuras registradas no momento.`,
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
        ? `${pubName} participou por último na semana ${history[0].weekId}.`
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

    const parts = await queries.getWeekParts(weekId);
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: parts.length
          ? `Designações da semana de ${weekId}:`
          : `Nenhuma parte encontrada para a semana de ${weekId}.`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: parts.length ? 'micro-panel' : undefined,
        cardData: parts.length
          ? {
            type: 'week-parts-list',
            title: `Semana de ${weekId}`,
            items: parts,
          }
          : undefined,
      },
      updatedContext,
      spokenText: parts.length
        ? `Exibindo ${parts.length} partes da semana de ${weekId}.`
        : `Nenhuma parte encontrada para ${weekId}.`,
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
    const rangeLabel = endDate && endDate !== startDate ? `${startDate} a ${endDate}` : startDate;

    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: `Deseja registrar indisponibilidade para ${personName} (${expandedDates.length} data(s): ${expandedDates.join(', ')})?`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: 'action-preview',
        cardData: {
          title: 'Confirmar Registro de Ausência',
          description: `Período: ${rangeLabel} (${expandedDates.length} dia(s)) para ${personName}.`,
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

    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: `Deseja aprovar as propostas pendentes da semana de ${weekId}?`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: 'action-preview',
        cardData: {
          title: 'Aprovar Proposta da Semana',
          description: `As partes em PROPOSTA na semana ${weekId} passarão para DESIGNADA.`,
          requiresConfirmation: true,
          actionType: 'APPROVE_PROPOSAL',
        },
      },
      updatedContext: {
        ...updatedContext,
        pendingAction: {
          intentId: nlu.intentId,
          title: `Aprovar Semana ${weekId}`,
          description: `Propostas da semana ${weekId} -> DESIGNADA`,
          params: { weekId },
          requiresConfirmation: true,
        },
      },
      spokenText: `Confirmar aprovação da semana de ${weekId}?`,
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
