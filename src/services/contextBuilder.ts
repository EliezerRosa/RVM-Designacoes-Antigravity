/**
 * Context Builder - Constrói contexto para o Agente IA
 * 
 * Extrai e sumariza dados relevantes do app para enviar ao LLM
 */

import type { Publisher, WorkbookPart, HistoryRecord } from '../types';
import { getEligibilityStats, ELIGIBILITY_RULES_VERSION } from './eligibilityService';
import { getRankedCandidates, ROTATION_CONFIG, isStatPart } from './unifiedRotationService';
import { AGENT_CONTEXT_WEEKS, AGENT_HISTORY_LOOKBACK_WEEKS, AGENT_LIST_LOOKBACK_WEEKS } from '../constants/config';
import { toLocalISODate } from '../utils/dateUtils';

// Deve ser igual a ELIGIBILITY_RULES_VERSION sempre que o texto de regras lido pelo agente for atualizado
// (AdminDashboard audita a sincronia). Bump manual = confirmação de que o prompt reflete o motor.
export const RULES_TEXT_VERSION = '2026-10-09.04';

// ===== Tipos =====

export interface PublisherSummary {
    id: string;   // UUID do publicador
    name: string;
    gender: 'brother' | 'sister';
    condition: string;
    isServing: boolean;
    isBaptized: boolean;
    privileges: string[];
}

export interface ParticipationSummary {
    publisherName: string;
    date: string;
    partType: string;
    funcao: string;
    title: string; // NEW
}

// NOVO: Designação detalhada de uma parte
export interface PartDesignation {
    tipoParte: string;
    tituloParte: string;
    section: string; // Seção da parte (ex: "Faça Seu Melhor no Ministério")
    funcao: 'Titular' | 'Ajudante';
    designado: string;
    status: string;
    horaInicio: string;
    date: string; // Data real da parte (YYYY-MM-DD)
    duracao?: string;
    descricao?: string;
    id: string; // ID da parte para ações do agente
}

// NOVO: Designações de uma semana
export interface WeekDesignation {
    weekId: string;
    weekDisplay: string;
    date: string;
    parts: PartDesignation[];
}

// NOVO: Informações sensíveis de publicador (só para Anciãos)
export interface SensitivePublisherInfo {
    name: string;
    isServing: boolean;
    isNotQualified?: boolean;
    notQualifiedReason?: string;
    requestedNoParticipation?: boolean;
    noParticipationReason?: string;
}

// NOVO: Resumo de evento especial
export interface SpecialEventSummary {
    week: string;
    templateId: string;
    templateName: string;
    theme?: string;
    assignee?: string;
    isApplied: boolean;
    observations?: string; // NEW
    guidelines?: string;   // NEW
    details?: any;         // NEW
}

// NOVO: Resumo de fila de necessidades locais
export interface LocalNeedsSummary {
    theme: string;
    assignee: string;
    position: number;
    targetWeek?: string;
    isAssigned: boolean;
}

// NOVO: Analytics de participação
export interface ParticipationAnalytics {
    totalParticipations: number;
    avgPerPublisher: number;
    mostActive: Array<{ name: string; count: number }>;
    leastActive: Array<{ name: string; lastDate: string | null }>;
    recent?: {
        periodLabel: string;
        topActive: string;
    };
}

export interface AgentContext {
    // Resumo de publicadores
    totalPublishers: number;
    activePublishers: number;
    publishers: PublisherSummary[];

    // Estatísticas de elegibilidade
    eligibilityStats: Record<string, number>;

    // Participações recentes
    recentParticipations: ParticipationSummary[];

    // Partes pendentes
    pendingPartsCount: number;
    pendingPartsByWeek: Record<string, number>;

    // NOVO: Designações da semana atual e próximas
    weekDesignations: WeekDesignation[];

    // NOVO: Semana atual
    currentWeek: string;

    // NOVO: Eventos especiais
    specialEvents: SpecialEventSummary[];

    // NOVO: Fila de necessidades locais
    localNeedsQueue: LocalNeedsSummary[];

    // NOVO: Analytics
    participationAnalytics: ParticipationAnalytics;

    // NOVO: Sugestões de Prioridade (Pré-calculadas)
    priorityCandidates: string[];

    // NOVO (#3 do pacote 2026-04-30): Ranking PRÉ-COMPUTADO por parte pendente.
    // Para cada parte sem designado, lista os top-K candidatos com score, weeksSinceLast
    // e marcação se está no pool empatado no topo. Permite ao agente RATIFICAR a escolha
    // determinística em vez de inferir elegibilidade no zero (que se mostrou pior que aleatório).
    rankedByPart: Array<{
        partId: string;
        weekDisplay: string;
        section: string;
        tipoParte: string;
        funcao: string;
        topCandidates: Array<{
            name: string;
            rank: number;
            proximityCost: number;
            recentCount: number;
            weeksSinceLast: number;
            isInTopPool: boolean;
        }>;
    }>;

    // Data atual
    currentDate: string;
}

// ===== Funções =====

/**
 * Converte Publisher para resumo compacto e completo
 */
function summarizePublisher(p: Publisher, parentLookup?: Map<string, string>): any {
    const privileges: string[] = [];
    if (p.privileges.canPreside) privileges.push('Presidir');
    if (p.privileges.canPray) privileges.push('Orar');
    if (p.privileges.canGiveTalks) privileges.push('Discursos');
    if (p.privileges.canConductCBS) privileges.push('Dirigir EBC');
    if (p.privileges.canReadCBS) privileges.push('Ler EBC');
    if (p.privileges.canGiveStudentTalks) privileges.push('Estudante');

    const avail = {
        mode: p.availability?.mode || 'always',
        exceptionDates: p.availability?.exceptionDates || [],
        availableDates: p.availability?.availableDates || []
    };

    const restrictions: string[] = [];
    if (!p.isServing) restrictions.push('Inativo');
    if (p.isNotQualified) restrictions.push(`ÑQualificado(${p.notQualifiedReason || ''})`);
    if (p.requestedNoParticipation) restrictions.push(`PediuSair(${p.noParticipationReason || ''})`);
    if (p.isIndefinitelyPaused) restrictions.push(`Pausado(${p.indefinitePauseReason || 'Admin'})`);
    if (avail.mode === 'never') restrictions.push('Indisponível(Geral)');
    if (p.isHelperOnly) restrictions.push('ApenasAjudante');
    if (!p.canPairWithNonParent && (p.parentIds || []).length > 0) restrictions.push('ApenasComPais');

    // Section Privileges (Lockouts)
    if (p.privilegesBySection) {
        if (!p.privilegesBySection.canParticipateInTreasures) restrictions.push('BloqTesouros');
        if (!p.privilegesBySection.canParticipateInMinistry) restrictions.push('BloqMinisterio');
        if (!p.privilegesBySection.canParticipateInLife) restrictions.push('BloqVida');
    }

    // Resolve Pais
    const parentNames = (p.parentIds || []) && parentLookup
        ? (p.parentIds || []).map(id => parentLookup.get(id)).filter(Boolean)
        : [];

    return {
        id: p.id,   // UUID do publicador
        name: p.name,
        gender: p.gender,
        condition: p.condition,
        isServing: p.isServing,
        isBaptized: p.isBaptized,
        phone: p.phone,
        aliases: p.aliases || [],
        privileges,
        ageGroup: p.ageGroup,
        hasParents: parentNames.length > 0,
        parentNames: parentNames,
        availability: avail.mode === 'always'
            ? avail.exceptionDates.length > 0
                ? `Sempre (Exceto: [${avail.exceptionDates.join(', ')}])`
                : 'Sempre'
            : avail.mode === 'never'
                ? avail.availableDates.length > 0
                    ? `Apenas: [${avail.availableDates.join(', ')}]`
                    : 'Nunca'
                : `Apenas: [${avail.availableDates.join(', ')}]`,
        restrictions
    };
}



/**
 * Constrói o contexto completo para o agente
 */
export interface ContextOptions {
    includePublishers?: boolean;
    includeRules?: boolean;
    includeSchedule?: boolean;
    includeHistory?: boolean;
    includeSpecialEvents?: boolean;
}

/**
 * Constrói o contexto completo para o agente (Modular)
 */
export function buildAgentContext(
    publishers: Publisher[],
    parts: WorkbookPart[],
    _history: HistoryRecord[] = [],
    specialEvents: SpecialEventInput[] = [],
    localNeeds: LocalNeedsInput[] = [],
    options: ContextOptions = {
        includePublishers: true, // Default safe
        includeRules: true,
        includeSchedule: true,
        includeHistory: false,
        includeSpecialEvents: true
    },
    focusWeekId?: string // New Param
): AgentContext {
    // Filtrar publicadores ativos
    const activePublishers = publishers.filter(p => p.isServing);

    // Sumarizar publicadores (Se solicitado)
    let publisherSummaries: any[] = [];
    if (options.includePublishers) {
        // Criar mapa de lookup para nomes de pais
        const pubMap = new Map<string, string>();
        publishers.forEach(p => pubMap.set(p.id, p.name));

        publisherSummaries = publishers.map(p => summarizePublisher(p, pubMap));
    }

    // Estatísticas de elegibilidade
    const eligibilityStats = getEligibilityStats(publishers);



    // Participações recentes (Lista para o Agente)
    // v9.6: Usar janela de tempo fixa (AGENT_LIST_LOOKBACK_WEEKS) para economizar tokens
    let recentParticipations: ParticipationSummary[] = [];

    if (options.includeHistory) {
        const listLookbackDate = new Date();
        listLookbackDate.setDate(listLookbackDate.getDate() - (AGENT_LIST_LOOKBACK_WEEKS * 7));

        // v9.7: Usar _history (completo/paginado) preferencialmente sobre parts (limitado à UI)
        // Isso garante que o Agente veja participações antigas ou futuros (2026) fora da view atual
        const sourceData = (_history && _history.length > 0) ? _history : parts;

        recentParticipations = sourceData
            .filter(p => {
                const pDate = new Date(p.date); // Funciona para HistoryRecord e WorkbookPart
                // Validar data e garantir que tem publicador
                // E FILTRAR PARTES EXCLUÍDAS (Cântico, Oração, etc)
                return !isNaN(pDate.getTime()) &&
                    pDate >= listLookbackDate &&
                    p.resolvedPublisherName &&
                    isStatPart(p.tipoParte || p.funcao || '');
            })
            .sort((a, b) => b.date.localeCompare(a.date))
            .map(p => ({
                publisherName: p.resolvedPublisherName || '',
                date: p.date,
                partType: p.tipoParte,
                funcao: p.funcao,
                title: p.tituloParte
            }));
    }

    // Partes pendentes
    const pendingParts = parts.filter(p =>
        p.status !== 'DESIGNADA' &&
        p.status !== 'CONCLUIDA' &&
        p.status !== 'CANCELADA'
    );

    const pendingPartsByWeek = pendingParts.reduce((acc, p) => {
        const week = p.weekDisplay || p.weekId;
        acc[week] = (acc[week] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    // Agrupar designações por semana (TODAS com partes)
    const today = toLocalISODate();
    const weekMap = new Map<string, WeekDesignation>();

    // Ordenar parts por data
    const sortedParts = [...parts].sort((a, b) => a.date.localeCompare(b.date));

    for (const part of sortedParts) {
        // Considerar TODAS as partes, mesmo sem designação (v9.5: Fix Blindness)
        // FIX A (2026-04-29): label inequívoco — '🟥 VAGA (sem designado)' impede o LLM
        // de pegar nome de outra linha por engano (ver bug Israel Vieira em Joias).
        // FIX B (2026-05-14): resolvedPublisherName pode ser null se salvo só com ID.
        // Fonte da verdade = resolvedPublisherId → publishers lookup (padrão do S-140).
        let designado = part.resolvedPublisherName || part.rawPublisherName || '';
        if (!designado && part.resolvedPublisherId) {
            const pub = publishers.find(p => p.id === part.resolvedPublisherId);
            if (pub) designado = pub.name;
        }
        if (!designado) designado = '🟥 VAGA (sem designado)';
        // if (!designado) continue; // REMOVIDO: Agente precisa ver buracos na agenda

        const weekId = part.weekId;
        if (!weekMap.has(weekId)) {
            weekMap.set(weekId, {
                weekId,
                weekDisplay: part.weekDisplay,
                date: part.date,
                parts: [],
            });
        }

        // FIX C (2026-04-29): incluir TODA parte com designado real OU parte canônica.
        // Antes filtrava só MAIN/Presidente/Oração/Comentários — Necessidades Locais, EBC,
        // Leitor EBC, Cânticos com designado ficavam invisíveis para o LLM, gerando
        // alucinação tipo "Marcos não está designado em outra parte" quando ele tinha NL.
        const tLower = (part.tipoParte || '').toLowerCase();
        const pLower = (part.tituloParte || '').toLowerCase();
        const hasRealAssignee = !!(part.resolvedPublisherName || part.rawPublisherName || part.resolvedPublisherId);
        const isCanonicalPart = isStatPart(pLower || tLower || part.funcao || '') ||
            tLower.includes('presidente') ||
            tLower.includes('oração') || pLower.includes('oração') ||
            tLower.includes('comentários') || pLower.includes('comentários');

        if (hasRealAssignee || isCanonicalPart) {
            weekMap.get(weekId)!.parts.push({
                id: part.id,
                tipoParte: part.tipoParte,
                tituloParte: part.tituloParte,
                section: part.section || 'Geral', // Seção da parte
                funcao: part.funcao,
                designado,
                status: part.status,
                horaInicio: part.horaInicio,
                date: part.date,
            });
        }
    }

    // v9.2.2: Limitar semanas ao contexto do agente para evitar timeout da API
    // Inclui: últimas N semanas (referência) + próximas M semanas (operação)
    const historyLimitDate = new Date();
    historyLimitDate.setDate(historyLimitDate.getDate() - (AGENT_HISTORY_LOOKBACK_WEEKS * 7));
    const futureLimitDate = new Date();
    futureLimitDate.setDate(futureLimitDate.getDate() + (AGENT_CONTEXT_WEEKS * 7));

    const allWeeks = Array.from(weekMap.values());
    let weekDesignations: WeekDesignation[] = [];

    if (options.includeSchedule) {
        const historyLimitDate = new Date();
        historyLimitDate.setDate(historyLimitDate.getDate() - (AGENT_HISTORY_LOOKBACK_WEEKS * 7));
        const futureLimitDate = new Date();
        // Limita futuro se só quiser verificar regras, mas mantém contexto
        futureLimitDate.setDate(futureLimitDate.getDate() + (AGENT_CONTEXT_WEEKS * 7));

        weekDesignations = allWeeks.filter(w => {
            const weekDate = new Date(w.date);
            return weekDate >= historyLimitDate && weekDate <= futureLimitDate;
        });
    }

    // Determinar semana atual (ou Focada)
    // Se focusWeekId for fornecido (via navegação UI), ele tem prioridade sobre o 'hoje'
    let currentWeek = 'N/A';

    if (focusWeekId) {
        // Tentar encontrar a semana específica
        const focused = allWeeks.find(w => w.weekId === focusWeekId);
        if (focused) {
            currentWeek = focused.weekDisplay;
        } else {
            // Se não achou (ex: weekId '2026-02-23' mas não tem partes ainda), 
            // formatamos o ID como display provisório se for data válida
            currentWeek = focusWeekId; // Fallback
        }
    } else {
        // Fallback p/ comportamento original: Data >= Hoje
        const currentWeekData = allWeeks.find(w => w.date >= today);
        currentWeek = currentWeekData?.weekDisplay || 'N/A';
    }

    // Processar eventos especiais
    const specialEventsSummary: SpecialEventSummary[] = specialEvents.map(e => ({
        week: e.week,
        templateId: e.templateId,
        templateName: e.templateName || e.templateId,
        theme: e.theme,
        assignee: e.responsible,
        isApplied: e.isApplied || false,
        observations: e.observations,
        guidelines: e.guidelines,
        details: e.configuration // Exposing configuration as 'details'
    }));

    // Processar fila de necessidades locais
    const localNeedsQueue: LocalNeedsSummary[] = localNeeds.map(ln => ({
        theme: ln.theme,
        assignee: ln.assigneeName,
        position: ln.orderPosition,
        targetWeek: ln.targetWeek || undefined,
        isAssigned: !!ln.assignedToPartId,
    }));

    // Analytics de participação (usa lista completa 'parts')
    const participationAnalytics = buildParticipationAnalytics(parts, publishers);

    // GERAR LISTA DE PRIORIDADE (GENÉRICA) — ordem lexicográfica real (proximidade › carga › frescor), parte "Generic".
    const historyRecords = _history.length > 0 ? _history : parts.map(p => ({
        ...p,
        duracao: parseInt(p.duracao) || 0,
        rawPublisherName: p.rawPublisherName || '',
        resolvedPublisherName: p.resolvedPublisherName || '',
        status: p.status as any,
        importSource: 'Context',
        importBatchId: 'generated',
        createdAt: new Date().toISOString()
    } as unknown as HistoryRecord)); // Fallback simples se history não vier

    const priorityList = getRankedCandidates(activePublishers, 'Generic', historyRecords)
        .slice(0, 20) // Top 20
        .map((r, i) => `${i + 1}. ${r.publisher.name}: ${r.scoreData.explanation}`);

    // RANKING POR PARTE PENDENTE (#3 do pacote 2026-04-30).
    // Top-5 candidatos por parte sem designado, com score específico do tipoParte.
    // Custo: O(parts × publishers × log publishers); aceitável até ~50 partes.
    const TOP_K = 5;
    const rankedByPart = pendingParts.slice(0, 30).map(part => {
        const refDate = part.date ? new Date(part.date + 'T12:00:00') : new Date();
        const histForRanking = historyRecords.filter(h => h.weekId !== part.weekId);
        const ranked = getRankedCandidates(activePublishers, part.tipoParte, histForRanking, undefined, refDate);
        const top = ranked.slice(0, TOP_K);
        const topKey = top.length > 0 ? `${top[0].scoreData.details.proximityCost}|${top[0].scoreData.details.recentCount}` : '';
        return {
            partId: part.id,
            weekDisplay: part.weekDisplay,
            section: part.section,
            tipoParte: part.tipoParte,
            funcao: part.funcao,
            topCandidates: top.map((r, i) => ({
                name: r.publisher.name,
                rank: i + 1,
                proximityCost: r.scoreData.details.proximityCost,
                recentCount: r.scoreData.details.recentCount,
                weeksSinceLast: r.scoreData.weeksSinceLast,
                // Empate nas duas primeiras chaves com o 1º colocado — "igualmente devidos".
                isInTopPool: `${r.scoreData.details.proximityCost}|${r.scoreData.details.recentCount}` === topKey,
            })),
        };
    });

    return {
        totalPublishers: publishers.length,
        activePublishers: activePublishers.length,
        publishers: publisherSummaries,
        eligibilityStats,
        recentParticipations,
        pendingPartsCount: pendingParts.length,
        pendingPartsByWeek,
        weekDesignations,
        currentWeek,
        specialEvents: specialEventsSummary,
        localNeedsQueue,
        participationAnalytics,
        priorityCandidates: priorityList,
        rankedByPart,
        currentDate: toLocalISODate(),
    };
}


// Tipos de entrada para os novos dados (exportados para agentService)
export interface SpecialEventInput {
    week: string;
    templateId: string;
    templateName?: string;
    theme?: string;
    responsible?: string;
    isApplied?: boolean;
    observations?: string;
    guidelines?: string;
    configuration?: any;
}

export interface LocalNeedsInput {
    theme: string;
    assigneeName: string;
    orderPosition: number;
    targetWeek?: string | null;
    assignedToPartId?: string | null;
}

/**
 * Calcula analytics de participação
 */
function buildParticipationAnalytics(
    parts: WorkbookPart[],
    publishers: Publisher[]
): ParticipationAnalytics {
    // Contar participações por publicador
    const participationCount = new Map<string, number>();
    const lastParticipation = new Map<string, string>();

    for (const part of parts) {
        // Tenta usar nome resolvido, senão raw, senão ignora
        const name = part.resolvedPublisherName || part.rawPublisherName;
        if (!name || name === 'N/A') continue;

        participationCount.set(name, (participationCount.get(name) || 0) + 1);

        const currentLast = lastParticipation.get(name);
        if (!currentLast || part.date > currentLast) {
            lastParticipation.set(name, part.date);
        }
    }

    const totalParticipations = Array.from(participationCount.values()).reduce((a, b) => a + b, 0);
    const activePublishersCount = publishers.filter(p => p.isServing).length;
    const avgPerPublisher = activePublishersCount > 0 ? totalParticipations / activePublishersCount : 0;

    // Top 5 mais ativos
    const sortedByCount = Array.from(participationCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

    // Top 5 menos ativos (com base na última participação)
    const leastActive: Array<{ name: string; lastDate: string | null }> = [];

    for (const pub of publishers.filter(p => p.isServing)) {
        const lastDate = lastParticipation.get(pub.name) || null;
        leastActive.push({ name: pub.name, lastDate });
    }

    leastActive.sort((a, b) => {
        if (!a.lastDate && !b.lastDate) return 0;
        if (!a.lastDate) return -1;
        if (!b.lastDate) return 1;
        return a.lastDate.localeCompare(b.lastDate);
    });

    return {
        totalParticipations,
        avgPerPublisher: Math.round(avgPerPublisher * 10) / 10,
        mostActive: sortedByCount,
        leastActive: leastActive.slice(0, 5),
        // NEW: Analytics Recente (Últimos 3 meses / 12 semanas) - Alinhado com a Regra de Frequência
        recent: buildRecentStats(parts, 12)
    };
}

/**
 * Helper para estatísticas recentes (8 semanas)
 */
function buildRecentStats(allParts: WorkbookPart[], weeks: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - (weeks * 7));
    const cutoffStr = toLocalISODate(cutoffDate);

    // Filtrar partes recentes
    const recentParts = allParts.filter(p => p.date >= cutoffStr);

    // Contar
    const counts = new Map<string, number>();
    recentParts.forEach(p => {
        const name = p.resolvedPublisherName || p.rawPublisherName;
        if (name && name !== 'N/A') {
            counts.set(name, (counts.get(name) || 0) + 1);
        }
    });

    // Top 5 Recentes
    const topRecent = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10) // Top 10 para dar mais visão
        .map(([name, count]) => `${name}(${count})`);

    return {
        periodLabel: `Últimos ${weeks} semanas (desde ${cutoffDate.toLocaleDateString('pt-BR')})`,
        topActive: topRecent.join(', ') || 'Nenhuma atividade recente registrada.'
    };
}

/**
 * Formata contexto como texto para o prompt
 */
export function formatContextForPrompt(context: AgentContext): string {
    const lines: string[] = [];

    lines.push(`=== DADOS DO AMBIENTE (Data: ${context.currentDate} | SEMANA EM FOCO: ${context.currentWeek}) ===\n`);
    lines.push(`NOTA: O usuário está olhando para a semana '${context.currentWeek}'. Responda considerando esta como a semana atual de trabalho.\n`);

    // Estatísticas gerais
    lines.push(`RESUMO DA CONGREGAÇÃO:`);
    lines.push(`- Total Publicadores: ${context.totalPublishers}`);
    lines.push(`- Ativos: ${context.activePublishers}`);
    lines.push(`- Anciãos/SM: ${context.eligibilityStats.eldersAndMS}`);
    lines.push(`- Irmãos/Irmãs: ${context.eligibilityStats.brothers}/${context.eligibilityStats.sisters}\n`);

    // LISTA DE PUBLICADORES (CONDICIONAL)
    if (context.publishers && context.publishers.length > 0) {
        const elders = context.publishers.filter((p: any) => p.condition.includes('Anci'));
        const servants = context.publishers.filter((p: any) => p.condition.includes('Servo'));
        // Publicadores regulares: Limitar para economizar tokens se muitos
        const regular = context.publishers.filter((p: any) => !p.condition.includes('Anci') && !p.condition.includes('Servo'));

        const formatPub = (p: any) => {
            // Compact Format: Nome (M/F) | Cond | Privs... | Avail | Meta
            const info = [];
            if (p.phone) info.push(`📞${p.phone}`);
            if (p.ageGroup && p.ageGroup !== 'Adulto') info.push(p.ageGroup);
            if (p.hasParents) info.push(`FilhoDe[${p.parentNames?.join(',')}]`);
            if (p.aliases && p.aliases.length > 0) info.push(`Apelidos[${p.aliases.join(',')}]`);
            if (p.privileges && p.privileges.length > 0) info.push(`[${p.privileges.join(',')}]`); // Compact logic
            if (p.availability && p.availability !== 'Sempre (0 exceções)') info.push(`📅${p.availability}`); // Show availability if not default
            if (p.restrictions && p.restrictions.length > 0) info.push(`🛑${p.restrictions.join(',')}`);

            return `- ${p.name} (${p.gender === 'brother' ? 'Ir' : 'Ira'}) | ${info.join('|')}`;
        };

        lines.push(`=== LISTA DE PUBLICADORES ===`);
        lines.push(`\n-- ANCIÃOS (${elders.length}) --`);
        elders.forEach(p => lines.push(formatPub(p)));

        lines.push(`\n-- SERVOS (${servants.length}) --`);
        servants.forEach(p => lines.push(formatPub(p)));

        if (regular.length > 0) {
            lines.push(`\n-- PUBLICADORES (${regular.length}) --`);
            // Otimização: Se > 50 pubs, listar apenas nomes ou compactar drasticamente?
            // Por enquanto, formato compacto.
            regular.forEach(p => lines.push(formatPub(p)));
        }
    } else {
        lines.push(`(Lista de publicadores omitida para economizar tokens. Se precisar, solicite especificamente.)`);
    }

    // REGISTRO COMPACTO UUID <-> NOME (para ações diretas do agente)
    if (context.publishers && context.publishers.length > 0) {
        lines.push(`\n=== REGISTRO DE PUBLICADORES [USE PARA UUID EM AÇÕES] ===`);
        // Formato: Nome [PUB:uuid] | Nome [PUB:uuid] | ...
        const regLines: string[] = [];
        (context.publishers as any[]).forEach(p => {
            if (p.id && typeof p.id === 'string' && p.id.trim()) regLines.push(`${p.name} [PUB:${p.id}]`);
        });
        // Agrupar em linhas de 4 para não poluir o prompt
        for (let i = 0; i < regLines.length; i += 4) {
            lines.push(regLines.slice(i, i + 4).join(' | '));
        }
        lines.push('');
    }

    // Designações por semana
    if (context.weekDesignations.length > 0) {
        lines.push(`\n=== DESIGNAÇÕES (HISTÓRICO E FUTURO) ===\n`);
        for (const week of context.weekDesignations) {
            const isCurrentWeek = week.weekDisplay === context.currentWeek;
            const yearFromDate = week.date ? week.date.split('-')[0] : '';
            const displayWithYear = week.weekDisplay.includes(yearFromDate) ? week.weekDisplay : `${week.weekDisplay} ${yearFromDate}`;

            if (isCurrentWeek) {
                lines.push(`╔══ SEMANA EM FOCO: ${displayWithYear} (${week.weekId}) ══╗`);
            } else {
                lines.push(`📅 ${displayWithYear} (${week.weekId})`);
            }

            const sortedParts = [...week.parts].sort((a, b) =>
                a.horaInicio.localeCompare(b.horaInicio)
            );

            // Agrupar partes por seção para orientar o agente sobre "primeira da seção X"
            const sectionMap = new Map<string, PartDesignation[]>();
            for (const part of sortedParts) {
                const sec = part.section || 'Geral';
                if (!sectionMap.has(sec)) sectionMap.set(sec, []);
                sectionMap.get(sec)!.push(part);
            }

            // Ordem canônica: Tesouros → Ministério → Vida Cristã → resto
            const SECTION_ORDER = ['Tesouros da Palavra de Deus', 'Faça Seu Melhor no Ministério', 'Nossa Vida Cristã'];
            const orderedSections = [
                ...SECTION_ORDER.filter(s => sectionMap.has(s)),
                ...[...sectionMap.keys()].filter(s => !SECTION_ORDER.includes(s))
            ];

            for (const sectionName of orderedSections) {
                const sectionParts = sectionMap.get(sectionName)!;
                lines.push(`  [§ ${sectionName}]`);
                sectionParts.forEach((part, idx) => {
                    const funcaoLabel = part.funcao === 'Ajudante' ? ' (Ajudante)' : '';
                    const timeInfo = part.horaInicio ? `[${part.horaInicio}]` : '';
                    const durationInfo = part.duracao ? ` (${part.duracao} min)` : '';
                    const details = part.descricao ? ` - "${part.descricao}"` : '';
                    const dp = part.date ? part.date.split('-') : [];
                    const dateLabel = dp.length === 3 ? ` | ${dp[2]}/${dp[1]}/${dp[0]}` : '';
                    const pos = `${idx + 1}ª`;
                    lines.push(`    ${pos} ${timeInfo}${dateLabel} ${part.tituloParte}${details}${durationInfo}${funcaoLabel}: ${part.designado} [ID: ${part.id}]`);
                });
            }
            lines.push('');
        }
    }

    // Partes pendentes
    lines.push(`PARTES PENDENTES: ${context.pendingPartsCount}`);
    Object.entries(context.pendingPartsByWeek).forEach(([week, count]) => {
        lines.push(`- ${week}: ${count} partes`);
    });

    // Eventos Especiais
    if (context.specialEvents.length > 0) {
        lines.push(`\n=== EVENTOS ESPECIAIS ===`);
        for (const event of context.specialEvents) {
            lines.push(`${event.isApplied ? '✅' : '⏳'} ${event.week}: ${event.templateName} (${event.theme || 'Sem tema'})`);
            if (event.assignee) lines.push(`   - Responsável: ${event.assignee}`);
            if (event.observations) lines.push(`   - Obs: ${event.observations}`);
            if (event.guidelines) lines.push(`   - Diretrizes: ${event.guidelines}`);
        }
    }

    // Fila de Necessidades Locais
    if (context.localNeedsQueue.length > 0) {
        lines.push(`\n=== NECESSIDADES LOCAIS ===`);
        for (const ln of context.localNeedsQueue) {
            lines.push(`#${ln.position} ${ln.theme} -> ${ln.assignee} ${ln.isAssigned ? '(Já designado)' : '(Pendente)'}`);
        }
    }

    if (context.participationAnalytics) {
        lines.push(`\n=== ESTATÍSTICAS (Média: ${context.participationAnalytics.avgPerPublisher}) ===`);
        lines.push(`Mais ativos (Total): ${context.participationAnalytics.mostActive.map(p => `${p.name}(${p.count})`).join(', ')}`);
        if (context.participationAnalytics.recent) {
            lines.push(`Recentes (${context.participationAnalytics.recent.periodLabel}): ${context.participationAnalytics.recent.topActive}`);
        }
        lines.push(`Menos ativos: ${context.participationAnalytics.leastActive.map(p => `${p.name}(${p.lastDate || 'Nunca'})`).join(', ')}`);
    }

    // LISTA DE PARTICIPAÇÕES RECENTES (LOG)
    if (context.recentParticipations && context.recentParticipations.length > 0) {
        lines.push(`\n=== HISTÓRICO DE DESIGNAÇÕES (LOG DETALHADO) ===`);
        // Limitar a ~800 itens (Aprox 1 ano em cong. médias) para evitar estouro
        const historyLimit = context.recentParticipations.length > 800 ? 800 : context.recentParticipations.length;

        for (let i = 0; i < historyLimit; i++) {
            const p = context.recentParticipations[i];
            const title = p.title ? `[${p.title}] ` : '';
            // Formatar data com ano explícito para clareza
            const formattedDate = p.date; // Já está YYYY-MM-DD, que é claro
            lines.push(`${formattedDate} | ${p.partType} | ${title}-> ${p.publisherName}`);
        }
        if (context.recentParticipations.length > historyLimit) {
            lines.push(`(... e mais ${context.recentParticipations.length - historyLimit} registros antigos omitidos)`);
        }
    }

    // Prioridade (Sugestões do Sistema)
    if (context.priorityCandidates && context.priorityCandidates.length > 0) {
        lines.push(`\n=== SUGESTÃO DE PRIORIDADE (ALTA ROTAÇÃO) ===`);
        lines.push(`Use esta lista como base para sugerir designações justas:`);
        context.priorityCandidates.forEach(cand => lines.push(`⭐ ${cand}`));
    }

    return lines.join('\n');
}



/**
 * Gera regras de elegibilidade como texto
 */
export function getEligibilityRulesText(): string {
    return `
REGRAS DE ELEGIBILIDADE DO SISTEMA:

1. PRESIDENTE DA REUNIÃO:
   - Somente quem tem privilégio canPreside
   - Normalmente Anciãos ou SM aprovados

2. ORAÇÃO (Inicial e Final):
   - Somente irmãos batizados (gender = brother, isBaptized = true)
   - Oração inicial requer privilégio canPreside

3. DISCURSO DE ENSINO (Tesouros, Joias, Vida Cristã):
   - Somente Anciãos ou Servos Ministeriais
   - Irmãs não podem fazer discursos de ensino

4. LEITURA DA BÍBLIA:
   - Somente irmãos (gender = brother)
   - Qualquer publicador qualificado

5. DEMONSTRAÇÃO:
   - PRIORIDADE ABSOLUTA: Designe IRMÃS sempre que possível.
   - Irmãos só devem ser designados se nenhuma irmã estiver disponível.
   - AJUDANTE: DEVE ser OBRIGATORIAMENTE do mesmo sexo que o titular.
   - Irmã + Irmã = OK
   - Irmão + Irmão = OK
   - Irmão + Irmã = PROIBIDO (Incompatibilidade de gênero)
   - Irmã + Irmão = PROIBIDO (Incompatibilidade de gênero)

6. DISCURSO DE ESTUDANTE:
   - Somente irmãos
   - Irmãs não podem fazer

7. DIRIGENTE EBC:
   - Somente Anciãos
   - Requer privilégio canConductCBS

8. LEITOR EBC:
   - Somente irmãos
   - Requer privilégio canReadCBS

SISTEMA DE ROTAÇÃO (modelo lexicográfico — versão ${ELIGIBILITY_RULES_VERSION}):
- NÃO existe score aditivo decisório nem cooldown bloqueante. O "cooldown de 3 semanas" é só indicador visual.
- Passo 1 — FAIXA (bucket; menor vem primeiro, vence qualquer outro critério):
  · Presidente: faixa = nº de presidências nas últimas ${ROTATION_CONFIG.PRESIDENCY_CYCLE_WINDOW_WEEKS} semanas (fila cíclica: ninguém preside pela k+1ª vez enquanto houver elegível disponível com k).
  · Partes de estudante (leitura, demonstração, discurso de estudante): ancião/SM sem nenhuma parte de estudante (titular ou ajudante) em ±${ROTATION_CONFIG.STUDENT_PART_GUARANTEE_WEEKS} semanas → faixa 0 (antes das irmãs), no máximo ${ROTATION_CONFIG.STUDENT_GUARANTEE_MAX_PER_WEEK} por semana. Fora disso: demonstração irmãs 1 › irmãos 2 › SM 3 › anciãos 4; leitura/discurso publicador 1 › SM 2 › ancião 3.
  · Leitor EBC: publicador 1 › SM 2 › ancião 3. Oração Final: sem outra parte na semana 1 › com parte 2; presidente nunca.
- Passo 2 — dentro da faixa, ordem ESTRITA: (1) menor proximidade de qualquer parte MAIN em ±${ROTATION_CONFIG.HEAVY_ROLE_RADIUS} semanas (passado e futuro, graduada pela distância); (2) menor carga em ±12 semanas (partes passadas E já marcadas); (3) mais semanas desde a última vez NESTA parte; (4) há mais tempo sem qualquer parte; (5) menos participações no ano; (6) nome.
- MAIN = toda parte designável exceto Oração Final, cânticos e derivadas do presidente. Ajudante conta como MAIN. Necessidades Locais conta.
- Oração Final não conta como carga ao avaliar outras partes.
- GATES relaxáveis (nunca deixam parte vazia; relaxam em cascata se o pool esvaziar): não repetir a MESMA parte em ±${ROTATION_CONFIG.HEAVY_ROLE_RADIUS} sem; rotação intra-seção (Tesouros: Discurso↔Joias; Vida Cristã: Parte VC↔Dirigente EBC); alternância FSM e par recente (regras B e C abaixo).
- GATES absolutos: elegibilidade estrutural, disponibilidade, uma parte por semana (exceto Oração Final).

BLOQUEIOS AUTOMÁTICOS:
- isServing = false → Não designar
- isNotQualified = true → Não designar
- requestedNoParticipation = true → Não designar
- Indisponível na data → Não designar

REGRAS DO MOTOR AUTOMÁTICO (aplicadas SÓ na geração automática; designação manual fica livre):

A. BYPASS DE GÊNERO PARA AJUDANTE (cônjuge / pai-filho):
   - Cônjuges podem ser par mesmo em demonstrações independente do gênero.
   - Pai/mãe e filho(a) também podem ser par.
   - Motor automático respeita esse bypass ao escolher o Ajudante.

B. ALTERNÂNCIA FSM (Titular ↔ Ajudante) — janela ${ROTATION_CONFIG.ROLE_ALTERNATION_WINDOW_WEEKS} semanas:
   - Em partes FSM (leitura, demonstração, discurso estudante), o Motor força alternância bidirecional.
   - Quem foi Titular FSM recentemente NÃO recebe novo Titular FSM dentro da janela (deve aparecer como Ajudante).
   - Quem foi Ajudante FSM recentemente NÃO recebe novo Ajudante FSM dentro da janela (deve aparecer como Titular).
   - ESCAPE: publicador marcado "Só Ajudante" (isHelperOnly) está isento — pode ser Ajudante repetidas vezes.

C. NÃO-REPETIÇÃO DE PAR (titular + ajudante) — janela ${ROTATION_CONFIG.PAIR_REPETITION_WINDOW_WEEKS} semanas:
   - O Motor veta dar a mesma dupla titular+ajudante em demonstrações dentro da janela.
   - BYPASS: cônjuges e pai/filho podem repetir o par sem restrição.

IMPORTANTE PARA EXPLICAÇÕES:
- Se uma parte ficou PENDENTE/VAZA após geração automática, pode ser por cooldown, bloqueio automático OU por uma das regras A/B/C acima. Use EXPLAIN_PART para identificar a razão real — não invente motivo.
- Designação manual (Apostila/Dropdown) NÃO aplica B e C; o operador pode forçar. A UI mostra um aviso amarelo quando o Motor desaconselharia.
    `.trim();
}

/**
 * Constrói contexto sensível (só para Anciãos)
 * Contém informações sobre bloqueios e razões de não-participação
 */
export function buildSensitiveContext(publishers: Publisher[]): SensitivePublisherInfo[] {
    return publishers
        .filter(p =>
            !p.isServing ||
            p.isNotQualified ||
            p.requestedNoParticipation
        )
        .map(p => ({
            name: p.name,
            isServing: p.isServing,
            isNotQualified: p.isNotQualified,
            notQualifiedReason: p.notQualifiedReason,
            requestedNoParticipation: p.requestedNoParticipation,
            noParticipationReason: p.noParticipationReason,
        }));
}

/**
 * Formata contexto sensível como texto para o prompt (só para Anciãos)
 */
export function formatSensitiveContext(sensitiveInfo: SensitivePublisherInfo[]): string {
    if (sensitiveInfo.length === 0) {
        return '\n=== INFORMAÇÕES CONFIDENCIAIS (APENAS ANCIÃOS) ===\nNenhum publicador com restrições no momento.';
    }

    const lines: string[] = [];
    lines.push('\n=== INFORMAÇÕES CONFIDENCIAIS (APENAS ANCIÃOS) ===');
    lines.push('Os seguintes publicadores têm restrições:\n');

    for (const info of sensitiveInfo) {
        const reasons: string[] = [];

        if (!info.isServing) {
            reasons.push('Inativo (isServing = false)');
        }
        if (info.isNotQualified) {
            reasons.push(`Não qualificado${info.notQualifiedReason ? `: ${info.notQualifiedReason}` : ''}`);
        }
        if (info.requestedNoParticipation) {
            reasons.push(`Pediu para não participar${info.noParticipationReason ? `: ${info.noParticipationReason}` : ''}`);
        }

        lines.push(`🔒 ${info.name}:`);
        reasons.forEach(r => lines.push(`   - ${r}`));
    }

    return lines.join('\n');
}
