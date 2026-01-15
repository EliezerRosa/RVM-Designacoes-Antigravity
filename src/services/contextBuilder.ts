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
    _history: HistoryRecord[] = []
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

    return {
        totalPublishers: publishers.length,
        activePublishers: activePublishers.length,
        publishers: publisherSummaries,
        eligibilityStats,
        recentParticipations,
        pendingPartsCount: pendingParts.length,
        pendingPartsByWeek,
        currentDate: new Date().toISOString().split('T')[0],
    };
}

/**
 * Formata contexto como texto para o prompt
 */
export function formatContextForPrompt(context: AgentContext): string {
    const lines: string[] = [];

    lines.push(`=== DADOS ATUAIS (${context.currentDate}) ===\n`);

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

    // Partes pendentes
    lines.push(`\nPARTES PENDENTES: ${context.pendingPartsCount}`);
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
