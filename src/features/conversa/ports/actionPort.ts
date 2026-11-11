/**
 * ActionPort — Adaptador de Ações e Escritas com Gate no Servidor
 *
 * Todas as escritas passam obrigatoriamente por revalidação da RPC
 * 'assert_agent_action' no Supabase antes de tocar qualquer dado.
 * Fail-closed: se a RPC negar, a operação é sumariamente interrompida.
 */

import { supabase } from '../../../lib/supabase';
import type { AgentActionType } from '../../../services/agentActionService';

export interface ActionExecutionResult {
  success: boolean;
  message: string;
  actionType: AgentActionType;
  details?: any;
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
    } catch (e: any) {
      return `Falha de conexão ao validar ação no servidor: ${e.message || e}`;
    }
  },

  /**
   * Registra período de ausência para um publicador
   */
  async registerAbsence(
    publisherId: string,
    startDate: string,
    endDate: string,
    reason: string = 'Ausência informada'
  ): Promise<ActionExecutionResult> {
    const actionType: AgentActionType = 'UPDATE_AVAILABILITY';
    const permError = await this.assertServerPermission(actionType);
    if (permError) {
      return { success: false, message: permError, actionType };
    }

    try {
      // Gravar ausência na tabela availability ou publishers.data
      const { data: pubRow, error: fetchErr } = await supabase
        .from('publishers')
        .select('*')
        .eq('id', publisherId)
        .single();

      if (fetchErr || !pubRow) {
        return { success: false, message: 'Publicador não encontrado para registro de ausência.', actionType };
      }

      const pubData = pubRow.data || {};
      const absences = Array.isArray(pubData.absences) ? [...pubData.absences] : [];
      absences.push({
        id: `abs_${Date.now()}`,
        startDate,
        endDate,
        reason,
        createdAt: new Date().toISOString(),
      });

      const updatedData = { ...pubData, absences };
      const { error: updateErr } = await supabase
        .from('publishers')
        .update({ data: updatedData })
        .eq('id', publisherId);

      if (updateErr) {
        return { success: false, message: `Erro ao salvar ausência: ${updateErr.message}`, actionType };
      }

      return {
        success: true,
        message: `Ausência registrada com sucesso de ${startDate} até ${endDate}.`,
        actionType,
        details: { publisherId, startDate, endDate },
      };
    } catch (e: any) {
      return { success: false, message: `Falha ao registrar ausência: ${e.message}`, actionType };
    }
  },

  /**
   * Aprova uma proposta de designação ou semana
   */
  async approveWeekProposal(weekId: string): Promise<ActionExecutionResult> {
    const actionType: AgentActionType = 'APPROVE_PROPOSAL';
    const permError = await this.assertServerPermission(actionType);
    if (permError) {
      return { success: false, message: permError, actionType };
    }

    try {
      const { error } = await supabase
        .from('workbook_parts')
        .update({ status: 'aprovada' })
        .eq('week_id', weekId)
        .eq('status', 'proposta');

      if (error) {
        return { success: false, message: `Erro ao aprovar proposta: ${error.message}`, actionType };
      }

      return {
        success: true,
        message: `Semana ${weekId} aprovada com sucesso!`,
        actionType,
        details: { weekId },
      };
    } catch (e: any) {
      return { success: false, message: `Falha na aprovação: ${e.message}`, actionType };
    }
  },
};
