/**
 * Cooldown & Rotation Service - RVM Designações
 * 
 * Implementa as regras de:
 * - Rodízio Ponderado (TEACHING/STUDENT/HELPER)
 * - Cooldown por tipo de parte (6-8 semanas)
 * 
 * PESO DE CATEGORIA:
 * - TEACHING (x1.0): Discursos, Joias, Necessidades Locais
 * - STUDENT (x0.5): Leitura da Bíblia, Demonstrações (Titular), Discurso Estudante
 * - HELPER (x0.1): Ajudante em Demonstrações
 * 
 * FÓRMULA DE PRIORIDADE:
 * Prioridade = Σ (Dias desde última parte[k]) × Peso[k]
 */

import type { HistoryRecord, Publisher } from '../types';


// ===== Constantes de Configuração =====

export const COOLDOWN_WEEKS = 6; // Semanas mínimas entre mesma parte (Titular)
export const COOLDOWN_WEEKS_HELPER = 4; // Semanas mínimas para Ajudante
export const SOFT_COOLDOWN_PENALTY = 15; // Penalidade suave para repetição de tipo
export const PARTICIPATION_COUNT_PENALTY = 7; // Penalidade base por contagem

// Pesos por Categoria (para subtração da quantidade)
export const CATEGORY_WEIGHTS = {
    TEACHING: 1.0,  // Ensino/Presidência: Penalidade TOTAL
    STUDENT: 0.5,   // Estudante: Penalidade MÉDIA
    HELPER: 0.2,    // Ajudante: Penalidade LEVE
    OTHER: 0.0      // Cântico/Outros: Sem penalidade
} as const;

export type ParticipationCategory = keyof typeof CATEGORY_WEIGHTS;

// Helper para determinar categoria da parte
export function getParticipationCategory(tipoParte: string, funcao: string = 'Titular'): ParticipationCategory {
    // 1. Ajudante é sempre HELPER
    if (funcao === 'Ajudante') return 'HELPER';

    const lower = tipoParte?.toLowerCase() || '';

    // 2. Presidência e Ensino
    if (lower.includes('presidente') ||
        lower.includes('oração') ||
        lower.includes('discurso') ||
        lower.includes('joias') ||
        lower.includes('necessidades')) {
        // Exceção: Discurso de Estudante é STUDENT
        if (lower.includes('estudante')) return 'STUDENT';
        return 'TEACHING';
    }

    // 3. Estudante (Leitura, Demonstações)
    if (lower.includes('leitura') ||
        lower.includes('demonstração') ||
        lower.includes('iniciando') ||
        lower.includes('cultivando') ||
        lower.includes('fazendo') ||
        lower.includes('explicando')) {
        return 'STUDENT';
    }

    return 'OTHER';
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
 * FÓRMULA v3.0 (Contextual Priority + Weighted Counts + Soft Cooldown):
 * 1. Contextual: Considera histórico PRINCIPALMENTE da mesma categoria alvo (Filas Separadas).
 * 2. Weighted: Subtrai quantidade total ponderada (Ensino pesa mais que Ajudante).
 * 3. Soft Cooldown: Subtrai 15 pontos se fez o mesmo tipo de parte recentemente.
 */
export function calculateRotationPriority(
    publisherName: string,
    history: HistoryRecord[],
    targetPartType: string = '', // Tipo da parte que estamos tentando preencher
    targetFuncao: string = 'Titular', // Função alvo
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
    // 1. Identificar Categoria Alvo (para qual fila estamos calculando?)
    const targetCategory = getParticipationCategory(targetPartType, targetFuncao);

    // Filtrar todo histórico do publicador
    const fullHistory = history.filter(h =>
        h.resolvedPublisherName === publisherName ||
        h.rawPublisherName === publisherName
    );

    // Filtrar histórico DA MESMA CATEGORIA (Contextual Priority)
    // Se queremos um Orador (Teaching), olhamos quando foi o último Discurso (Teaching).
    const categoryHistory = fullHistory.filter(h =>
        getParticipationCategory(h.tipoParte, h.funcao) === targetCategory
    );

    // Contar total ponderado de participações (Weighted Counts)
    // Aqui olhamos o histórico COMPLETO para evitar sobrecarga geral, mas aplicamos pesos
    let weightedCount = 0;
    fullHistory.forEach(h => {
        const cat = getParticipationCategory(h.tipoParte, h.funcao);
        weightedCount += CATEGORY_WEIGHTS[cat]; // +1.0, +0.5, ou +0.2
    });

    // Adicionar participações futuras à contagem ponderada
    let futureCount = 0;
    let softCooldownPenalty = 0;

    if (futureAssignments) {
        const activeStatuses = ['PROPOSTA', 'APROVADA', 'DESIGNADA', 'CONCLUIDA'];
        futureAssignments.forEach(p => {
            const isPublisher = (p.resolvedPublisherName === publisherName || p.rawPublisherName === publisherName);
            const isActive = !p.status || activeStatuses.includes(p.status);

            if (isPublisher && isActive) {
                futureCount++;
                const cat = getParticipationCategory(p.tipoParte, p.funcao);
                weightedCount += CATEGORY_WEIGHTS[cat];
            }
        });
    }

    // Se nunca participou NA CATEGORIA ALVO -> Prioridade Máxima para essa fila
    // (Mesmo que tenha participado em outras categorias)
    if (categoryHistory.length === 0) {
        // Reduzimos um pouco baseado na carga total para desempatar quem nunca fez nada vs quem já fez outras coisas
        return Number.MAX_SAFE_INTEGER - Math.floor(weightedCount * 100);
    }

    // Calcular dias desde última participação NA CATEGORIA
    const dates = categoryHistory.map(h => new Date(h.date || '').getTime());
    const mostRecent = Math.max(...dates, 0);
    const daysSinceLast = mostRecent > 0
        ? Math.floor((today.getTime() - mostRecent) / (1000 * 60 * 60 * 24))
        : 365;

    // Verificar Soft Cooldown (Mesmo Tipo Específico)
    // Se fez a MESMA parte recentemente (independente da categoria), aplica penalidade
    const cooldownInfo = getCooldownInfo(publisherName, targetPartType, fullHistory, today); // Usa fullHistory aqui
    if (cooldownInfo?.isInCooldown) {
        softCooldownPenalty = SOFT_COOLDOWN_PENALTY;
    }

    // FÓRMULA FINAL:
    // Dias(Categoria) - (TotalPonderado * 7) - (Futuras * 30) - SoftCooldown
    let priority = daysSinceLast
        - (weightedCount * PARTICIPATION_COUNT_PENALTY)
        - (futureCount * 30)
        - softCooldownPenalty;

    return Math.floor(priority);
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
        teachingCount: categories.filter(c => c === 'TEACHING').length,
        studentCount: categories.filter(c => c === 'STUDENT').length,
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
