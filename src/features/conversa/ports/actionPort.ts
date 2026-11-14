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
import { EnumFuncao, HistoryStatus, WorkbookStatus, type HistoryRecord, type Publisher } from '../../../types';
import type { AgentActionType } from '../../../services/agentActionService';
import { api } from '../../../services/api';
import { mapDbToWorkbookPart } from '../../../services/workbookService';
import { buildEligibilityContext, checkEligibility } from '../../../services/eligibilityService';
import { getRankedEligibleForPart } from '../../../services/rankedEligibleService';
import { getModalidadeFromTipo } from '../../../constants/mappings';
import { isManuallyAssignable } from '../../../constants/s140Template';
import { publisherAvailabilityService } from '../../../services/publisherAvailabilityService';
import { withAvailabilityAuthor } from '../../../services/availabilityAuthor';
import { toLocalISODate } from '../../../utils/dateUtils';
import { formatDateBr } from './documentPort';

interface UndoRowSnapshot {
  id: string;
  status: string;
  resolved_publisher_id: string | null;
  resolved_publisher_name: string | null;
  raw_publisher_name: string | null;
  approved_by_id: string | null;
  approved_at: string | null;
  completed_at: string | null;
  rejected_reason: string | null;
  is_manual_override: boolean;
  is_substitution: boolean;
  substituted_publisher_name: string | null;
}

const conversaUndoStack: Array<{ label: string; rows: UndoRowSnapshot[] }> = [];

function captureUndoRows(rows: Record<string, unknown>[]): UndoRowSnapshot[] {
  return rows.map((r) => ({
    id: String(r.id),
    status: String(r.status || WorkbookStatus.PENDENTE),
    resolved_publisher_id: (r.resolved_publisher_id as string) || null,
    resolved_publisher_name: (r.resolved_publisher_name as string) || null,
    raw_publisher_name: (r.raw_publisher_name as string) || null,
    approved_by_id: (r.approved_by_id as string) || null,
    approved_at: (r.approved_at as string) || null,
    completed_at: (r.completed_at as string) || null,
    rejected_reason: (r.rejected_reason as string) || null,
    is_manual_override: Boolean(r.is_manual_override),
    is_substitution: Boolean(r.is_substitution),
    substituted_publisher_name: (r.substituted_publisher_name as string) || null,
  }));
}

function normStr(val?: string | null): string {
  return String(val || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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
   * Dispara o mesmo webhook da Z-API (`zapi-smart-webhook`) correspondente
   * aos botões interativos do S-89 (`CONFIRMAR:<partId>` e `RECUSAR:<partId>`).
   */
  async triggerZApiSmartWebhook(
    intent: 'CONFIRMAR' | 'RECUSAR',
    partId: string,
    publisherId: string,
    reason?: string
  ): Promise<{ invoked: boolean; success: boolean; hasPhone: boolean; error?: string }> {
    try {
      let phone = '';
      try {
        const pub = await api.loadPublisherById(publisherId);
        phone = pub?.phone?.trim() || '';
      } catch {
        // fallback silencioso
      }

      if (!phone && typeof supabase.from === 'function') {
        try {
          const { data: pubRow } = await supabase
            .from('publishers')
            .select('data')
            .eq('id', publisherId)
            .maybeSingle();
          const rawData = (pubRow as { data?: { phone?: string; contact_phone?: string } } | null)?.data;
          phone = (rawData?.phone || rawData?.contact_phone || '').trim();
        } catch {
          // fallback silencioso
        }
      }

      const buttonId = `${intent}:${partId}`;
      const buttonLabel = intent === 'CONFIRMAR' ? '✅ Confirmar' : '❌ Não Poderei';
      const textMessage = intent === 'RECUSAR' && reason?.trim() ? reason.trim() : buttonLabel;
      const messageId = `conversa-s89-${intent.toLowerCase()}-${partId}-${Date.now()}`;

      const payload = {
        phone,
        senderPhone: phone,
        fromMe: false,
        isGroup: false,
        messageId,
        buttonsResponseMessage: {
          buttonId,
          message: buttonLabel,
        },
        text: {
          message: textMessage,
        },
        message: textMessage,
      };

      if (!supabase.functions || typeof supabase.functions.invoke !== 'function') {
        return { invoked: false, success: false, hasPhone: Boolean(phone), error: 'Edge Functions indisponíveis.' };
      }

      const { data, error } = await supabase.functions.invoke('zapi-smart-webhook', {
        body: payload,
      });

      if (error) {
        return { invoked: true, success: false, hasPhone: Boolean(phone), error: error.message };
      }

      const resObj = (data && typeof data === 'object' ? data : {}) as {
        success?: boolean;
        error?: string;
      };
      return {
        invoked: true,
        success: Boolean(phone) && resObj.success !== false,
        hasPhone: Boolean(phone),
        error: resObj.error,
      };
    } catch (e: unknown) {
      return {
        invoked: true,
        success: false,
        hasPhone: false,
        error: getErrorMessage(e),
      };
    }
  },

  /**
   * Confirma aceite de uma designação do próprio publicador disparando o webhook Z-API
   * (`CONFIRMAR:<partId>`) e sincronizando com o portal RPC.
   */
  async confirmAssignment(partId: string, publisherId: string): Promise<ActionExecutionResult> {
    if (!partId || !publisherId) {
      return {
        success: false,
        actionType: 'CONFIRM_ASSIGNMENT',
        message: 'Identificador da parte ou do publicador ausente para confirmação.',
      };
    }

    const webhookRes = await actionPort.triggerZApiSmartWebhook('CONFIRMAR', partId, publisherId);

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
        if (webhookRes.success) {
          return {
            success: true,
            actionType: 'CONFIRM_ASSIGNMENT',
            message: 'Designação confirmada com sucesso!',
            details: { partId, publisherId, webhookTriggered: true },
          };
        }
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
      if (!submitResult.success && !webhookRes.success) {
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
        details: { partId, publisherId, webhookTriggered: webhookRes.invoked },
      };
    } catch (e: unknown) {
      if (webhookRes.success) {
        return {
          success: true,
          actionType: 'CONFIRM_ASSIGNMENT',
          message: 'Designação confirmada com sucesso!',
          details: { partId, publisherId, webhookTriggered: true },
        };
      }
      return {
        success: false,
        actionType: 'CONFIRM_ASSIGNMENT',
        message: `Erro ao confirmar designação: ${getErrorMessage(e)}`,
      };
    }
  },

  /**
   * Registra recusa de uma designação disparando o webhook Z-API (`RECUSAR:<partId>`)
   * e garantindo fallback via portal RPC.
   */
  async refuseAssignment(
    partId: string,
    publisherId: string,
    reason?: string
  ): Promise<ActionExecutionResult> {
    const cleanReason = (reason || '').trim() || 'Não poderei realizar a designação (informado via S-89).';
    if (!partId || !publisherId) {
      return {
        success: false,
        actionType: 'REFUSE_ASSIGNMENT',
        message: 'Identificador da parte ou do publicador ausente para recusa.',
      };
    }

    const webhookRes = await actionPort.triggerZApiSmartWebhook('RECUSAR', partId, publisherId, cleanReason);
    if (webhookRes.success && webhookRes.hasPhone) {
      return {
        success: true,
        actionType: 'REFUSE_ASSIGNMENT',
        message: 'Recusa registrada. Os responsáveis pelo quadro serão notificados para providenciar substituição.',
        details: { partId, publisherId, reason: cleanReason, webhookTriggered: true },
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
        details: { partId, publisherId, reason: cleanReason, webhookTriggered: webhookRes.invoked },
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
    const permError = await actionPort.assertServerPermission(actionType);
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
    const permError = await actionPort.assertServerPermission(actionType);
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

  /**
   * Designa ou substitui o publicador de uma parte específica após validação S-38 / gênero / disponibilidade
   */
  async assignOrReplacePart(
    weekId: string,
    partHint: string | undefined,
    newPublisher: Publisher,
    allPublishers: Publisher[],
    currentPublisherName?: string,
    isSubstitution = true
  ): Promise<ActionExecutionResult> {
    const actionType: AgentActionType = 'ASSIGN_PART';
    const permError = await actionPort.assertServerPermission(actionType);
    if (permError) {
      return { success: false, message: permError, actionType };
    }

    try {
      const { data: rows, error: fetchError } = await supabase
        .from('workbook_parts')
        .select('*')
        .eq('week_id', weekId)
        .order('seq', { ascending: true });
      if (fetchError) {
        return { success: false, message: `Erro ao consultar partes da semana: ${fetchError.message}`, actionType };
      }

      const rawRows = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
      const parts = rawRows.map(mapDbToWorkbookPart);
      const normPart = normStr(partHint);
      const normCurr = normStr(currentPublisherName);

      const targetIndex = parts.findIndex((p) => {
        if (p.isChairmanDerived || p.status === WorkbookStatus.CANCELADA) return false;
        if (normCurr) {
          const assigned = normStr(p.resolvedPublisherName || p.rawPublisherName);
          if (assigned.includes(normCurr) || normCurr.includes(assigned)) {
            if (!normPart) return true;
          }
        }
        if (normPart) {
          return (
            normStr(p.tipoParte).includes(normPart) ||
            normStr(p.tituloParte).includes(normPart) ||
            normStr(p.modalidade).includes(normPart)
          );
        }
        return false;
      });

      if (targetIndex < 0) {
        return {
          success: false,
          message: `Não encontrei a parte solicitada na semana de ${formatDateBr(weekId)}.`,
          actionType,
        };
      }

      const targetPart = parts[targetIndex];
      const targetRow = rawRows[targetIndex];
      const modalidade = targetPart.modalidade || getModalidadeFromTipo(targetPart.tipoParte, targetPart.section);
      const funcao = targetPart.funcao === 'Ajudante' ? EnumFuncao.AJUDANTE : EnumFuncao.TITULAR;
      const ctx = buildEligibilityContext(targetPart, parts, allPublishers);
      const elig = checkEligibility(newPublisher, modalidade as never, funcao, ctx);
      if (!elig.eligible) {
        return {
          success: false,
          message: `Bloqueado pelas regras teocráticas: ${newPublisher.name} não é elegível para "${targetPart.tituloParte || targetPart.tipoParte}" (${elig.reason}).`,
          actionType,
        };
      }

      conversaUndoStack.push({
        label: `Designação de ${newPublisher.name} em ${targetPart.tituloParte || targetPart.tipoParte}`,
        rows: captureUndoRows([targetRow]),
      });

      const previousName = targetPart.resolvedPublisherName || targetPart.rawPublisherName || null;
      const nowIso = new Date().toISOString();
      const { error: updError } = await supabase
        .from('workbook_parts')
        .update({
          resolved_publisher_id: newPublisher.id,
          resolved_publisher_name: newPublisher.name,
          raw_publisher_name: newPublisher.name,
          status: WorkbookStatus.DESIGNADA,
          is_manual_override: true,
          ...(isSubstitution && previousName
            ? { is_substitution: true, substituted_publisher_name: previousName }
            : {}),
          status_changed_at: nowIso,
          updated_at: nowIso,
          needs_reassignment: false,
        })
        .eq('id', targetPart.id);

      if (updError) {
        return { success: false, message: `Erro ao atualizar designação: ${updError.message}`, actionType };
      }

      return {
        success: true,
        message: previousName
          ? `Substituição concluída na semana de ${formatDateBr(weekId)}: "${targetPart.tituloParte || targetPart.tipoParte}" passou de ${previousName} para ${newPublisher.name}.`
          : `Designação concluída na semana de ${formatDateBr(weekId)}: ${newPublisher.name} em "${targetPart.tituloParte || targetPart.tipoParte}".`,
        actionType,
        details: { weekId, partId: targetPart.id, newPublisherId: newPublisher.id },
      };
    } catch (e: unknown) {
      return { success: false, message: `Falha ao atualizar parte: ${getErrorMessage(e)}`, actionType };
    }
  },

  /**
   * Rejeita ou remove uma proposta/designação retornando a parte para PENDENTE
   */
  async rejectPartProposal(
    weekId: string,
    partHint?: string,
    currentPublisherName?: string,
    reason?: string
  ): Promise<ActionExecutionResult> {
    const actionType: AgentActionType = 'REJECT_PROPOSAL';
    const permError = await actionPort.assertServerPermission(actionType);
    if (permError) {
      return { success: false, message: permError, actionType };
    }

    try {
      const { data: rows, error: fetchError } = await supabase
        .from('workbook_parts')
        .select('*')
        .eq('week_id', weekId);
      if (fetchError) {
        return { success: false, message: `Erro ao consultar partes: ${fetchError.message}`, actionType };
      }

      const rawRows = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
      const parts = rawRows.map(mapDbToWorkbookPart);
      const normPart = normStr(partHint);
      const normCurr = normStr(currentPublisherName);

      const targetIndex = parts.findIndex((p) => {
        if (p.isChairmanDerived) return false;
        if (normPart && (normStr(p.tipoParte).includes(normPart) || normStr(p.tituloParte).includes(normPart))) {
          return true;
        }
        if (normCurr) {
          const assigned = normStr(p.resolvedPublisherName || p.rawPublisherName);
          return Boolean(assigned && assigned.includes(normCurr));
        }
        return false;
      });

      if (targetIndex < 0) {
        return { success: false, message: `Nenhuma parte correspondente encontrada na semana de ${formatDateBr(weekId)}.`, actionType };
      }

      const targetPart = parts[targetIndex];
      conversaUndoStack.push({
        label: `Remoção da designação em ${targetPart.tituloParte || targetPart.tipoParte}`,
        rows: captureUndoRows([rawRows[targetIndex]]),
      });

      const nowIso = new Date().toISOString();
      const { error: updError } = await supabase
        .from('workbook_parts')
        .update({
          status: WorkbookStatus.PENDENTE,
          resolved_publisher_id: null,
          resolved_publisher_name: null,
          raw_publisher_name: '',
          rejected_reason: reason || 'Rejeitado via Conversa RVM',
          status_changed_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', targetPart.id);

      if (updError) {
        return { success: false, message: `Erro ao rejeitar proposta: ${updError.message}`, actionType };
      }

      return {
        success: true,
        message: `Designação de "${targetPart.tituloParte || targetPart.tipoParte}" na semana de ${formatDateBr(weekId)} retornada para PENDENTE.`,
        actionType,
        details: { weekId, partId: targetPart.id },
      };
    } catch (e: unknown) {
      return { success: false, message: `Falha ao rejeitar proposta: ${getErrorMessage(e)}`, actionType };
    }
  },

  /**
   * Gera propostas automáticas de designação para partes vagas da semana (M-0..M-12 via rankedEligibleService)
   */
  async generateWeekDesignations(weekId: string, allPublishers: Publisher[]): Promise<ActionExecutionResult> {
    const actionType: AgentActionType = 'GENERATE_WEEK';
    const permError = await actionPort.assertServerPermission(actionType);
    if (permError) {
      return { success: false, message: permError, actionType };
    }

    try {
      const [{ data: weekRows, error: weekError }, { data: histRows }, { data: refusalRows }] = await Promise.all([
        supabase.from('workbook_parts').select('*').eq('week_id', weekId).order('seq', { ascending: true }),
        supabase.from('workbook_parts').select('*').neq('status', WorkbookStatus.CANCELADA).order('week_id', { ascending: false }).limit(250),
        supabase.from('refusal_logs').select('publisher_name').eq('week_id', weekId),
      ]);

      if (weekError) {
        return { success: false, message: `Erro ao carregar semana ${formatDateBr(weekId)}: ${weekError.message}`, actionType };
      }

      const rawRows = (Array.isArray(weekRows) ? weekRows : []) as Record<string, unknown>[];
      const parts = rawRows.map(mapDbToWorkbookPart);
      const historyRecords: HistoryRecord[] = (Array.isArray(histRows) ? histRows : [])
        .map((row) => mapDbToWorkbookPart(row as Record<string, unknown>))
        .filter((p) => !p.isChairmanDerived && p.tipoParte !== 'Cântico' && Boolean(p.resolvedPublisherName || p.rawPublisherName))
        .map((p) => ({
          id: p.id,
          weekId: p.weekId,
          weekDisplay: p.weekDisplay,
          date: p.date || p.weekId,
          section: p.section,
          tipoParte: p.tipoParte,
          modalidade: p.modalidade || getModalidadeFromTipo(p.tipoParte, p.section),
          tituloParte: p.tituloParte,
          descricaoParte: p.descricaoParte,
          detalhesParte: p.detalhesParte,
          seq: p.seq,
          funcao: p.funcao,
          duracao: parseInt(p.duracao, 10) || 5,
          horaInicio: p.horaInicio,
          horaFim: p.horaFim,
          rawPublisherName: p.resolvedPublisherName || p.rawPublisherName,
          resolvedPublisherId: p.resolvedPublisherId,
          resolvedPublisherName: p.resolvedPublisherName,
          status: HistoryStatus.VALIDATED,
          importSource: 'Manual',
          importBatchId: 'conversa-gen',
          createdAt: p.createdAt,
        }));

      const excludedNames = (Array.isArray(refusalRows) ? refusalRows : [])
        .map((r) => String((r as { publisher_name?: string }).publisher_name || '').trim())
        .filter(Boolean);

      const candidates = parts
        .filter(
          (p) =>
            !p.isChairmanDerived &&
            p.status !== WorkbookStatus.CANCELADA &&
            isManuallyAssignable(p.tipoParte, p.modalidade) &&
            !p.resolvedPublisherId &&
            !p.rawPublisherName
        )
        .sort((a, b) => {
          const aPres = normStr(a.tipoParte).includes('presidente') ? 0 : 1;
          const bPres = normStr(b.tipoParte).includes('presidente') ? 0 : 1;
          if (aPres !== bPres) return aPres - bPres;
          return a.seq - b.seq;
        });

      if (!candidates.length) {
        return {
          success: true,
          message: `Todas as partes designáveis da semana de ${formatDateBr(weekId)} já estão preenchidas.`,
          actionType,
          details: { weekId, assignedCount: 0 },
        };
      }

      const touchedRows: Record<string, unknown>[] = [];
      const updates: Array<{ id: string; pub: Publisher }> = [];
      for (const part of candidates) {
        const res = getRankedEligibleForPart(part, parts, allPublishers, historyRecords, {
          excludedPublisherNames: excludedNames,
        });
        const top = res.eligibleCandidates[0];
        if (!top) continue;

        part.resolvedPublisherId = top.publisher.id;
        part.resolvedPublisherName = top.publisher.name;
        part.rawPublisherName = top.publisher.name;
        part.status = WorkbookStatus.PROPOSTA;
        updates.push({ id: part.id, pub: top.publisher });
        const origRow = rawRows.find((r) => r.id === part.id);
        if (origRow) touchedRows.push(origRow);
      }

      if (touchedRows.length) {
        conversaUndoStack.push({
          label: `Geração automática da semana ${formatDateBr(weekId)}`,
          rows: captureUndoRows(touchedRows),
        });
      }

      const nowIso = new Date().toISOString();
      await Promise.all(
        updates.map(({ id, pub }) =>
          supabase
            .from('workbook_parts')
            .update({
              resolved_publisher_id: pub.id,
              resolved_publisher_name: pub.name,
              raw_publisher_name: pub.name,
              status: WorkbookStatus.PROPOSTA,
              status_changed_at: nowIso,
              updated_at: nowIso,
              needs_reassignment: false,
            })
            .eq('id', id)
        )
      );

      return {
        success: true,
        message: `Semana de ${formatDateBr(weekId)} gerada! ${updates.length} parte(s) receberam propostas determinísticas (S-38).`,
        actionType,
        details: { weekId, assignedCount: updates.length },
      };
    } catch (e: unknown) {
      return { success: false, message: `Falha ao gerar semana: ${getErrorMessage(e)}`, actionType };
    }
  },

  /**
   * Limpa designações da semana retornando para PENDENTE
   */
  async clearWeekDesignations(weekId: string): Promise<ActionExecutionResult> {
    const actionType: AgentActionType = 'CLEAR_WEEK';
    const permError = await actionPort.assertServerPermission(actionType);
    if (permError) {
      return { success: false, message: permError, actionType };
    }

    try {
      const { data: rows, error: fetchError } = await supabase
        .from('workbook_parts')
        .select('*')
        .eq('week_id', weekId)
        .neq('is_chairman_derived', true);
      if (fetchError) {
        return { success: false, message: `Erro ao consultar semana: ${fetchError.message}`, actionType };
      }

      const rawRows = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
      const assigned = rawRows.filter((r) => Boolean(r.resolved_publisher_id || r.raw_publisher_name));
      if (!assigned.length) {
        return {
          success: true,
          message: `A semana de ${formatDateBr(weekId)} já está sem designações manuais.`,
          actionType,
          details: { weekId, clearedCount: 0 },
        };
      }

      conversaUndoStack.push({
        label: `Limpeza da semana ${formatDateBr(weekId)}`,
        rows: captureUndoRows(assigned),
      });

      const nowIso = new Date().toISOString();
      const { error: updError } = await supabase
        .from('workbook_parts')
        .update({
          resolved_publisher_id: null,
          resolved_publisher_name: null,
          raw_publisher_name: '',
          status: WorkbookStatus.PENDENTE,
          approved_by_id: null,
          approved_at: null,
          is_manual_override: false,
          status_changed_at: nowIso,
          updated_at: nowIso,
        })
        .in(
          'id',
          assigned.map((r) => String(r.id))
        );

      if (updError) {
        return { success: false, message: `Erro ao limpar semana: ${updError.message}`, actionType };
      }

      return {
        success: true,
        message: `Semana de ${formatDateBr(weekId)} limpa! ${assigned.length} designação(ões) foram resetadas para PENDENTE.`,
        actionType,
        details: { weekId, clearedCount: assigned.length },
      };
    } catch (e: unknown) {
      return { success: false, message: `Falha ao limpar semana: ${getErrorMessage(e)}`, actionType };
    }
  },

  /**
   * Marca partes da semana como CONCLUIDA
   */
  async completeWeekOrPart(weekId: string, partHint?: string): Promise<ActionExecutionResult> {
    const actionType: AgentActionType = 'COMPLETE_PART';
    const permError = await actionPort.assertServerPermission(actionType);
    if (permError) {
      return { success: false, message: permError, actionType };
    }

    try {
      const { data: rows, error: fetchError } = await supabase
        .from('workbook_parts')
        .select('*')
        .eq('week_id', weekId);
      if (fetchError) {
        return { success: false, message: `Erro ao buscar semana: ${fetchError.message}`, actionType };
      }

      const rawRows = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
      const normPart = normStr(partHint);
      const eligible = rawRows.filter((r) => {
        if (r.status === WorkbookStatus.CANCELADA || r.status === WorkbookStatus.CONCLUIDA) return false;
        if (!normPart) return true;
        return normStr(String(r.tipo_parte || '')).includes(normPart) || normStr(String(r.part_title || '')).includes(normPart);
      });

      if (!eligible.length) {
        return {
          success: true,
          message: `Nenhuma parte pendente de conclusão na semana de ${formatDateBr(weekId)}.`,
          actionType,
          details: { weekId, completedCount: 0 },
        };
      }

      conversaUndoStack.push({
        label: `Conclusão da semana ${formatDateBr(weekId)}`,
        rows: captureUndoRows(eligible),
      });

      const nowIso = new Date().toISOString();
      const { error: updError } = await supabase
        .from('workbook_parts')
        .update({
          status: WorkbookStatus.CONCLUIDA,
          completed_at: nowIso,
          status_changed_at: nowIso,
          updated_at: nowIso,
        })
        .in(
          'id',
          eligible.map((r) => String(r.id))
        );

      if (updError) {
        return { success: false, message: `Erro ao concluir partes: ${updError.message}`, actionType };
      }

      return {
        success: true,
        message: `${eligible.length} parte(s) da semana de ${formatDateBr(weekId)} marcada(s) como CONCLUÍDA.`,
        actionType,
        details: { weekId, completedCount: eligible.length },
      };
    } catch (e: unknown) {
      return { success: false, message: `Falha ao concluir semana: ${getErrorMessage(e)}`, actionType };
    }
  },

  /**
   * Desfaz a última alteração executada nesta sessão do Conversa RVM
   */
  async undoLastAction(): Promise<ActionExecutionResult> {
    const actionType: AgentActionType = 'UNDO_LAST';
    const permError = await actionPort.assertServerPermission(actionType);
    if (permError) {
      return { success: false, message: permError, actionType };
    }

    const last = conversaUndoStack.pop();
    if (!last || !last.rows.length) {
      return {
        success: false,
        message: 'Não há alteração recente nesta sessão para desfazer.',
        actionType,
      };
    }

    try {
      const nowIso = new Date().toISOString();
      await Promise.all(
        last.rows.map((snap) =>
          supabase
            .from('workbook_parts')
            .update({
              status: snap.status,
              resolved_publisher_id: snap.resolved_publisher_id,
              resolved_publisher_name: snap.resolved_publisher_name,
              raw_publisher_name: snap.raw_publisher_name || '',
              approved_by_id: snap.approved_by_id,
              approved_at: snap.approved_at,
              completed_at: snap.completed_at,
              rejected_reason: snap.rejected_reason,
              is_manual_override: snap.is_manual_override,
              is_substitution: snap.is_substitution,
              substituted_publisher_name: snap.substituted_publisher_name,
              updated_at: nowIso,
            })
            .eq('id', snap.id)
        )
      );

      return {
        success: true,
        message: `Ação desfeita com sucesso: ${last.label} (${last.rows.length} registro(s) restaurado(s)).`,
        actionType,
        details: { restoredCount: last.rows.length },
      };
    } catch (e: unknown) {
      return { success: false, message: `Falha ao desfazer ação: ${getErrorMessage(e)}`, actionType };
    }
  },

  /**
   * Adiciona um tema à Fila de Necessidades Locais (`local_needs_preassignments`)
   */
  async addLocalNeedToQueue(theme: string, assigneeName: string, targetWeek?: string | null): Promise<ActionExecutionResult> {
    const actionType: AgentActionType = 'MANAGE_LOCAL_NEEDS';
    const permError = await actionPort.assertServerPermission(actionType);
    if (permError) {
      return { success: false, message: permError, actionType };
    }

    try {
      const { data: existing } = await supabase
        .from('local_needs_preassignments')
        .select('order_position')
        .order('order_position', { ascending: false })
        .limit(1);

      const maxOrder = Array.isArray(existing) && existing.length > 0 ? Number((existing[0] as { order_position?: number }).order_position || 0) : 0;
      const { error } = await supabase.from('local_needs_preassignments').insert({
        theme: theme.trim(),
        assignee_name: assigneeName.trim(),
        order_position: maxOrder + 1,
        target_week: targetWeek || null,
      });

      if (error) {
        return { success: false, message: `Erro ao inserir na Fila NL: ${error.message}`, actionType };
      }

      return {
        success: true,
        message: `Tema "${theme.trim()}" com ${assigneeName.trim()} adicionado à fila de Necessidades Locais na posição #${maxOrder + 1}.`,
        actionType,
        details: { position: maxOrder + 1 },
      };
    } catch (e: unknown) {
      return { success: false, message: `Falha ao gerenciar Fila NL: ${getErrorMessage(e)}`, actionType };
    }
  },
};
