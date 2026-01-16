/**
 * Context Builder - Constrói contexto para o Agente IA
 * 
 * Extrai e sumariza dados relevantes do app para enviar ao LLM
 */

import type { Publisher, WorkbookPart, HistoryRecord } from '../types';
import { getEligibilityStats } from './eligibilityService';

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
}

// NOVO: Designação detalhada de uma parte
export interface PartDesignation {
    tipoParte: string;
    tituloParte: string;
    funcao: 'Titular' | 'Ajudante';
    designado: string;
    status: string;
    horaInicio: string;
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

    // Data atual
    currentDate: string;
}

// ===== Funções =====

/**
 * Converte Publisher para resumo compacto
 */
function summarizePublisher(p: Publisher): PublisherSummary {
    const privileges: string[] = [];
    if (p.privileges.canPreside) privileges.push('Presidir');
    if (p.privileges.canPray) privileges.push('Orar');
    if (p.privileges.canGiveTalks) privileges.push('Discursos');
    if (p.privileges.canConductCBS) privileges.push('Dirigir EBC');
    if (p.privileges.canReadCBS) privileges.push('Ler EBC');

    return {
        name: p.name,
        gender: p.gender,
        condition: p.condition,
        isServing: p.isServing,
        isBaptized: p.isBaptized,
        privileges,
    };
}

/**
 * Converte participação para resumo
 */
function summarizeParticipation(record: HistoryRecord | WorkbookPart): ParticipationSummary {
    return {
        publisherName: record.resolvedPublisherName || record.rawPublisherName || 'N/A',
        date: record.date,
        partType: record.tipoParte,
        funcao: record.funcao,
    };
}

/**
 * Constrói o contexto completo para o agente
 */
export function buildAgentContext(
    publishers: Publisher[],
    parts: WorkbookPart[],
    _history: HistoryRecord[] = [],
    specialEvents: SpecialEventInput[] = [],
    localNeeds: LocalNeedsInput[] = []
): AgentContext {
    // Filtrar publicadores ativos
    const activePublishers = publishers.filter(p => p.isServing);

    // Sumarizar publicadores
    const publisherSummaries = publishers.map(summarizePublisher);

    // Estatísticas de elegibilidade
    const eligibilityStats = getEligibilityStats(publishers);

    // Participações recentes (últimos 30 dias)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentParticipations = parts
        .filter(p => {
            if (!p.resolvedPublisherName) return false;
            const partDate = new Date(p.date);
            return partDate >= thirtyDaysAgo;
        })
        .map(summarizeParticipation)
        .slice(0, 100); // Limitar a 100 para não sobrecarregar o contexto

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

    // NOVO: Agrupar designações por semana (apenas semanas com partes designadas)
    const today = new Date().toISOString().split('T')[0];
    const weekMap = new Map<string, WeekDesignation>();

    // Ordenar parts por data
    const sortedParts = [...parts].sort((a, b) => a.date.localeCompare(b.date));

    for (const part of sortedParts) {
        // Considerar apenas partes designadas ou com nome
        const designado = part.resolvedPublisherName || part.rawPublisherName;
        if (!designado) continue;

        const weekId = part.weekId;
        if (!weekMap.has(weekId)) {
            weekMap.set(weekId, {
                weekId,
                weekDisplay: part.weekDisplay,
                date: part.date,
                parts: [],
            });
        }

        weekMap.get(weekId)!.parts.push({
            tipoParte: part.tipoParte,
            tituloParte: part.tituloParte,
            funcao: part.funcao,
            designado,
            status: part.status,
            horaInicio: part.horaInicio,
        });
    }

    // Converter para array e pegar últimas 4 semanas + 4 próximas
    const allWeeks = Array.from(weekMap.values());
    const pastWeeks = allWeeks.filter(w => w.date < today).slice(-4);
    const futureWeeks = allWeeks.filter(w => w.date >= today).slice(0, 4);
    const weekDesignations = [...pastWeeks, ...futureWeeks];

    // Determinar semana atual
    const currentWeekData = allWeeks.find(w => w.date >= today);
    const currentWeek = currentWeekData?.weekDisplay || 'N/A';

    // NOVO: Processar eventos especiais
    const specialEventsSummary: SpecialEventSummary[] = specialEvents.map(e => ({
        week: e.week,
        templateId: e.templateId,
        templateName: e.templateName || e.templateId,
        theme: e.theme,
        assignee: e.responsible,
        isApplied: e.isApplied || false,
    }));

    // NOVO: Processar fila de necessidades locais
    const localNeedsQueue: LocalNeedsSummary[] = localNeeds.map(ln => ({
        theme: ln.theme,
        assignee: ln.assigneeName,
        position: ln.orderPosition,
        targetWeek: ln.targetWeek || undefined,
        isAssigned: !!ln.assignedToPartId,
    }));

    // NOVO: Calcular analytics de participação
    const participationAnalytics = buildParticipationAnalytics(parts, publishers);

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
        const name = part.resolvedPublisherName;
        if (!name) continue;

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
    };
}

/**
 * Formata contexto como texto para o prompt
 */
export function formatContextForPrompt(context: AgentContext): string {
    const lines: string[] = [];

    lines.push(`=== DADOS ATUAIS (${context.currentDate}) ===`);
    lines.push(`SEMANA ATUAL: ${context.currentWeek}\n`);

    // Estatísticas gerais
    lines.push(`PUBLICADORES:`);
    lines.push(`- Total: ${context.totalPublishers}`);
    lines.push(`- Ativos: ${context.activePublishers}`);
    lines.push(`- Podem Presidir: ${context.eligibilityStats.canPreside}`);
    lines.push(`- Podem Orar: ${context.eligibilityStats.canPray}`);
    lines.push(`- Podem dar Discursos: ${context.eligibilityStats.canGiveTalks}`);
    lines.push(`- Anciãos/SM: ${context.eligibilityStats.eldersAndMS}`);
    lines.push(`- Irmãos: ${context.eligibilityStats.brothers}`);
    lines.push(`- Irmãs: ${context.eligibilityStats.sisters}\n`);

    // Lista de publicadores por condição
    const elders = context.publishers.filter(p => p.condition === 'Ancião' || p.condition === 'Anciao');
    const servants = context.publishers.filter(p => p.condition === 'Servo Ministerial');
    const publishers = context.publishers.filter(p => p.condition === 'Publicador');

    lines.push(`ANCIÃOS (${elders.length}):`);
    elders.forEach(p => lines.push(`- ${p.name} (${p.gender === 'brother' ? 'Irmão' : 'Irmã'})`));

    lines.push(`\nSERVOS MINISTERIAIS (${servants.length}):`);
    servants.forEach(p => lines.push(`- ${p.name}`));

    lines.push(`\nPUBLICADORES (${publishers.length}):`);
    publishers.slice(0, 20).forEach(p => lines.push(`- ${p.name} (${p.gender === 'brother' ? 'Irmão' : 'Irmã'})`));
    if (publishers.length > 20) {
        lines.push(`  ... e mais ${publishers.length - 20} publicadores`);
    }

    // NOVO: Designações por semana
    if (context.weekDesignations.length > 0) {
        lines.push(`\n=== DESIGNAÇÕES POR SEMANA ===\n`);
        for (const week of context.weekDesignations) {
            const isCurrentWeek = week.weekDisplay === context.currentWeek;
            lines.push(`📅 ${week.weekDisplay} (${week.date})${isCurrentWeek ? ' ← SEMANA ATUAL' : ''}`);

            // Agrupar por hora de início para ordem cronológica
            const sortedParts = [...week.parts].sort((a, b) =>
                a.horaInicio.localeCompare(b.horaInicio)
            );

            for (const part of sortedParts) {
                const funcaoLabel = part.funcao === 'Ajudante' ? ' (Ajudante)' : '';
                lines.push(`  • ${part.tituloParte}${funcaoLabel}: ${part.designado}`);
            }
            lines.push('');
        }
    }

    // Partes pendentes
    lines.push(`PARTES PENDENTES: ${context.pendingPartsCount}`);
    Object.entries(context.pendingPartsByWeek).forEach(([week, count]) => {
        lines.push(`- ${week}: ${count} partes`);
    });

    // Participações recentes
    if (context.recentParticipations.length > 0) {
        lines.push(`\nPARTICIPAÇÕES RECENTES (últimos 30 dias):`);
        const byPublisher = context.recentParticipations.reduce((acc, p) => {
            if (!acc[p.publisherName]) acc[p.publisherName] = [];
            acc[p.publisherName].push(p.partType);
            return acc;
        }, {} as Record<string, string[]>);

        Object.entries(byPublisher).slice(0, 15).forEach(([name, parts]) => {
            lines.push(`- ${name}: ${parts.length}x (${parts.slice(0, 3).join(', ')}${parts.length > 3 ? '...' : ''})`);
        });
    }

    // NOVO: Eventos Especiais
    if (context.specialEvents.length > 0) {
        lines.push(`\n=== EVENTOS ESPECIAIS ===`);
        for (const event of context.specialEvents) {
            const status = event.isApplied ? '✅' : '⏳';
            lines.push(`${status} ${event.week}: ${event.templateName}`);
            if (event.theme) lines.push(`   Tema: ${event.theme}`);
            if (event.assignee) lines.push(`   Responsável: ${event.assignee}`);
        }
    }

    // NOVO: Fila de Necessidades Locais
    if (context.localNeedsQueue.length > 0) {
        lines.push(`\n=== FILA DE NECESSIDADES LOCAIS ===`);
        for (const ln of context.localNeedsQueue) {
            const status = ln.isAssigned ? '✅' : `#${ln.position}`;
            const targetInfo = ln.targetWeek ? ` → ${ln.targetWeek}` : '';
            lines.push(`${status} "${ln.theme}" - ${ln.assignee}${targetInfo}`);
        }
    }

    // NOVO: Analytics de Participação
    if (context.participationAnalytics) {
        const analytics = context.participationAnalytics;
        lines.push(`\n=== ANALYTICS DE PARTICIPAÇÃO ===`);
        lines.push(`- Total de participações: ${analytics.totalParticipations}`);
        lines.push(`- Média por publicador ativo: ${analytics.avgPerPublisher}`);

        if (analytics.mostActive.length > 0) {
            lines.push(`\nMAIS ATIVOS:`);
            analytics.mostActive.forEach(p => lines.push(`  🏆 ${p.name}: ${p.count} partes`));
        }

        if (analytics.leastActive.length > 0) {
            lines.push(`\nMENOS ATIVOS (sem parte há mais tempo):`);
            analytics.leastActive.forEach(p => {
                const info = p.lastDate ? `última: ${p.lastDate}` : 'nunca participou';
                lines.push(`  ⏰ ${p.name}: ${info}`);
            });
        }
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
   - Prioriza irmãs para titular
   - Ajudante DEVE ser do mesmo sexo que o titular
   - Irmã + Irmã = OK
   - Irmão + Irmão = OK
   - Sexos diferentes = BLOQUEADO

6. DISCURSO DE ESTUDANTE:
   - Somente irmãos
   - Irmãs não podem fazer

7. DIRIGENTE EBC:
   - Somente Anciãos
   - Requer privilégio canConductCBS

8. LEITOR EBC:
   - Somente irmãos
   - Requer privilégio canReadCBS

SISTEMA DE ROTAÇÃO:
- Cooldown: 3 semanas entre partes do mesmo tipo
- Publicador sem parte há 8+ semanas recebe MEGA BÔNUS de prioridade
- Fórmula: Score = (SemanasDesdeÚltima × 50) - (PesoAcumulado × 5)

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
