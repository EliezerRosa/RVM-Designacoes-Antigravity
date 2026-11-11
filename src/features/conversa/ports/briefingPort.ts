/**
 * BriefingPort — Adaptador de Pendências e Eventos Futuros
 *
 * Coleta:
 * 1. Designações reais do usuário a confirmar e a cumprir (usando status RVM + respostas do portal).
 * 2. Eventos especiais futuros via `specialEventService.getFutureEvents()` (`week` canônico).
 * 3. Prepara síntese falada em áudio (Speech) e texto para o micro-modal proativo.
 */

import type { UpcomingAssignmentView } from './queryPort';
import { queryPort } from './queryPort';
import { specialEventService } from '../../../services/specialEventService';

export interface ConversaSpecialEvent {
  id: string;
  name: string;
  startDate: string;
  endDate?: string;
  type?: string;
  description?: string;
}

export interface UserBriefingData {
  userName: string;
  hasPendingItems: boolean;
  assignmentsToConfirm: UpcomingAssignmentView[];
  assignmentsToFulfill: UpcomingAssignmentView[];
  upcomingEvents: ConversaSpecialEvent[];
  writtenGreeting: string;
  spokenSummary: string;
}

export function buildBriefingData(
  userName: string,
  assignmentsToConfirm: UpcomingAssignmentView[] = [],
  assignmentsToFulfill: UpcomingAssignmentView[] = [],
  upcomingEvents: ConversaSpecialEvent[] = []
): UserBriefingData {
  const hasPendingItems =
    assignmentsToConfirm.length > 0 || assignmentsToFulfill.length > 0 || upcomingEvents.length > 0;

  let writtenGreeting = `Olá, ${userName}! `;
  let spokenSummary = `Olá, ${userName}. `;

  if (assignmentsToConfirm.length > 0) {
    const plural = assignmentsToConfirm.length > 1;
    writtenGreeting += `Você tem ${assignmentsToConfirm.length} designação${plural ? 'ões' : ''} aguardando confirmação. `;
    spokenSummary += `Você tem ${assignmentsToConfirm.length} designação${plural ? 'ões' : ''} para confirmar. `;
  } else if (assignmentsToFulfill.length > 0) {
    writtenGreeting += `Você tem ${assignmentsToFulfill.length} designação a cumprir nas próximas reuniões. `;
    spokenSummary += `Suas próximas designações estão em dia. `;
  } else {
    writtenGreeting += `Tudo em dia com suas designações! Em que posso ajudar?`;
    spokenSummary += `Tudo em dia com suas designações. Como posso ajudar?`;
  }

  if (upcomingEvents.length > 0) {
    const nextEvent = upcomingEvents[0];
    const dateFormatted = nextEvent.startDate
      ? new Date(nextEvent.startDate + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      : '';
    writtenGreeting += `Lembre-se: ${nextEvent.name}${dateFormatted ? ` em ${dateFormatted}` : ''}.`;
    spokenSummary += `Próximo evento: ${nextEvent.name}.`;
  }

  return {
    userName,
    hasPendingItems,
    assignmentsToConfirm,
    assignmentsToFulfill,
    upcomingEvents,
    writtenGreeting: writtenGreeting.trim(),
    spokenSummary: spokenSummary.trim(),
  };
}

export const briefingPort = {
  /**
   * Constrói o briefing do usuário ativo para acolhimento inicial ou retorno de foco
   */
  async getUserBriefing(
    _userId: string,
    publisherId?: string | null,
    userName: string = 'Irmão'
  ): Promise<UserBriefingData> {
    let assignmentsToConfirm: UpcomingAssignmentView[] = [];
    let assignmentsToFulfill: UpcomingAssignmentView[] = [];

    if (publisherId) {
      const allUpcoming = await queryPort.getPublisherAssignments(publisherId, userName, true);
      assignmentsToConfirm = allUpcoming.filter((a) => {
        if (a.portalResponse === 'confirmed' || a.portalResponse === 'refused') return false;
        const st = (a.status || '').toLowerCase();
        return ['proposta', 'pendente', 'aguardando'].includes(st);
      });

      assignmentsToFulfill = allUpcoming.filter((a) => {
        if (a.portalResponse === 'refused') return false;
        if (a.portalResponse === 'confirmed') return true;
        const st = (a.status || '').toLowerCase();
        return ['designada', 'confirmada', 'aprovada'].includes(st);
      });
    }

    let upcomingEvents: ConversaSpecialEvent[] = [];
    try {
      const futureEvents = await specialEventService.getFutureEvents();
      upcomingEvents = futureEvents
        .filter((ev) => ev.approvalStatus !== 'REJECTED' && ev.approvalStatus !== 'REVOKED')
        .slice(0, 4)
        .map((ev) => {
          const template = specialEventService.getTemplateById(ev.templateId);
          return {
            id: ev.id,
            name: ev.theme || template?.name || 'Evento Especial',
            startDate: ev.week || '',
            type: ev.templateId,
            description: ev.observations || ev.observation,
          };
        });
    } catch (e) {
      console.warn('[BriefingPort] Falha ao carregar eventos futuros:', e);
    }

    return buildBriefingData(userName, assignmentsToConfirm, assignmentsToFulfill, upcomingEvents);
  },
};
