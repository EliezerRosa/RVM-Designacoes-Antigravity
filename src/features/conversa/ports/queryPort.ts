/**
 * QueryPort — Adaptador de Leituras e Consultas ao Domínio do RVM
 *
 * Fornece dados reais para preenchimento de micro-painéis e resolução de entidades.
 * Não duplica regras de negócio; consome diretamente Supabase e serviços existentes.
 */

import { supabase } from '../../../lib/supabase';
import type { Publisher, WorkbookPart } from '../../../types';
import { api } from '../../../services/api';

export interface UpcomingAssignmentView {
  partId: string;
  weekId: string;
  tipoParte: string;
  tituloParte?: string;
  role: 'titular' | 'ajudante';
  partnerName?: string;
  status: string;
  dateStr: string;
}

export const queryPort = {
  /**
   * Busca todos os publicadores cadastrados
   */
  async getPublishers(): Promise<Publisher[]> {
    try {
      return await api.loadPublishers();
    } catch (e) {
      console.error('[QueryPort] Erro ao carregar publicadores:', e);
      return [];
    }
  },

  /**
   * Busca partes de uma semana específica
   */
  async getWeekParts(weekId: string): Promise<WorkbookPart[]> {
    try {
      const { data, error } = await supabase
        .from('workbook_parts')
        .select('*')
        .eq('week_id', weekId)
        .order('order_index', { ascending: true });

      if (error || !data) return [];
      return data as WorkbookPart[];
    } catch (e) {
      console.error('[QueryPort] Erro ao buscar partes da semana:', e);
      return [];
    }
  },

  /**
   * Busca semanas importadas distintas
   */
  async getAvailableWeeks(): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('workbook_parts')
        .select('week_id')
        .order('week_id', { ascending: true });

      if (error || !data) return [];
      const distinct = Array.from(new Set(data.map((r: any) => r.week_id as string)));
      return distinct.filter(Boolean);
    } catch (e) {
      console.error('[QueryPort] Erro ao buscar semanas:', e);
      return [];
    }
  },

  /**
   * Busca partes vagas (sem designação ativa ou com status pendente)
   */
  async getVacantParts(weekId?: string): Promise<WorkbookPart[]> {
    try {
      let query = supabase
        .from('workbook_parts')
        .select('*')
        .or('status.eq.pendente,assignee_id.is.null');

      if (weekId) {
        query = query.eq('week_id', weekId);
      }

      const { data, error } = await query.order('week_id', { ascending: true });
      if (error || !data) return [];
      return data as WorkbookPart[];
    } catch (e) {
      console.error('[QueryPort] Erro ao buscar partes vagas:', e);
      return [];
    }
  },

  /**
   * Busca designações futuras de um publicador específico
   */
  async getPublisherAssignments(publisherId: string): Promise<UpcomingAssignmentView[]> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('workbook_parts')
        .select('*')
        .or(`assignee_id.eq.${publisherId},assistant_id.eq.${publisherId}`)
        .gte('week_id', today)
        .order('week_id', { ascending: true });

      if (error || !data) return [];

      return data.map((part: any) => {
        const isTitular = part.assignee_id === publisherId;
        return {
          partId: part.id,
          weekId: part.week_id,
          tipoParte: part.tipo_parte || part.tipoParte || 'Parte RVM',
          tituloParte: part.titulo_parte || part.tituloParte,
          role: isTitular ? 'titular' : 'ajudante',
          partnerName: isTitular ? part.assistant_name : part.assignee_name,
          status: part.status || 'pendente',
          dateStr: part.week_id,
        };
      });
    } catch (e) {
      console.error('[QueryPort] Erro ao buscar designações do publicador:', e);
      return [];
    }
  },

  /**
   * Busca semanas ainda não publicadas
   */
  async getPendingWeeks(): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('workbook_parts')
        .select('week_id')
        .neq('status', 'publicada')
        .order('week_id', { ascending: true });

      if (error || !data) return [];
      return Array.from(new Set(data.map((r: any) => r.week_id as string)));
    } catch (e) {
      console.error('[QueryPort] Erro ao buscar semanas pendentes:', e);
      return [];
    }
  },
};
