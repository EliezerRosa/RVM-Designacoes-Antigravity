/**
 * QueryPort — Adaptador de Leituras e Consultas ao Domínio do RVM
 *
 * Consome o schema canônico real de `workbook_parts`, `publishers` e `app_settings`
 * (`resolved_publisher_id`, `seq`, `mapDbToWorkbookPart`, `get_my_workbook_parts`),
 * aplicando escopo de acesso do `PermissionGate`.
 */

import { supabase } from '../../../lib/supabase';
import { WorkbookStatus, type Publisher, type WorkbookPart } from '../../../types';
import { api } from '../../../services/api';
import { mapDbToWorkbookPart } from '../../../services/workbookService';
import { filterPublishersByScope, type PermissionGate } from '../../../services/permissionService';
import { getTodayWeekIdLocal } from '../../../utils/dateUtils';
import { isRealUpcomingAssignment } from '../../../services/publisherUpcomingAssignmentsService';

export interface UpcomingAssignmentView {
  partId: string;
  weekId: string;
  tipoParte: string;
  tituloParte?: string;
  role: 'titular' | 'ajudante';
  partnerName?: string;
  status: string;
  dateStr: string;
  portalResponse?: 'confirmed' | 'refused';
}

function normalizeName(value?: string | null): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findPartnerName(part: WorkbookPart, weekParts: WorkbookPart[]): string | undefined {
  const partNumMatch = (part.tituloParte || part.tipoParte || '').match(/^(\d+)/);
  const partNum = partNumMatch ? partNumMatch[1] : null;

  const partner = weekParts.find((other) => {
    if (other.id === part.id) return false;
    const otherNumMatch = (other.tituloParte || other.tipoParte || '').match(/^(\d+)/);
    const otherNum = otherNumMatch ? otherNumMatch[1] : null;
    if (partNum && otherNum && partNum === otherNum) {
      return other.funcao !== part.funcao;
    }
    return other.tipoParte === part.tipoParte && other.funcao !== part.funcao;
  });

  return partner?.resolvedPublisherName || partner?.rawPublisherName || undefined;
}

async function fetchPortalResponseMap(weekIds: string[]): Promise<Map<string, 'confirmed' | 'refused'>> {
  const map = new Map<string, 'confirmed' | 'refused'>();
  if (!weekIds.length) return map;

  const uniqueWeeks = Array.from(new Set(weekIds.filter(Boolean)));
  const responses = await Promise.all(
    uniqueWeeks.map((wid) =>
      supabase
        .rpc('get_portal_responses_for_week', { p_week_id: wid })
        .then(({ data }) => (Array.isArray(data) ? data : []), () => [])
    )
  );

  for (const row of responses.flat() as Array<{ part_id?: string; response?: string }>) {
    const resp = (row.response || '').toLowerCase();
    if (row.part_id && (resp === 'confirmed' || resp === 'refused')) {
      map.set(row.part_id, resp);
    }
  }

  return map;
}

export const queryPort = {
  /**
   * Busca publicadores cadastrados respeitando o escopo de permissão
   */
  async getPublishers(gate?: PermissionGate, selfPublisherId?: string | null): Promise<Publisher[]> {
    try {
      const all = await api.loadPublishers();
      if (gate) {
        const scoped = filterPublishersByScope(all, gate.getPublisherScope());
        if (scoped.length > 0) return scoped;
      }
      if (all.length > 0) return all;
    } catch (e) {
      console.warn('[QueryPort] Falha ao listar publicadores via SELECT direto:', e);
    }

    if (selfPublisherId) {
      const own = await api.loadPublisherById(selfPublisherId).catch(() => null);
      if (own) return [own];
    }
    return [];
  },

  /**
   * Busca partes de uma semana específica ordenadas por `seq`
   */
  async getWeekParts(weekId: string): Promise<WorkbookPart[]> {
    try {
      const { data, error } = await supabase
        .from('workbook_parts')
        .select('*')
        .eq('week_id', weekId)
        .order('seq', { ascending: true });

      if (!error && data && data.length > 0) {
        return data.map((row) => mapDbToWorkbookPart(row as Record<string, unknown>));
      }

      // Fallback para publicadores sob RLS via RPC
      const { data: myData } = await supabase.rpc('get_my_workbook_parts');
      if (Array.isArray(myData)) {
        return myData
          .map((row) => mapDbToWorkbookPart(row as Record<string, unknown>))
          .filter((p) => p.weekId === weekId)
          .sort((a, b) => (a.seq || 0) - (b.seq || 0));
      }

      return [];
    } catch (e) {
      console.error('[QueryPort] Erro ao buscar partes da semana:', e);
      return [];
    }
  },

  /**
   * Busca semanas importadas distintas em ordem cronológica
   */
  async getAvailableWeeks(): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('workbook_parts')
        .select('week_id')
        .order('week_id', { ascending: true });

      if (!error && data && data.length > 0) {
        const distinct = Array.from(new Set(data.map((r: any) => r.week_id as string))).filter(Boolean);
        if (distinct.length > 0) return distinct.sort();
      }

      const { data: myData } = await supabase.rpc('get_my_workbook_parts');
      if (Array.isArray(myData)) {
        const mapped = myData.map((row) => mapDbToWorkbookPart(row as Record<string, unknown>));
        return Array.from(new Set(mapped.map((p) => p.weekId).filter(Boolean))).sort();
      }

      return [];
    } catch (e) {
      console.error('[QueryPort] Erro ao buscar semanas:', e);
      return [];
    }
  },

  /**
   * Busca partes vagas ou pendentes futuras
   */
  async getVacantParts(weekId?: string): Promise<WorkbookPart[]> {
    try {
      const todayWeekId = getTodayWeekIdLocal();
      let query = supabase
        .from('workbook_parts')
        .select('*')
        .gte('week_id', todayWeekId)
        .or(`status.eq.${WorkbookStatus.PENDENTE},resolved_publisher_id.is.null`)
        .neq('status', WorkbookStatus.CANCELADA);

      if (weekId) {
        query = query.eq('week_id', weekId);
      }

      const { data, error } = await query
        .order('week_id', { ascending: true })
        .order('seq', { ascending: true });

      if (error || !data) return [];
      return data
        .map((row) => mapDbToWorkbookPart(row as Record<string, unknown>))
        .filter((p) => !p.isChairmanDerived);
    } catch (e) {
      console.error('[QueryPort] Erro ao buscar partes vagas:', e);
      return [];
    }
  },

  /**
   * Busca designações futuras ativas de um publicador (titular ou ajudante)
   */
  async getPublisherAssignments(
    publisherId: string,
    publisherName?: string,
    preferSelfRpc: boolean = false
  ): Promise<UpcomingAssignmentView[]> {
    try {
      const todayWeekId = getTodayWeekIdLocal();
      const normalizedTarget = normalizeName(publisherName);

      let parts: WorkbookPart[] = [];
      let usedRpc = false;

      if (preferSelfRpc) {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('get_my_workbook_parts');
        if (!rpcErr && Array.isArray(rpcData)) {
          usedRpc = true;
          parts = rpcData.map((row) => mapDbToWorkbookPart(row as Record<string, unknown>));
        }
      }

      if (!usedRpc) {
        let query = supabase
          .from('workbook_parts')
          .select('*')
          .gte('week_id', todayWeekId)
          .in('status', [WorkbookStatus.PROPOSTA, WorkbookStatus.DESIGNADA, WorkbookStatus.APROVADA])
          .order('week_id', { ascending: true })
          .order('seq', { ascending: true });

        query = normalizedTarget
          ? query.or(`resolved_publisher_id.eq.${publisherId},raw_publisher_name.ilike.%${publisherName!.trim()}%`)
          : query.eq('resolved_publisher_id', publisherId);

        const { data, error } = await query;
        if (!error && data) {
          parts = data.map((row) => mapDbToWorkbookPart(row as Record<string, unknown>));
        } else {
          // Fallback RPC para publicadores com RLS restrita
          const { data: rpcData } = await supabase.rpc('get_my_workbook_parts');
          if (Array.isArray(rpcData)) {
            parts = rpcData.map((row) => mapDbToWorkbookPart(row as Record<string, unknown>));
          }
        }
      }

      const activeStatuses = new Set<string>([
        WorkbookStatus.PROPOSTA,
        WorkbookStatus.DESIGNADA,
        WorkbookStatus.APROVADA,
      ]);

      const ownUpcoming = parts.filter((p) => {
        if (p.weekId < todayWeekId) return false;
        if (p.isChairmanDerived) return false;
        if (!activeStatuses.has(String(p.status || '').toUpperCase())) return false;
        if (!isRealUpcomingAssignment(p.tipoParte)) return false;

        if (p.resolvedPublisherId) {
          return p.resolvedPublisherId === publisherId;
        }
        return normalizedTarget
          ? normalizeName(p.resolvedPublisherName || p.rawPublisherName) === normalizedTarget
          : false;
      });

      if (!ownUpcoming.length) return [];

      // Carregar partes das semanas afetadas para resolver parceiro (Titular <-> Ajudante)
      const affectedWeekIds = Array.from(new Set(ownUpcoming.map((p) => p.weekId)));
      const partsByWeek = new Map<string, WorkbookPart[]>();

      if (parts.some((p) => p.resolvedPublisherId !== publisherId)) {
        for (const p of parts) {
          const list = partsByWeek.get(p.weekId) || [];
          list.push(p);
          partsByWeek.set(p.weekId, list);
        }
      } else {
        const { data: weekRows } = await supabase
          .from('workbook_parts')
          .select('*')
          .in('week_id', affectedWeekIds);

        if (Array.isArray(weekRows)) {
          for (const row of weekRows) {
            const mapped = mapDbToWorkbookPart(row as Record<string, unknown>);
            const list = partsByWeek.get(mapped.weekId) || [];
            list.push(mapped);
            partsByWeek.set(mapped.weekId, list);
          }
        }
      }

      const portalMap = await fetchPortalResponseMap(affectedWeekIds);

      return ownUpcoming.map((part) => {
        const portalResponse = portalMap.get(part.id);
        const weekParts = partsByWeek.get(part.weekId) || [];
        const resolvedStatus =
          portalResponse === 'confirmed'
            ? 'confirmada'
            : portalResponse === 'refused'
            ? 'recusada'
            : part.status;

        return {
          partId: part.id,
          weekId: part.weekId,
          tipoParte: part.tipoParte || 'Parte RVM',
          tituloParte: part.tituloParte || undefined,
          role: part.funcao === 'Ajudante' ? 'ajudante' : 'titular',
          partnerName: findPartnerName(part, weekParts),
          status: resolvedStatus,
          dateStr: part.date || part.weekId,
          portalResponse,
        };
      });
    } catch (e) {
      console.error('[QueryPort] Erro ao buscar designações do publicador:', e);
      return [];
    }
  },

  /**
   * Busca últimas participações concluídas ou passadas de um publicador
   */
  async getLastParticipation(publisherId: string, publisherName?: string): Promise<UpcomingAssignmentView[]> {
    try {
      const todayWeekId = getTodayWeekIdLocal();
      const { data, error } = await supabase
        .from('workbook_parts')
        .select('*')
        .eq('resolved_publisher_id', publisherId)
        .neq('status', WorkbookStatus.CANCELADA)
        .lt('week_id', todayWeekId)
        .order('week_id', { ascending: false })
        .order('seq', { ascending: false })
        .limit(8);

      let rows = data;
      if (error || !rows) {
        const { data: rpcData } = await supabase.rpc('get_my_workbook_parts');
        rows = Array.isArray(rpcData)
          ? rpcData.filter((r: any) => {
              const p = mapDbToWorkbookPart(r as Record<string, unknown>);
              return (
                p.weekId < todayWeekId &&
                p.status !== WorkbookStatus.CANCELADA &&
                (p.resolvedPublisherId === publisherId ||
                  (!!publisherName && normalizeName(p.resolvedPublisherName || p.rawPublisherName) === normalizeName(publisherName)))
              );
            })
          : [];
      }

      return (rows || [])
        .map((row) => mapDbToWorkbookPart(row as Record<string, unknown>))
        .filter((p) => !p.isChairmanDerived && p.tipoParte !== 'Cântico')
        .slice(0, 5)
        .map((p) => ({
          partId: p.id,
          weekId: p.weekId,
          tipoParte: p.tipoParte || 'Parte RVM',
          tituloParte: p.tituloParte || undefined,
          role: p.funcao === 'Ajudante' ? 'ajudante' : 'titular',
          status: p.status,
          dateStr: p.date || p.weekId,
        }));
    } catch (e) {
      console.error('[QueryPort] Erro ao buscar histórico recente:', e);
      return [];
    }
  },

  /**
   * Busca semanas futuras ainda não publicadas ou com partes pendentes
   */
  async getPendingWeeks(): Promise<string[]> {
    try {
      const todayWeekId = getTodayWeekIdLocal();
      const [publishedMap, availableWeeks, openRes] = await Promise.all([
        api.getSetting<Record<string, string>>('week_published', {}).catch(() => ({} as Record<string, string>)),
        this.getAvailableWeeks(),
        supabase
          .from('workbook_parts')
          .select('week_id')
          .gte('week_id', todayWeekId)
          .in('status', [WorkbookStatus.PENDENTE, WorkbookStatus.PROPOSTA]),
      ]);

      const openWeeks = new Set<string>(
        ((openRes.data || []) as Array<{ week_id?: string }>)
          .map((r) => r.week_id || '')
          .filter(Boolean)
      );

      return availableWeeks
        .filter((w) => w >= todayWeekId && (!publishedMap[w] || openWeeks.has(w)))
        .sort();
    } catch (e) {
      console.error('[QueryPort] Erro ao buscar semanas pendentes:', e);
      return [];
    }
  },
};
