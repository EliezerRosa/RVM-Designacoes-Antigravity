/**
 * Cooldown & Rotation Service - RVM Designações v8.0
 * 
 * Implementa as regras de:
 * - Rodízio Ponderado por Peso de Duração
 * - Cooldown por tipo de parte (3 semanas)
 * - Gap mínimo entre participações (2 semanas = alerta grave)
 * 
 * FÓRMULA DE SCORE v8.0:
 * Score = (SemanasDesdeUltima × 50) - (PesoAcumulado × 5)
 * 
 * PESOS POR DURAÇÃO:
 * - EBC Dirigente (30min): 15 pts
 * - Discurso (10-15min): 10 pts
 * - Demonstração (3-5min): 5 pts
 * - Leitura (4min): 3 pts
 * - Ajudante: 2 pts
 * - Oração/Cântico: 0 pts (ignorado)
 */

import type { HistoryRecord, Publisher } from '../types';
import { getPartWeight } from '../constants/partWeights';


// ===== Constantes de Configuração v8.0 =====

export const COOLDOWN_WEEKS = 3; // Semanas mínimas entre mesma parte (antes: 6)
export const COOLDOWN_WEEKS_HELPER = 2; // Semanas mínimas para Ajudante
export const MIN_WEEK_GAP = 2; // Gap mínimo entre qualquer participação (ALERTA GRAVE)
export const SOFT_COOLDOWN_PENALTY = 15; // Penalidade para repetição de tipo

// Fatores da fórmula de score v8.0
export const WEEKS_FACTOR = 50; // Multiplicador de semanas desde última participação
export const WEIGHT_FACTOR = 5; // Multiplicador de peso acumulado

// Pesos por Categoria (v4.0 - Simplificado)
export const CATEGORY_WEIGHTS = {
    MAIN: 1.0,      // Ensino + Estudante-Titular: Peso TOTAL
    HELPER: 0.1,    // Ajudante: Peso MÍNIMO
    IGNORED: 0.0    // Oração, NL, Cântico: NÃO CONTABILIZA
} as const;

export type ParticipationCategory = keyof typeof CATEGORY_WEIGHTS;

/**
 * Determina categoria da parte para cálculo de prioridade.
 * v4.0: Simplificado para MAIN (conta), HELPER (pouco), IGNORED (não conta)
 */
export function getParticipationCategory(tipoParte: string, funcao: string = 'Titular'): ParticipationCategory {
    // 1. Ajudante SEMPRE tem peso mínimo
    if (funcao === 'Ajudante') return 'HELPER';

    const lower = tipoParte?.toLowerCase() || '';

    // 2. IGNORADOS: Orações, NL, Cânticos - NÃO CONTAM no histórico
    if (lower.includes('oração') ||
        lower.includes('oracao') ||
        lower.includes('necessidades') ||
        lower.includes('cântico') ||
        lower.includes('cantico')) {
        return 'IGNORED';
    }

    // 3. MAIN: Todo o resto (Ensino e Estudante-Titular) tem MESMO PESO
    // Inclui: Presidente, Discursos, Tesouros, Joias, Leitura, Demonstrações, EBC, etc.
    return 'MAIN';
}

// ===== Interfaces =====

export interface CooldownInfo {
    isInCooldown: boolean;
    weeksSinceLast: number;
    cooldownRemaining: number;
    lastPartType: string;
    lastDate: string;
}

export interface RotationScore {
    publisherId: string;
    publisherName: string;
    priority: number;
    daysSinceLastTeaching: number;
    daysSinceLastStudent: number;
    daysSinceLastHelper: number;
    cooldownInfo: CooldownInfo | null;
}

// ===== Funções Principais =====

/**
 * Calcula a prioridade de rodízio para um publicador.
 * 
 * FÓRMULA v8.0 (Score com Pesos por Duração):
 * Score = (SemanasDesdeUltima × 50) - (PesoAcumulado × 5)
 * 
 * Onde:
 * - SemanasDesdeUltima: Semanas desde qualquer participação (categoria MAIN)
 * - PesoAcumulado: Soma dos pesos de todas as partes do publicador
 */
export function calculateRotationPriority(
    publisherName: string,
    history: HistoryRecord[],
    targetPartType: string = '', // Tipo da parte que estamos tentando preencher
    _targetFuncao: string = 'Titular', // Função alvo (reservado para uso futuro)
    today: Date = new Date(),
    futureAssignments?: Array<{
        date: string;
        tipoParte: string;
        rawPublisherName?: string;
        resolvedPublisherName?: string;
        funcao?: string;
        status?: string;
    }>
): number {
    // Filtrar histórico do publicador
    const fullHistory = history.filter(h =>
        h.resolvedPublisherName === publisherName ||
        h.rawPublisherName === publisherName
    );

    // ========================================
    // v8.0: Calcular Peso Acumulado por Duração
    // ========================================
    let weightedTotal = 0;
    fullHistory.forEach(h => {
        const weight = getPartWeight(h.tipoParte || '', h.funcao || 'Titular');
        weightedTotal += weight;
    });

    // Adicionar pesos de participações futuras
    let futureCount = 0;
    if (futureAssignments) {
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);

        futureAssignments.forEach(p => {
            const isPublisher = (p.resolvedPublisherName === publisherName || p.rawPublisherName === publisherName);
            const partDate = new Date(p.date);
            partDate.setHours(0, 0, 0, 0);
            const isFutureOrToday = partDate >= todayStart;

            if (isPublisher && isFutureOrToday) {
                futureCount++;
                const weight = getPartWeight(p.tipoParte || '', p.funcao || 'Titular');
                weightedTotal += weight;
            }
        });
    }

    // Filtrar apenas participações MAIN (não orações/cânticos) para calcular tempo
    const mainHistory = fullHistory.filter(h =>
        getParticipationCategory(h.tipoParte || '', h.funcao || '') === 'MAIN'
    );

    // Se nunca participou em partes MAIN -> Prioridade Máxima
    if (mainHistory.length === 0) {
        // Desempatar por peso acumulado (menos peso = maior prioridade)
        return Number.MAX_SAFE_INTEGER - Math.floor(weightedTotal * 100);
    }

    // ========================================
    // v8.0: Calcular Semanas desde última participação
    // ========================================
    const dates = mainHistory.map(h => new Date(h.date || '').getTime());
    const mostRecent = Math.max(...dates, 0);
    const daysSinceLast = mostRecent > 0
        ? Math.floor((today.getTime() - mostRecent) / (1000 * 60 * 60 * 24))
        : 365;
    const weeksSinceLast = Math.floor(daysSinceLast / 7);

    // Verificar Soft Cooldown (mesmo tipo específico)
    let softCooldownPenalty = 0;
    const cooldownInfo = getCooldownInfo(publisherName, targetPartType, fullHistory, today);
    if (cooldownInfo?.isInCooldown) {
        softCooldownPenalty = SOFT_COOLDOWN_PENALTY;
    }

    // ========================================
    // FÓRMULA v8.0:
    // Score = (Semanas × 50) - (PesoAcumulado × 5) - Penalidades
    // ========================================
    const score = (weeksSinceLast * WEEKS_FACTOR)
        - (weightedTotal * WEIGHT_FACTOR)
        - (futureCount * 30)
        - softCooldownPenalty;

    return Math.floor(score);
}


/**
 * Verifica se um publicador está em cooldown para um tipo de parte
 */
export function getCooldownInfo(
    publisherName: string,
    partType: string,
    history: HistoryRecord[],
    today: Date = new Date()
): CooldownInfo | null {
    // Filtrar histórico do publicador para o tipo de parte específico
    const relevantHistory = history
        .filter(h =>
            (h.resolvedPublisherName === publisherName || h.rawPublisherName === publisherName) &&
            (h.tipoParte === partType || h.tituloParte === partType) // Check robusto
        )
        .sort((a, b) => {
            const dateA = new Date(a.date || '');
            const dateB = new Date(b.date || '');
            return dateB.getTime() - dateA.getTime(); // Mais recente primeiro
        });

    if (relevantHistory.length === 0) {
        return null; // Nunca fez esta parte
    }

    const lastRecord = relevantHistory[0];
    const lastDate = new Date(lastRecord.date || lastRecord.date || '');
    const daysSinceLast = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    const weeksSinceLast = Math.floor(daysSinceLast / 7);

    return {
        isInCooldown: weeksSinceLast < COOLDOWN_WEEKS,
        weeksSinceLast,
        cooldownRemaining: Math.max(0, COOLDOWN_WEEKS - weeksSinceLast),
        lastPartType: lastRecord.tipoParte || lastRecord.tituloParte || '',
        lastDate: lastRecord.date || lastRecord.date || ''
    };
}

/**
 * Rankeia publicadores por prioridade de rodízio
 */
export function rankPublishersByRotation(
    publishers: Publisher[],
    history: HistoryRecord[],
    partType: string = '',
    targetFuncao: string = 'Titular',
    today: Date = new Date(),
    futureAssignments?: Array<{
        date: string;
        tipoParte: string;
        rawPublisherName?: string;
        resolvedPublisherName?: string;
        funcao?: string;
        status?: string;
    }>
): RotationScore[] {
    const scores: RotationScore[] = publishers.map(pub => {
        const priority = calculateRotationPriority(pub.name, history, partType, targetFuncao, today, futureAssignments);
        const cooldownInfo = partType ? getCooldownInfo(pub.name, partType, history, today) : null;

        return {
            publisherId: pub.id,
            publisherName: pub.name,
            priority,
            daysSinceLastTeaching: 0, // Simplificado, não usado no sort principal
            daysSinceLastStudent: 0,
            daysSinceLastHelper: 0,
            cooldownInfo
        };
    });

    // Ordenar por prioridade decrescente
    return scores.sort((a, b) => b.priority - a.priority);
}

/**
 * Seleciona o melhor candidato para uma parte
 * @param futureAssignments Partes futuras já agendadas para penalizar publicadores sobrecarregados
 */
export function selectBestCandidate(
    eligiblePublishers: Publisher[],
    history: HistoryRecord[],
    partType: string,
    targetFuncao: string = 'Titular',
    today: Date = new Date(),
    futureAssignments?: Array<{
        date: string;
        tipoParte: string;
        rawPublisherName?: string;
        resolvedPublisherName?: string;
        funcao?: string;
        status?: string;
    }>
): Publisher | null {
    if (eligiblePublishers.length === 0) return null;

    const ranked = rankPublishersByRotation(eligiblePublishers, history, partType, targetFuncao, today, futureAssignments);

    // O primeiro é o que tem maior prioridade
    const bestId = ranked[0]?.publisherId;
    return eligiblePublishers.find(p => p.id === bestId) || null;
}

/**
 * Calcula prioridade baseada APENAS em tempo (ignora status).
 * Usado para ordenação do dropdown de seleção.
 * 
 * @param publisherName Nome do publicador
 * @param history Histórico de participações (HistoryRecord[])
 * @param today Data de referência
 * @returns Número representando prioridade (maior = mais tempo sem participar)
 */
export function calculateTimeOnlyPriority(
    publisherName: string,
    history: HistoryRecord[],
    today: Date = new Date()
): number {
    // Filtrar histórico do publicador pelo nome
    const publisherHistory = history.filter(h =>
        h.resolvedPublisherName === publisherName ||
        h.rawPublisherName === publisherName
    );

    if (publisherHistory.length === 0) {
        // Nunca participou → prioridade máxima
        return Number.MAX_SAFE_INTEGER;
    }

    // Encontrar a data mais recente de qualquer participação
    const dates = publisherHistory.map(h => new Date(h.date || ''));
    const mostRecent = dates.reduce((max, d) => d > max ? d : max, new Date(0));

    // Calcular dias desde última participação
    const daysSinceLast = Math.floor((today.getTime() - mostRecent.getTime()) / (1000 * 60 * 60 * 24));

    return daysSinceLast;
}

// ===== Funções Auxiliares =====



/**
 * Estatísticas de participação de um publicador
 */
export function getParticipationStats(
    publisherName: string,
    history: HistoryRecord[],
    _today: Date = new Date()
): {
    totalParticipations: number;
    teachingCount: number;
    studentCount: number;
    helperCount: number;
    lastParticipation: string | null;
    averageIntervalDays: number;
} {
    const pubHistory = history
        .filter(h => h.resolvedPublisherName === publisherName || h.rawPublisherName === publisherName)
        .sort((a, b) => {
            const dateA = new Date(a.date || '');
            const dateB = new Date(b.date || '');
            return dateA.getTime() - dateB.getTime();
        });

    const categories = pubHistory.map(h => getParticipationCategory(h.tipoParte, h.funcao));

    // Calcular intervalo médio
    let totalInterval = 0;
    for (let i = 1; i < pubHistory.length; i++) {
        const dateA = new Date(pubHistory[i - 1].date || '');
        const dateB = new Date(pubHistory[i].date || '');
        totalInterval += (dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24);
    }

    return {
        totalParticipations: pubHistory.length,
        teachingCount: categories.filter(c => c === 'MAIN').length, // v4.0: MAIN inclui Ensino + Estudante
        studentCount: 0, // Obsoleto - mantido por compatibilidade
        helperCount: categories.filter(c => c === 'HELPER').length,
        lastParticipation: pubHistory.length > 0
            ? pubHistory[pubHistory.length - 1].date || null
            : null,
        averageIntervalDays: pubHistory.length > 1 ? totalInterval / (pubHistory.length - 1) : 0
    };
}

// ===== Alertas de Designação Múltipla =====

/**
 * Interface para alertas de designação múltipla
 */
export interface AssignmentWarning {
    type: 'SAME_WEEK' | 'ADJACENT_WEEK';
    weekId: string;
    weekDisplay: string;
    partTitle: string;
    date: string;
    message: string;
}

/**
 * Verifica se um publicador tem múltiplas designações na mesma semana ou semanas adjacentes.
 * Retorna alertas (warnings) em vez de bloquear - é informativo, não restritivo.
 * 
 * @param publisherName Nome do publicador a verificar
 * @param targetWeekId weekId da parte sendo atribuída
 * @param parts Lista de partes (WorkbookPart) para verificar
 * @param excludePresidency Se true, não alerta para partes de presidência (Presidente geralmente tem múltiplas partes)
 * @returns Lista de alertas encontrados
 */
export function checkMultipleAssignments(
    publisherName: string,
    targetWeekId: string,
    parts: Array<{
        id: string;
        weekId: string;
        weekDisplay: string;
        tipoParte: string;
        tituloParte: string;
        date: string;
        rawPublisherName: string;
        resolvedPublisherName?: string;
        status?: string;
    }>,
    excludePresidency: boolean = true
): AssignmentWarning[] {
    if (!publisherName || !targetWeekId) return [];

    const warnings: AssignmentWarning[] = [];

    // Partes de presidência que são exceção (não geram alerta)
    const PRESIDENCY_TYPES = [
        'Presidente', 'Presidente da Reunião',
        'Comentários Iniciais', 'Comentarios Iniciais',
        'Comentários Finais', 'Comentarios Finais',
        'Oração Inicial', 'Oracao Inicial',
        'Oração Final', 'Oracao Final',
    ];

    // Filtrar partes do publicador (PROPOSTA, APROVADA, DESIGNADA, CONCLUIDA - não PENDENTE/REJEITADA/CANCELADA)
    const publisherParts = parts.filter(p => {
        const isPublisher = (p.resolvedPublisherName === publisherName || p.rawPublisherName === publisherName);
        const isActive = !p.status || !['PENDENTE', 'REJEITADA', 'CANCELADA'].includes(p.status);
        return isPublisher && isActive;
    });

    if (publisherParts.length === 0) return [];

    // Extrair números das semanas para comparação de adjacência
    // weekId format esperado: "2025-01" ou "YYYY-WW"
    const parseWeekNumber = (weekId: string): number => {
        const match = weekId.match(/(\d{4})[^0-9]*(\d{1,2})$/);
        if (match) {
            return parseInt(match[1]) * 100 + parseInt(match[2]);
        }
        return 0;
    };

    const targetWeekNum = parseWeekNumber(targetWeekId);

    for (const part of publisherParts) {
        // Pular a própria parte sendo verificada se já existe
        if (part.weekId === targetWeekId && part.id) continue;

        // Pular partes de presidência se configurado
        if (excludePresidency && PRESIDENCY_TYPES.some(t =>
            part.tipoParte?.includes(t) || part.tituloParte?.includes(t)
        )) {
            continue;
        }

        const partWeekNum = parseWeekNumber(part.weekId);

        // Mesma semana
        if (part.weekId === targetWeekId) {
            warnings.push({
                type: 'SAME_WEEK',
                weekId: part.weekId,
                weekDisplay: part.weekDisplay,
                partTitle: part.tituloParte || part.tipoParte,
                date: part.date,
                message: `Já tem designação nesta mesma semana: "${part.tituloParte || part.tipoParte}"`
            });
            continue;
        }

        // Semana adjacente (anterior ou posterior)
        const diff = Math.abs(targetWeekNum - partWeekNum);
        if (diff === 1) {
            const direction = targetWeekNum > partWeekNum ? 'anterior' : 'posterior';
            warnings.push({
                type: 'ADJACENT_WEEK',
                weekId: part.weekId,
                weekDisplay: part.weekDisplay,
                partTitle: part.tituloParte || part.tipoParte,
                date: part.date,
                message: `Tem designação na semana ${direction}: "${part.tituloParte || part.tipoParte}" (${part.weekDisplay})`
            });
        }
    }

    return warnings;
}
