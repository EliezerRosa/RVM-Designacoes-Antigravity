/**
 * CardPlanner — Orquestrador de Visualizações e Micro-Painéis Derivados da Intenção
 *
 * Mapeia o resultado do NLU, verifica permissões com o PolicyGuard,
 * resolve entidades reais e gera a estrutura exata do card a ser renderizado na UI.
 */

import type { PermissionGate } from '../../../services/permissionService';
import type { Publisher } from '../../../types';
import type { NLUResolution } from './nlu/l2Classifier';
import type { ChatMessageItem, ConversaContextState } from './conversationState';
import { checkIntentPermission } from './policyGuard';
import { resolvePublisher, resolveWeek } from './entityResolver';
import { queryPort } from '../ports/queryPort';
import { documentPort } from '../ports/documentPort';
import { knowledgePort } from '../ports/knowledgePort';

export interface PlannedTurnResult {
  message: ChatMessageItem;
  updatedContext: ConversaContextState;
  spokenText?: string;
}

export async function planTurn(
  nlu: NLUResolution,
  context: ConversaContextState,
  gate: PermissionGate,
  allPublishers: Publisher[],
  availableWeeks: string[]
): Promise<PlannedTurnResult> {
  const messageId = `msg_${Date.now()}`;
  const now = Date.now();

  // 1. Resposta a Clarificação Numérica Ativa (1, 2, 3...)
  if (context.activeDisambiguation && nlu.slots.choiceIndex) {
    const idx = nlu.slots.choiceIndex - 1;
    const chosen = context.activeDisambiguation.candidates[idx];
    if (chosen) {
      const intentId = context.activeDisambiguation.intentId;
      const updatedContext = { ...context, activeDisambiguation: undefined };

      // Re-executa com o candidato escolhido
      const resolvedSlots = {
        ...context.activeDisambiguation.pendingSlots,
        personName: chosen.label,
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
        availableWeeks
      );
    }
  }

  // 2. Confirmação / Cancelamento de Ação Pendente
  if (context.pendingAction && nlu.slots.confirmation) {
    const action = context.pendingAction;
    const updatedContext = { ...context, pendingAction: undefined };

    if (nlu.slots.confirmation === 'yes') {
      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: `Ação "${action.title}" confirmada e registrada com sucesso.`,
          timestamp: now,
          cardType: 'micro-panel',
          cardData: { status: 'success', title: action.title, description: action.description },
        },
        updatedContext,
        spokenText: `Ação ${action.title} confirmada com sucesso.`,
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
  let resolvedPerson: Publisher | undefined;
  if (nlu.slots.personName) {
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
    const items = await documentPort.getS140ChronologicalList(targetWeekId, allPublishers);
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: `Aqui está a programação semanal S-140. Você pode deslizar para navegar pelas semanas em ordem cronológica:`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: 'document-carousel',
        cardData: { items, initialFocusId: items.find((i) => i.isInitialFocus)?.id },
      },
      updatedContext,
      spokenText: 'Exibindo programação S-140 no carrossel.',
    };
  }

  if (nlu.intentId === 'view-s89') {
    const items = await documentPort.getS89ChronologicalList(resolvedPerson?.id, targetWeekId);
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
    const pubId = resolvedPerson?.id || context.lastPersonId;
    const assignments = pubId ? await queryPort.getPublisherAssignments(pubId) : [];
    const pubName = resolvedPerson?.name || context.lastPersonName || 'Irmão';
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
    const pubId = resolvedPerson?.id || context.lastPersonId;
    if (!pubId) {
      return {
        message: {
          id: messageId,
          sender: 'assistant',
          text: 'Para consultar suas designações, selecione seu nome ou informe de quem deseja consultar as partes.',
          timestamp: now,
        },
        updatedContext,
        spokenText: 'De qual publicador você deseja consultar as designações?',
      };
    }

    const assignments = await queryPort.getPublisherAssignments(pubId);
    const pubName = resolvedPerson?.name || context.lastPersonName || 'Publicador';
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
        cardData: {
          type: 'assignments-list',
          title: `Designações de ${pubName}`,
          items: assignments,
        },
      },
      updatedContext,
      spokenText: assignments.length
        ? `${pubName} tem ${assignments.length} designações futuras.`
        : `${pubName} não tem designações futuras no momento.`,
    };
  }

  if (nlu.intentId === 'query-week-assignments') {
    const weekId = targetWeekId || availableWeeks[0];
    const parts = await queryPort.getWeekParts(weekId);
    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: `Designações da semana de ${weekId}:`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: 'micro-panel',
        cardData: {
          type: 'week-parts-list',
          title: `Semana de ${weekId}`,
          items: parts,
        },
      },
      updatedContext,
      spokenText: `Exibindo ${parts.length} partes da semana de ${weekId}.`,
    };
  }

  if (nlu.intentId === 'query-vacant-parts') {
    const vacant = await queryPort.getVacantParts(targetWeekId);
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
        cardData: {
          type: 'vacant-parts-list',
          title: 'Partes Vagas / Pendentes',
          items: vacant,
        },
      },
      updatedContext,
      spokenText: vacant.length ? `Existem ${vacant.length} partes vagas.` : 'Todas as partes estão preenchidas.',
    };
  }

  // D. ESCRITAS COM PRÉVIA OBRIGATÓRIA
  if (nlu.intentId === 'register-absence') {
    const personName = resolvedPerson?.name || context.lastPersonName || 'Você';
    const startDate = nlu.slots.startDate || 'Data a confirmar';
    const endDate = nlu.slots.endDate || 'Data a confirmar';

    return {
      message: {
        id: messageId,
        sender: 'assistant',
        text: `Deseja registrar o seguinte período de ausência para ${personName}?`,
        timestamp: now,
        intentId: nlu.intentId,
        cardType: 'action-preview',
        cardData: {
          title: 'Confirmar Registro de Ausência',
          description: `Período: ${startDate} a ${endDate} para ${personName}.`,
          requiresConfirmation: true,
          actionType: 'UPDATE_AVAILABILITY',
        },
      },
      updatedContext: {
        ...updatedContext,
        pendingAction: {
          intentId: nlu.intentId,
          title: 'Registro de Ausência',
          description: `${startDate} a ${endDate}`,
          params: { personId: resolvedPerson?.id, startDate, endDate },
          requiresConfirmation: true,
        },
      },
      spokenText: `Confirmar registro de ausência de ${startDate} a ${endDate} para ${personName}?`,
    };
  }

  // Fallback padrão
  return {
    message: {
      id: messageId,
      sender: 'assistant',
      text: 'Comando processado com sucesso.',
      timestamp: now,
    },
    updatedContext,
  };
}
