/**
 * Context Builder - Constrói contexto para o Agente IA
 * 
 * Extrai e sumariza dados relevantes do app para enviar ao LLM
 */

import type { Publisher, WorkbookPart, HistoryRecord } from '../types';
import { getEligibilityStats } from './eligibilityService';
import { calculateScore, ROTATION_CONFIG, isStatPart } from './unifiedRotationService';
import { AGENT_CONTEXT_WEEKS, AGENT_HISTORY_LOOKBACK_WEEKS, AGENT_LIST_LOOKBACK_WEEKS } from '../constants/config';

export const RULES_TEXT_VERSION = '2024-01-27.01'; // v8.3 - Elegibilidade no contexto

// ===== Tipos =====

export interface PublisherSummary {
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

    const restrictions: string[] = [];
    if (!p.isServing) restrictions.push('Inativo');
    if (p.isNotQualified) restrictions.push(`ÑQualificado(${p.notQualifiedReason || ''})`);
    if (p.requestedNoParticipation) restrictions.push(`PediuSair(${p.noParticipationReason || ''})`);
    if (p.availability.mode === 'never') restrictions.push('Indisponível(Geral)');
    if (p.isHelperOnly) restrictions.push('ApenasAjudante');
    if (!p.canPairWithNonParent && p.parentIds.length > 0) restrictions.push('ApenasComPais');

    // Section Privileges (Lockouts)
    if (p.privilegesBySection) {
        if (!p.privilegesBySection.canParticipateInTreasures) restrictions.push('BloqTesouros');
        if (!p.privilegesBySection.canParticipateInMinistry) restrictions.push('BloqMinisterio');
        if (!p.privilegesBySection.canParticipateInLife) restrictions.push('BloqVida');
    }

    // Resolve Pais
    const parentNames = p.parentIds && parentLookup
        ? p.parentIds.map(id => parentLookup.get(id)).filter(Boolean)
        : [];

    return {
        name: p.name,
        gender: p.gender,
        condition: p.condition,
        isServing: p.isServing,
        isBaptized: p.isBaptized,
        phone: p.phone,
        aliases: p.aliases,
        privileges,
        ageGroup: p.ageGroup,
        hasParents: parentNames.length > 0,
        parentNames: parentNames,
        availability: p.availability.mode === 'always'
            ? p.availability.exceptionDates.length > 0
                ? `Sempre (Exceto: [${p.availability.exceptionDates.join(', ')}])`
                : 'Sempre'
            : p.availability.mode === 'never'
                ? p.availability.availableDates.length > 0
                    ? `Apenas: [${p.availability.availableDates.join(', ')}]`
                    : 'Nunca'
                : `Apenas: [${p.availability.availableDates.join(', ')}]`,
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
    const today = new Date().toISOString().split('T')[0];
    const weekMap = new Map<string, WeekDesignation>();

    // Ordenar parts por data
    const sortedParts = [...parts].sort((a, b) => a.date.localeCompare(b.date));

    for (const part of sortedParts) {
        // Considerar TODAS as partes, mesmo sem designação (v9.5: Fix Blindness)
        const designado = part.resolvedPublisherName || part.rawPublisherName || '[LIVRE]';
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

        if (isStatPart(part.tituloParte || part.tipoParte || part.funcao || '') || (part.tipoParte && part.tipoParte.toLowerCase().includes('presidente'))) {
            weekMap.get(weekId)!.parts.push({
                id: part.id,
                tipoParte: part.tipoParte,
                tituloParte: part.tituloParte,
                funcao: part.funcao,
                designado,
                status: part.status,
                horaInicio: part.horaInicio,
                date: part.date, // Data real da designação
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

    // GERAR LISTA DE PRIORIDADE (GENÉRICA)
    // Calcula score considerando uma parte "padrão" (sem bônus de irmã/função específica)
    // Isso dá ao agente uma visão clara de quem está "na fila" há mais tempo
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

    const priorityList = activePublishers.map(p => {
        const scoreData = calculateScore(p, 'Generic', historyRecords);
        return {
            name: p.name,
            score: scoreData.score,
            explanation: scoreData.explanation
        };
    })
        .sort((a, b) => b.score - a.score) // Maior score primeiro
        .slice(0, 20) // Top 20
        .map(res => `${res.name} (Score ${res.score}): ${res.explanation}`);

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
        currentDate: new Date().toISOString().split('T')[0],
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
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

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

            for (const part of sortedParts) {
                const funcaoLabel = part.funcao === 'Ajudante' ? ' (Ajudante)' : '';
                const timeInfo = part.horaInicio ? `[${part.horaInicio}]` : '';
                const durationInfo = part.duracao ? ` (${part.duracao} min)` : '';
                const details = part.descricao ? ` - "${part.descricao}"` : '';
                // Formatar data: YYYY-MM-DD → DD/MM/AAAA
                const dateParts = part.date ? part.date.split('-') : [];
                const dateLabel = dateParts.length === 3 ? ` | ${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : '';

                lines.push(`  • ${timeInfo}${dateLabel} ${part.tituloParte}${details}${durationInfo}${funcaoLabel}: ${part.designado} [ID: ${part.id}]`);
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

SISTEMA DE ROTAÇÃO (Unificado v9.0):
- Cooldown: 3 meses para repetição frequente (Frequency Penalty)
- Prioridade Baseada em Tempo (EXPONENCIAL): Tempo de espera gera urgência crescente (Weeks^1.5).
- Fórmula Real: Score = ${ROTATION_CONFIG.BASE_SCORE} + (SemanasSemParte ^ ${ROTATION_CONFIG.TIME_POWER} * ${ROTATION_CONFIG.TIME_FACTOR}) - (PartesEm3Meses * ${ROTATION_CONFIG.RECENT_PARTICIPATION_PENALTY})
- Bônus: +${ROTATION_CONFIG.SISTER_DEMO_PRIORITY} pts para Irmãs em demonstrações.

BLOQUEIOS AUTOMÁTICOS:
- isServing = false → Não designar
- isNotQualified = true → Não designar
- requestedNoParticipation = true → Não designar
- Indisponível na data → Não designar
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
