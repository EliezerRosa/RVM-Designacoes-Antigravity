/**
 * QueryPort — Adaptador de Leituras e Consultas ao Domínio do RVM
 *
 * Consome o schema canônico real de `workbook_parts`, `publishers` e `app_settings`
 * (`resolved_publisher_id`, `seq`, `mapDbToWorkbookPart`, `get_my_workbook_parts`),
 * aplicando escopo de acesso do `PermissionGate`.
 */

import { supabase } from '../../../lib/supabase';
import { EnumFuncao, EnumModalidade, HistoryStatus, WorkbookStatus, type HistoryRecord, type Publisher, type WorkbookPart } from '../../../types';
import { api } from '../../../services/api';
import { mapDbToWorkbookPart } from '../../../services/workbookService';
import { filterPublishersByScope, type PermissionGate } from '../../../services/permissionService';
import { getTodayWeekIdLocal } from '../../../utils/dateUtils';
import { isRealUpcomingAssignment } from '../../../services/publisherUpcomingAssignmentsService';
import { buildEligibilityContext, checkEligibility } from '../../../services/eligibilityService';
import { getRankedEligibleForPart } from '../../../services/rankedEligibleService';
import { getModalidadeFromTipo } from '../../../constants/mappings';
import { formatDateBr } from './documentPort';
import type { InfoListItem } from '../core/conversationState';

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

function matchesTargetPublisher(
  part: WorkbookPart,
  publisherId: string,
  normalizedTarget: string
): boolean {
  if (publisherId && part.resolvedPublisherId && part.resolvedPublisherId === publisherId) {
    return true;
  }
  if (!normalizedTarget) return false;
  return (
    normalizeName(part.resolvedPublisherName) === normalizedTarget ||
    normalizeName(part.rawPublisherName) === normalizedTarget
  );
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
        const distinct = Array.from(
          new Set((data as Array<{ week_id?: string }>).map((r) => r.week_id || ''))
        ).filter(Boolean);
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
        if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
          const mapped = rpcData.map((row) => mapDbToWorkbookPart(row as Record<string, unknown>));
          if (mapped.some((p) => matchesTargetPublisher(p, publisherId, normalizedTarget))) {
            usedRpc = true;
            parts = mapped;
          }
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

        const cleanName = publisherName?.trim();
        query = normalizedTarget && cleanName
          ? query.or(
              `resolved_publisher_id.eq.${publisherId},resolved_publisher_name.ilike.%${cleanName}%,raw_publisher_name.ilike.%${cleanName}%`
            )
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

        return matchesTargetPublisher(p, publisherId, normalizedTarget);
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
      const normalizedTarget = normalizeName(publisherName);
      const cleanName = publisherName?.trim();

      let query = supabase
        .from('workbook_parts')
        .select('*')
        .neq('status', WorkbookStatus.CANCELADA)
        .lt('week_id', todayWeekId)
        .order('week_id', { ascending: false })
        .order('seq', { ascending: false })
        .limit(8);

      query = normalizedTarget && cleanName
        ? query.or(
            `resolved_publisher_id.eq.${publisherId},resolved_publisher_name.ilike.%${cleanName}%,raw_publisher_name.ilike.%${cleanName}%`
          )
        : query.eq('resolved_publisher_id', publisherId);

      const { data, error } = await query;

      let rows = data;
      if (error || !rows || rows.length === 0) {
        const { data: rpcData } = await supabase.rpc('get_my_workbook_parts');
        rows = Array.isArray(rpcData)
          ? (rpcData as Array<Record<string, unknown>>).filter((r) => {
              const p = mapDbToWorkbookPart(r);
              return (
                p.weekId < todayWeekId &&
                p.status !== WorkbookStatus.CANCELADA &&
                matchesTargetPublisher(p, publisherId, normalizedTarget)
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
        queryPort.getAvailableWeeks(),
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

  /**
   * Verifica elegibilidade detalhada de um publicador (usa exclusivamente eligibilityService)
   */
  async checkPublisherEligibility(
    publisher: Publisher,
    partType?: string,
    weekId?: string,
    allPublishers: Publisher[] = []
  ): Promise<{ title: string; summary: string; items: InfoListItem[]; eligible?: boolean }> {
    let targetWeek = weekId;
    if (targetWeek === 'current-week' || !targetWeek) {
      const weeks = await queryPort.getAvailableWeeks();
      const todayWeek = getTodayWeekIdLocal();
      targetWeek = weeks.find((w) => w >= todayWeek) || weeks[0] || todayWeek;
    }

    const weekParts = targetWeek ? await queryPort.getWeekParts(targetWeek).catch(() => [] as WorkbookPart[]) : [];
    const normPart = normalizeName(partType);

    if (normPart) {
      const funcao = normPart.includes('ajudante') ? EnumFuncao.AJUDANTE : EnumFuncao.TITULAR;
      const mappedModalidade = resolveModalidadeFromHint(normPart);
      const refPart =
        weekParts.find((p) => normalizeName(p.tipoParte).includes(normPart) || normalizeName(p.modalidade).includes(normPart)) ||
        ({
          id: 'virtual-check',
          weekId: targetWeek,
          weekDisplay: formatDateBr(targetWeek),
          date: targetWeek,
          section: mappedModalidade === EnumModalidade.DEMONSTRACAO ? 'Faça Seu Melhor no Ministério' : 'Tesouros da Palavra de Deus',
          tipoParte: partType || mappedModalidade,
          modalidade: mappedModalidade,
          tituloParte: partType || mappedModalidade,
          descricaoParte: '',
          detalhesParte: '',
          seq: 1,
          funcao,
          duracao: '5',
          horaInicio: '',
          horaFim: '',
          rawPublisherName: '',
          status: WorkbookStatus.PENDENTE,
          createdAt: new Date().toISOString(),
        } as WorkbookPart);

      const ctx = buildEligibilityContext(refPart, weekParts, allPublishers.length ? allPublishers : [publisher]);
      const res = checkEligibility(publisher, (mappedModalidade || refPart.modalidade) as never, funcao, ctx);

      const items: InfoListItem[] = [
        {
          label: `${mappedModalidade} (${funcao})`,
          value: res.eligible ? 'Elegível' : 'Inelegível',
          detail: res.reason || 'Atende às qualificações e disponibilidade para esta semana.',
          badge: res.eligible ? 'Apto' : 'Restrição',
        },
        {
          label: 'Perfil Base',
          value: `${publisher.condition} · ${publisher.gender === 'brother' ? 'Irmão' : 'Irmã'}`,
          detail: publisher.isServing ? 'Ativo no cadastro' : 'Inativo/pausado',
        },
        {
          label: `Semana ${formatDateBr(targetWeek)}`,
          value: publisher.availability?.exceptionDates?.includes(targetWeek) ? 'Indisponível nesta data' : 'Sem bloqueio de agenda',
        },
      ];

      return {
        title: `Elegibilidade de ${publisher.name}`,
        summary: res.eligible
          ? `${publisher.name} está elegível para ${mappedModalidade} (${funcao}) na semana de ${formatDateBr(targetWeek)}.`
          : `${publisher.name} não está elegível para ${mappedModalidade} (${funcao}): ${res.reason}.`,
        items,
        eligible: res.eligible,
      };
    }

    const checks: Array<{ label: string; modalidade: string; funcao: 'Titular' | 'Ajudante'; section: string }> = [
      { label: 'Presidente', modalidade: EnumModalidade.PRESIDENCIA, funcao: EnumFuncao.TITULAR, section: 'Início da Reunião' },
      { label: 'Discurso de Ensino', modalidade: EnumModalidade.DISCURSO_ENSINO, funcao: EnumFuncao.TITULAR, section: 'Tesouros da Palavra de Deus' },
      { label: 'Dirigente EBC', modalidade: EnumModalidade.DIRIGENTE_EBC, funcao: EnumFuncao.TITULAR, section: 'Nossa Vida Cristã' },
      { label: 'Leitor EBC', modalidade: EnumModalidade.LEITOR_EBC, funcao: EnumFuncao.TITULAR, section: 'Nossa Vida Cristã' },
      { label: 'Leitura da Bíblia', modalidade: EnumModalidade.LEITURA_ESTUDANTE, funcao: EnumFuncao.TITULAR, section: 'Tesouros da Palavra de Deus' },
      { label: 'Demonstração (Titular)', modalidade: EnumModalidade.DEMONSTRACAO, funcao: EnumFuncao.TITULAR, section: 'Faça Seu Melhor no Ministério' },
      { label: 'Demonstração (Ajudante)', modalidade: EnumModalidade.DEMONSTRACAO, funcao: EnumFuncao.AJUDANTE, section: 'Faça Seu Melhor no Ministério' },
      { label: 'Oração', modalidade: EnumModalidade.ORACAO, funcao: EnumFuncao.TITULAR, section: 'Final da Reunião' },
    ];

    const items: InfoListItem[] = checks.map((c) => {
      const virtualPart: WorkbookPart = {
        id: `virtual-${c.label}`,
        weekId: targetWeek || getTodayWeekIdLocal(),
        weekDisplay: formatDateBr(targetWeek || getTodayWeekIdLocal()),
        date: targetWeek || getTodayWeekIdLocal(),
        section: c.section,
        tipoParte: c.label,
        modalidade: c.modalidade,
        tituloParte: c.label,
        descricaoParte: '',
        detalhesParte: '',
        seq: 1,
        funcao: c.funcao,
        duracao: '5',
        horaInicio: '',
        horaFim: '',
        rawPublisherName: '',
        status: WorkbookStatus.PENDENTE,
        createdAt: new Date().toISOString(),
      };
      const ctx = buildEligibilityContext(virtualPart, weekParts, allPublishers.length ? allPublishers : [publisher]);
      const res = checkEligibility(publisher, c.modalidade as never, c.funcao, ctx);
      return {
        label: c.label,
        value: res.eligible ? 'Elegível' : 'Restrito',
        detail: res.reason || 'Apto conforme regras S-38',
        badge: res.eligible ? 'OK' : undefined,
      };
    });

    const eligibleCount = items.filter((i) => i.value === 'Elegível').length;
    return {
      title: `Elegibilidade Geral — ${publisher.name}`,
      summary: `${publisher.name} está elegível para ${eligibleCount} de ${checks.length} modalidades principais na semana de ${formatDateBr(targetWeek || getTodayWeekIdLocal())}.`,
      items,
      eligible: eligibleCount > 0,
    };
  },

  /**
   * Explica o ranking determinístico S-38 / M-0..M-12 para uma parte (usa rankedEligibleService)
   */
  async explainPartRanking(
    weekId: string | undefined,
    partType: string | undefined,
    targetPublisher: Publisher | undefined,
    allPublishers: Publisher[]
  ): Promise<{ title: string; summary: string; items: InfoListItem[] }> {
    const weeks = await queryPort.getAvailableWeeks();
    const todayWeek = getTodayWeekIdLocal();
    const resolvedWeek =
      !weekId || weekId === 'current-week'
        ? weeks.find((w) => w >= todayWeek) || weeks[0] || todayWeek
        : weekId === 'next-week'
          ? weeks.filter((w) => w > todayWeek)[0] || weeks[0] || todayWeek
          : weekId;

    const weekParts = await queryPort.getWeekParts(resolvedWeek).catch(() => [] as WorkbookPart[]);
    if (!weekParts.length) {
      return {
        title: 'Explicação de Ranking',
        summary: `Não há partes carregadas na apostila para a semana de ${formatDateBr(resolvedWeek)}.`,
        items: [],
      };
    }

    const normHint = normalizeName(partType);
    let targetPart: WorkbookPart | undefined;
    if (normHint) {
      targetPart = weekParts.find(
        (p) =>
          !p.isChairmanDerived &&
          (normalizeName(p.tipoParte).includes(normHint) ||
            normalizeName(p.tituloParte).includes(normHint) ||
            normalizeName(p.modalidade).includes(normHint))
      );
    }
    if (!targetPart && targetPublisher) {
      targetPart = weekParts.find(
        (p) => !p.isChairmanDerived && p.resolvedPublisherId === targetPublisher.id
      );
    }
    if (!targetPart) {
      targetPart = weekParts.find((p) => !p.isChairmanDerived && p.tipoParte !== 'Cântico') || weekParts[0];
    }

    const { data: histRows } = await supabase
      .from('workbook_parts')
      .select('*')
      .neq('status', WorkbookStatus.CANCELADA)
      .order('week_id', { ascending: false })
      .limit(250);

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
        importBatchId: 'conversa-ranking',
        createdAt: p.createdAt,
      }));

    const ranking = getRankedEligibleForPart(targetPart, weekParts, allPublishers, historyRecords);
    const items: InfoListItem[] = ranking.eligibleCandidates.slice(0, 6).map((c, idx) => ({
      label: `#${idx + 1} ${c.publisher.name}`,
      value: `Balde ${c.priorityBucket} · Última vez: ${c.lastAnyDate || 'Nunca'}`,
      detail: [
        c.blocked ? 'Em cooldown recente' : 'Fora de cooldown',
        c.samePartBlocked ? 'Mesma parte recente (M-7)' : null,
        c.sectionBlocked ? `Saldo de seção (${c.sectionDebt || 1})` : null,
        c.engineGateReason || null,
      ]
        .filter(Boolean)
        .join(' · '),
      badge: c.publisher.id === targetPart.resolvedPublisherId ? 'Designado' : undefined,
    }));

    let targetNote = '';
    if (targetPublisher) {
      const idx = ranking.eligibleCandidates.findIndex((c) => c.publisher.id === targetPublisher.id);
      if (idx >= 0) {
        const cand = ranking.eligibleCandidates[idx];
        targetNote = ` ${targetPublisher.name} ocupa a posição #${idx + 1} (Balde ${cand.priorityBucket}, última participação: ${cand.lastAnyDate || 'nunca'}).`;
      } else {
        const inelig = ranking.allCandidates.find((c) => c.publisher.id === targetPublisher.id);
        targetNote = inelig
          ? ` ${targetPublisher.name} não aparece entre os elegíveis desta parte (${inelig.reason || 'inelegível'}).`
          : '';
      }
    }

    const currentAssignee = targetPart.resolvedPublisherName || targetPart.rawPublisherName || 'Sem designação';
    return {
      title: `Ranking — ${targetPart.tituloParte || targetPart.tipoParte} (${formatDateBr(resolvedWeek)})`,
      summary: `Atual: ${currentAssignee}. ${ranking.eligibleCandidates.length} candidato(s) elegível(is) ordenados pelas chaves determinísticas M-0 a M-12 (elegibilidade → balde/escassez/garantia → cooldown → mesma parte → saldo de seção → carga/frescor).${targetNote}`,
      items,
    };
  },

  /**
   * Resumo completo de perfil, privilégios e disponibilidade de um publicador
   */
  getPublisherProfileSummary(
    publisher: Publisher,
    canSeeSensitive: boolean
  ): { title: string; summary: string; items: InfoListItem[] } {
    const privs: string[] = [];
    if (publisher.privileges?.canPreside) privs.push('Presidente');
    if (publisher.privileges?.canGiveTalks) privs.push('Discursos de Ensino');
    if (publisher.privileges?.canConductCBS) privs.push('Dirigente EBC');
    if (publisher.privileges?.canReadCBS) privs.push('Leitor EBC');
    if (publisher.privileges?.canPray) privs.push('Oração');
    if (publisher.privileges?.canGiveStudentTalks !== false) privs.push('Partes de Estudante');

    const sections: string[] = [];
    if (publisher.privilegesBySection?.canParticipateInTreasures) sections.push('Tesouros');
    if (publisher.privilegesBySection?.canParticipateInMinistry) sections.push('Ministério');
    if (publisher.privilegesBySection?.canParticipateInLife) sections.push('Vida Cristã');

    const items: InfoListItem[] = [
      {
        label: 'Condição e Função',
        value: publisher.condition,
        detail: publisher.funcao || (publisher.isServing ? 'Ativo' : 'Inativo'),
        badge: publisher.isBaptized ? 'Batizado' : 'Não batizado',
      },
      {
        label: 'Privilégios',
        value: privs.length ? privs.join(', ') : 'Apenas Ajudante/Estudante básico',
      },
      {
        label: 'Seções Habilitadas',
        value: sections.length ? sections.join(', ') : 'Nenhuma seção marcada',
      },
    ];

    if (canSeeSensitive) {
      const futureExceptions = (publisher.availability?.exceptionDates || []).filter((d) => d >= getTodayWeekIdLocal());
      items.push({
        label: 'Disponibilidade',
        value: futureExceptions.length ? `${futureExceptions.length} data(s) de ausência` : 'Sem ausências futuras',
        detail: futureExceptions.slice(0, 5).map(formatDateBr).join(', ') || undefined,
      });
      if (publisher.isNotQualified || publisher.requestedNoParticipation || publisher.isIndefinitelyPaused) {
        items.push({
          label: 'Observações de Status',
          value: [
            publisher.isNotQualified ? 'Não apto' : null,
            publisher.requestedNoParticipation ? 'Pediu para não participar' : null,
            publisher.isIndefinitelyPaused ? 'Pausa indefinida' : null,
          ]
            .filter(Boolean)
            .join(' · '),
          detail: publisher.notQualifiedReason || publisher.noParticipationReason || publisher.indefinitePauseReason || undefined,
        });
      }
    }

    return {
      title: `Perfil — ${publisher.name}`,
      summary: `${publisher.name}: ${publisher.condition} (${publisher.gender === 'brother' ? 'Irmão' : 'Irmã'}), ${publisher.isServing ? 'servindo ativamente' : 'inativo'}.`,
      items,
    };
  },

  /**
   * Lista ou conta publicadores filtrados respeitando o escopo do usuário
   */
  getPublisherListSummary(
    publishers: Publisher[],
    filter?: string
  ): { title: string; summary: string; items: InfoListItem[] } {
    const normFilter = normalizeName(filter);
    let filtered = publishers;
    let label = 'Todos os Publicadores';

    if (normFilter.includes('anciao') || normFilter.includes('anciaos')) {
      filtered = publishers.filter((p) => normalizeName(p.condition).includes('anciao'));
      label = 'Anciãos';
    } else if (normFilter.includes('servo')) {
      filtered = publishers.filter((p) => normalizeName(p.condition).includes('servo'));
      label = 'Servos Ministeriais';
    } else if (normFilter.includes('irmaos') || normFilter === 'irmao') {
      filtered = publishers.filter((p) => p.gender === 'brother');
      label = 'Irmãos';
    } else if (normFilter.includes('irmas') || normFilter === 'irma') {
      filtered = publishers.filter((p) => p.gender === 'sister');
      label = 'Irmãs';
    } else if (normFilter.includes('inativo') || normFilter.includes('paus')) {
      filtered = publishers.filter((p) => !p.isServing || p.isNotQualified || p.requestedNoParticipation || p.isIndefinitelyPaused);
      label = 'Inativos / Em Pausa';
    } else if (normFilter.includes('elegive') || normFilter.includes('ativo')) {
      filtered = publishers.filter((p) => p.isServing && !p.isNotQualified && !p.requestedNoParticipation && !p.isIndefinitelyPaused);
      label = 'Ativos e Elegíveis';
    }

    const items: InfoListItem[] = filtered.slice(0, 15).map((p) => ({
      label: p.name,
      value: p.condition,
      detail: p.funcao || (p.isServing ? 'Ativo' : 'Pausado/Inativo'),
    }));

    if (filtered.length > 15) {
      items.push({
        label: 'Demais registros',
        value: `+${filtered.length - 15} publicador(es)`,
      });
    }

    return {
      title: `${label} (${filtered.length})`,
      summary: `Foram encontrados ${filtered.length} registro(s) em "${label}" no seu escopo de visualização.`,
      items,
    };
  },

  /**
   * Estatísticas congregacionais, Fila de Necessidades Locais ou Eventos Especiais
   */
  async getAnalyticsSummary(
    publishers: Publisher[],
    rawQuery: string
  ): Promise<{ title: string; summary: string; items: InfoListItem[] }> {
    const norm = normalizeName(rawQuery);

    if (norm.includes('fila') || norm.includes('necessidades locais') || norm.includes(' nl')) {
      const { data, error } = await supabase
        .from('local_needs_preassignments')
        .select('id, theme, assignee_name, order_position, target_week, assigned_to_part_id')
        .order('order_position', { ascending: true });

      if (error) {
        return {
          title: 'Fila de Necessidades Locais',
          summary: `Não foi possível consultar a Fila NL: ${error.message}`,
          items: [],
        };
      }

      const rows = (data || []) as Array<{
        id: string;
        theme: string;
        assignee_name: string;
        order_position: number;
        target_week?: string | null;
        assigned_to_part_id?: string | null;
      }>;

      const items: InfoListItem[] = rows.slice(0, 12).map((r) => ({
        label: `#${r.order_position} — ${r.theme}`,
        value: r.assignee_name,
        detail: r.assigned_to_part_id ? 'Já alocada' : r.target_week ? `Semana alvo: ${formatDateBr(r.target_week)}` : 'Aguardando próxima NL',
        badge: r.assigned_to_part_id ? 'Alocada' : 'Na fila',
      }));

      return {
        title: `Fila de Necessidades Locais (${rows.length})`,
        summary: rows.length
          ? `${rows.filter((r) => !r.assigned_to_part_id).length} tema(s) aguardando na fila (${rows.length} no total).`
          : 'A fila de Necessidades Locais está vazia no momento.',
        items,
      };
    }

    if (norm.includes('evento')) {
      const { data, error } = await supabase
        .from('special_events')
        .select('id, week, template_id, theme, is_applied, approval_status')
        .order('week', { ascending: true })
        .limit(20);

      if (error) {
        return {
          title: 'Eventos Especiais',
          summary: `Não foi possível consultar eventos especiais: ${error.message}`,
          items: [],
        };
      }

      const rows = (data || []) as Array<{
        week: string;
        template_id: string;
        theme?: string | null;
        is_applied?: boolean | null;
        approval_status?: string | null;
      }>;

      const items: InfoListItem[] = rows.map((ev) => ({
        label: `${formatDateBr(ev.week)} — ${ev.theme || ev.template_id}`,
        value: ev.is_applied ? 'Aplicado' : 'Pendente',
        detail: ev.approval_status ? `Aprovação CS: ${ev.approval_status}` : undefined,
      }));

      return {
        title: `Eventos Especiais (${rows.length})`,
        summary: rows.length ? `${rows.length} evento(s) registrado(s).` : 'Nenhum evento especial cadastrado.',
        items,
      };
    }

    const activePubs = publishers.filter((p) => p.isServing && !p.isNotQualified && !p.isIndefinitelyPaused);
    const brothers = activePubs.filter((p) => p.gender === 'brother').length;
    const sisters = activePubs.filter((p) => p.gender === 'sister').length;
    const elders = activePubs.filter((p) => normalizeName(p.condition).includes('anciao')).length;
    const ms = activePubs.filter((p) => normalizeName(p.condition).includes('servo')).length;

    const { data: partsRows } = await supabase
      .from('workbook_parts')
      .select('status')
      .gte('week_id', getTodayWeekIdLocal());

    const futureParts = (Array.isArray(partsRows) ? partsRows : []) as Array<{ status?: string }>;
    const countByStatus = {
      pendente: futureParts.filter((p) => p.status === WorkbookStatus.PENDENTE).length,
      proposta: futureParts.filter((p) => p.status === WorkbookStatus.PROPOSTA).length,
      designada: futureParts.filter((p) => p.status === WorkbookStatus.DESIGNADA || p.status === WorkbookStatus.APROVADA).length,
    };

    const items: InfoListItem[] = [
      { label: 'Publicadores Ativos', value: `${activePubs.length} (${brothers} irmãos · ${sisters} irmãs)` },
      { label: 'Anciãos e Servos', value: `${elders} ancião(s) · ${ms} servo(s) ministerial(is)` },
      { label: 'Partes Futuras — Pendentes', value: `${countByStatus.pendente}` },
      { label: 'Partes Futuras — Em Proposta', value: `${countByStatus.proposta}` },
      { label: 'Partes Futuras — Designadas', value: `${countByStatus.designada}` },
    ];

    return {
      title: 'Resumo e Estatísticas RVM',
      summary: `Panorama atual: ${activePubs.length} publicadores ativos e ${futureParts.length} partes futuras na apostila.`,
      items,
    };
  },
};

function resolveModalidadeFromHint(normHint: string): string {
  if (normHint.includes('president')) return EnumModalidade.PRESIDENCIA;
  if (normHint.includes('oracao')) return EnumModalidade.ORACAO;
  if (normHint.includes('leitor') && (normHint.includes('ebc') || normHint.includes('estudo'))) return EnumModalidade.LEITOR_EBC;
  if (normHint.includes('dirigente') || normHint.includes('ebc') || normHint.includes('estudo biblico')) return EnumModalidade.DIRIGENTE_EBC;
  if (normHint.includes('leitura')) return EnumModalidade.LEITURA_ESTUDANTE;
  if (normHint.includes('joias') || normHint.includes('tesouros') || normHint.includes('discurso')) return EnumModalidade.DISCURSO_ENSINO;
  if (normHint.includes('necessidades')) return EnumModalidade.NECESSIDADES_LOCAIS;
  if (normHint.includes('ajudante') || normHint.includes('demonstrac') || normHint.includes('iniciando') || normHint.includes('cultivando') || normHint.includes('fazendo')) {
    return EnumModalidade.DEMONSTRACAO;
  }
  return getModalidadeFromTipo(normHint, '') || EnumModalidade.DEMONSTRACAO;
}
