/**
 * BriefingPort — Adaptador de Pendências e Eventos Futuros (Requisito 10)
 *
 * Coleta:
 * 1. Designações do usuário a cumprir e a confirmar (de qualquer natureza).
 * 2. Eventos especiais futuros da congregação (Assembleias, Congressos, Visita SC, Celebração).
 * 3. Prepara síntese falada em áudio (Speech) e texto para o micro-modal.
 */

import { supabase } from '../../../lib/supabase';
import type { UpcomingAssignmentView } from './queryPort';
import { queryPort } from './queryPort';

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
    const today = new Date().toISOString().split('T')[0];

    // 1. Buscar designações do publicador
    let assignmentsToConfirm: UpcomingAssignmentView[] = [];
    let assignmentsToFulfill: UpcomingAssignmentView[] = [];

    if (publisherId) {
      const allUpcoming = await queryPort.getPublisherAssignments(publisherId);
      assignmentsToConfirm = allUpcoming.filter((a) =>
        ['proposta', 'pendente', 'aguardando'].includes((a.status || '').toLowerCase())
      );
      assignmentsToFulfill = allUpcoming.filter((a) =>
        ['designada', 'confirmada', 'aprovada'].includes((a.status || '').toLowerCase())
      );
    }

    // 2. Buscar eventos futuros próximos (próximos 60 dias)
    let upcomingEvents: ConversaSpecialEvent[] = [];
    try {
      const { data, error } = await supabase
        .from('special_events')
        .select('*')
        .gte('start_date', today)
        .order('start_date', { ascending: true })
        .limit(3);

      if (!error && data) {
        upcomingEvents = data.map((row: any) => ({
          id: row.id,
          name: row.name || row.title || row.theme || 'Evento Especial',
          startDate: row.start_date || row.startDate || row.week || '',
          endDate: row.end_date || row.endDate,
          type: row.type || 'special_event',
          description: row.description || row.observation,
        }));
      }
    } catch (e) {
      console.warn('[BriefingPort] Erro ao carregar eventos especiais:', e);
    }

    return buildBriefingData(userName, assignmentsToConfirm, assignmentsToFulfill, upcomingEvents);
  },
};
