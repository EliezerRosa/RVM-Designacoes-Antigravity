/**
 * ActionPort — Adaptador de Ações e Escritas Reais com Revalidação
 *
 * - Confirmações / Recusas de designação usam as RPCs canônicas do portal
 *   (`create_confirmation_portal_token` + `submit_confirmation_portal_response`).
 * - Registro de ausências grava em `publisher.availability.exceptionDates`
 *   via `publisherAvailabilityService` + `record_availability_change`.
 * - Aprovação de semana atualiza propostas (`PROPOSTA -> DESIGNADA`) após
 *   revalidação fail-closed via `assert_agent_action`.
 */

import { supabase } from '../../../lib/supabase';
import { WorkbookStatus } from '../../../types';
import type { AgentActionType } from '../../../services/agentActionService';
import { api } from '../../../services/api';
import { publisherAvailabilityService } from '../../../services/publisherAvailabilityService';
import { withAvailabilityAuthor } from '../../../services/availabilityAuthor';
import { toLocalISODate } from '../../../utils/dateUtils';
import { formatDateBr } from './documentPort';

export interface ActionExecutionResult {
  success: boolean;
  message: string;
  actionType: AgentActionType | 'CONFIRM_ASSIGNMENT' | 'REFUSE_ASSIGNMENT';
  details?: Record<string, unknown>;
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const MAX_ABSENCE_SPAN_DAYS = 90;

function parseSingleDate(token: string, now: Date): Date | null {
  const clean = token.trim();
  if (!clean) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [y, m, d] = clean.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const fullBr = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (fullBr) {
    const dt = new Date(Number(fullBr[3]), Number(fullBr[2]) - 1, Number(fullBr[1]));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const dayMonth = clean.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (dayMonth) {
    const d = Number(dayMonth[1]);
    const m = Number(dayMonth[2]);
    let year = now.getFullYear();
    const candidate = new Date(year, m - 1, d);
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (candidate < todayMidnight) {
      year += 1;
    }
    return new Date(year, m - 1, d);
  }

  const dayOnly = clean.replace(/^dia-/i, '');
  if (/^\d{1,2}$/.test(dayOnly)) {
    const d = Number(dayOnly);
    let month = now.getMonth();
    let year = now.getFullYear();
    if (d < now.getDate()) {
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
    return new Date(year, month, d);
  }

  return null;
}

/**
 * Expande expressão simples ou intervalo de datas (ex: "18", "25") em lista ISO YYYY-MM-DD[]
 */
export function expandAbsenceDateRange(
  startDate?: string,
  endDate?: string,
  now: Date = new Date()
): string[] {
  if (!startDate) return [];
  const start = parseSingleDate(startDate, now);
  if (!start) return [];

  if (!endDate || endDate === 'Data a confirmar') {
    return [toLocalISODate(start)];
  }

  let end = parseSingleDate(endDate, now);
  if (!end) return [toLocalISODate(start)];

  if (end < start && /^\d{1,2}$/.test(endDate.trim())) {
    end = new Date(start.getFullYear(), start.getMonth() + 1, Number(endDate.trim()));
  }
  if (end < start) {
    return [toLocalISODate(start)];
  }

  const dates: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  for (let i = 0; i < MAX_ABSENCE_SPAN_DAYS && cursor <= end; i++) {
    dates.push(toLocalISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export const actionPort = {
  /**
   * Revalida a permissão de escrita no servidor
   */
  async assertServerPermission(actionType: AgentActionType): Promise<string | null> {
    try {
      const { error } = await supabase.rpc('assert_agent_action', { p_action: actionType });
      if (!error) return null;
      const denied = error.code === '42501' || /agent_action_denied/i.test(error.message || '');
      return denied
        ? `Operação "${actionType}" negada pelo servidor para o seu perfil.`
        : `Erro ao validar permissão no servidor: ${error.message}`;
    } catch (e: unknown) {
      return `Falha de conexão ao validar ação no servidor: ${getErrorMessage(e)}`;
    }
  },

  /**
   * Confirma aceite de uma designação do próprio publicador via portal RPC
   */
  async confirmAssignment(partId: string, publisherId: string): Promise<ActionExecutionResult> {
    if (!partId || !publisherId) {
      return {
        success: false,
        actionType: 'CONFIRM_ASSIGNMENT',
        message: 'Identificador da parte ou do publicador ausente para confirmação.',
      };
    }

    try {
      const { data: tokenData, error: tokenError } = await supabase.rpc('create_confirmation_portal_token', {
        p_part_id: partId,
        p_publisher_id: publisherId,
      });
      if (tokenError) throw tokenError;

      const tokenResult = (tokenData && typeof tokenData === 'object' ? tokenData : {}) as {
        success?: boolean;
        token?: string;
        error?: string;
      };
      if (!tokenResult.success || !tokenResult.token) {
        return {
          success: false,
          actionType: 'CONFIRM_ASSIGNMENT',
          message: tokenResult.error || 'Não foi possível gerar token de confirmação.',
        };
      }

      const { data: submitData, error: submitError } = await supabase.rpc('submit_confirmation_portal_response', {
        p_part_id: partId,
        p_publisher_id: publisherId,
        p_token: tokenResult.token,
        p_accept: true,
        p_reason: null,
      });
      if (submitError) throw submitError;

      const submitResult = (submitData && typeof submitData === 'object' ? submitData : {}) as {
        success?: boolean;
        error?: string;
      };
      if (!submitResult.success) {
        return {
          success: false,
          actionType: 'CONFIRM_ASSIGNMENT',
          message: submitResult.error || 'Falha ao confirmar a designação.',
        };
      }

      return {
        success: true,
        actionType: 'CONFIRM_ASSIGNMENT',
        message: 'Designação confirmada com sucesso!',
        details: { partId, publisherId },
      };
    } catch (e: unknown) {
      return {
        success: false,
        actionType: 'CONFIRM_ASSIGNMENT',
        message: `Erro ao confirmar designação: ${getErrorMessage(e)}`,
      };
    }
  },

  /**
   * Registra recusa de uma designação via portal RPC com motivo explícito
   */
  async refuseAssignment(
    partId: string,
    publisherId: string,
    reason: string
  ): Promise<ActionExecutionResult> {
    const cleanReason = (reason || '').trim();
    if (!partId || !publisherId) {
      return {
        success: false,
        actionType: 'REFUSE_ASSIGNMENT',
        message: 'Identificador da parte ou do publicador ausente para recusa.',
      };
    }
    if (!cleanReason) {
      return {
        success: false,
        actionType: 'REFUSE_ASSIGNMENT',
        message: 'Por favor, informe brevemente o motivo de não poder participar.',
      };
    }

    try {
      const { data: tokenData, error: tokenError } = await supabase.rpc('create_confirmation_portal_token', {
        p_part_id: partId,
        p_publisher_id: publisherId,
      });
      if (tokenError) throw tokenError;

      const tokenResult = (tokenData && typeof tokenData === 'object' ? tokenData : {}) as {
        success?: boolean;
        token?: string;
        error?: string;
      };
      if (!tokenResult.success || !tokenResult.token) {
        return {
          success: false,
          actionType: 'REFUSE_ASSIGNMENT',
          message: tokenResult.error || 'Não foi possível gerar token para registrar recusa.',
        };
      }

      const { data: submitData, error: submitError } = await supabase.rpc('submit_confirmation_portal_response', {
        p_part_id: partId,
        p_publisher_id: publisherId,
        p_token: tokenResult.token,
        p_accept: false,
        p_reason: cleanReason,
      });
      if (submitError) throw submitError;

      const submitResult = (submitData && typeof submitData === 'object' ? submitData : {}) as {
        success?: boolean;
        error?: string;
      };
      if (!submitResult.success) {
        return {
          success: false,
          actionType: 'REFUSE_ASSIGNMENT',
          message: submitResult.error || 'Falha ao registrar recusa.',
        };
      }

      return {
        success: true,
        actionType: 'REFUSE_ASSIGNMENT',
        message: 'Recusa registrada. Os responsáveis pelo quadro serão notificados para providenciar substituição.',
        details: { partId, publisherId, reason: cleanReason },
      };
    } catch (e: unknown) {
      return {
        success: false,
        actionType: 'REFUSE_ASSIGNMENT',
        message: `Erro ao registrar recusa: ${getErrorMessage(e)}`,
      };
    }
  },

  /**
   * Registra período de ausência em `publisher.availability.exceptionDates`
   */
  async registerAbsence(
    publisherId: string,
    startDate: string,
    endDate?: string,
    reason: string = 'Ausência informada via Conversa',
    actorLabel: string = 'Conversa IA'
  ): Promise<ActionExecutionResult> {
    void reason;
    const actionType: AgentActionType = 'UPDATE_AVAILABILITY';
    const permError = await this.assertServerPermission(actionType);
    if (permError) {
      return { success: false, message: permError, actionType };
    }

    const datesToBlock = expandAbsenceDateRange(startDate, endDate);
    if (!datesToBlock.length) {
      return {
        success: false,
        actionType,
        message: 'Não consegui converter as datas informadas para um período válido (use DD/MM ou DD/MM/AAAA).',
      };
    }

    try {
      const pub = await api.loadPublisherById(publisherId);
      if (!pub) {
        return { success: false, message: 'Publicador não encontrado para registro de ausência.', actionType };
      }

      const result = await withAvailabilityAuthor(
        { source: 'admin_agent', authorLabel: actorLabel, authorId: null },
        () => publisherAvailabilityService.updateAvailability(pub, datesToBlock)
      );

      const formattedDates = datesToBlock.map(formatDateBr);
      return {
        success: true,
        message: `Indisponibilidade registrada para ${pub.name} em ${formattedDates.length} data(s): ${formattedDates.join(', ')}.`,
        actionType,
        details: { publisherId, dates: datesToBlock, totalBlockedDates: result.totalBlockedDates },
      };
    } catch (e: unknown) {
      return { success: false, message: `Falha ao registrar ausência: ${getErrorMessage(e)}`, actionType };
    }
  },

  /**
   * Aprova propostas de uma semana (PROPOSTA -> DESIGNADA)
   */
  async approveWeekProposal(weekId: string, approvedById?: string): Promise<ActionExecutionResult> {
    const actionType: AgentActionType = 'APPROVE_PROPOSAL';
    const permError = await this.assertServerPermission(actionType);
    if (permError) {
      return { success: false, message: permError, actionType };
    }

    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('workbook_parts')
        .update({
          status: WorkbookStatus.DESIGNADA,
          approved_by_id: approvedById || 'conversa-ia',
          approved_at: nowIso,
          status_changed_at: nowIso,
          updated_at: nowIso,
          needs_reassignment: false,
        })
        .eq('week_id', weekId)
        .eq('status', WorkbookStatus.PROPOSTA)
        .select('id');

      if (error) {
        return { success: false, message: `Erro ao aprovar semana: ${error.message}`, actionType };
      }

      const count = Array.isArray(data) ? data.length : 0;
      const weekBr = formatDateBr(weekId);
      return {
        success: true,
        message:
          count > 0
            ? `Semana de ${weekBr} aprovada! ${count} parte(s) confirmadas para designação.`
            : `Nenhuma parte estava com status PROPOSTA na semana de ${weekBr}.`,
        actionType,
        details: { weekId, approvedCount: count },
      };
    } catch (e: unknown) {
      return { success: false, message: `Falha na aprovação: ${getErrorMessage(e)}`, actionType };
    }
  },
};
