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
import { EnumModalidade, EnumTipoParte } from '../types';

// ===== Constantes de Configuração =====

export const COOLDOWN_WEEKS = 6; // Semanas mínimas entre mesma parte (Titular)
export const COOLDOWN_WEEKS_HELPER = 4; // Semanas mínimas para Ajudante
export const COOLDOWN_PENALTY_MULTIPLIER = 0.1; // Penalidade para quem está em cooldown

// Partes que contam como uma única participação de PRESIDENCY
export const PRESIDENCY_BUNDLE = [
    'Presidente',
    'Oração Inicial',
    'Comentários Iniciais',
    'Comentários Finais',
    EnumTipoParte.PRESIDENTE,
    EnumTipoParte.ORACAO_INICIAL,
    EnumTipoParte.COMENTARIOS_INICIAIS,
    EnumTipoParte.COMENTARIOS_FINAIS,
] as const;

export const CATEGORY_WEIGHTS = {
    PRESIDENCY: 1.0,  // Presidente + Oração + Comentários (conta como 1)
    TEACHING: 1.0,
    STUDENT: 0.5,
    HELPER: 0.1
} as const;

export type ParticipationCategory = keyof typeof CATEGORY_WEIGHTS;

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
 * ATUALIZADO: Considera também participações FUTURAS já agendadas (PROPOSTA/APROVADA/DESIGNADA).
 * 
 * @param publisherName Nome do publicador
 * @param history Histórico de participações passadas (HistoryRecord[])
 * @param today Data de referência
 * @param futureAssignments Partes futuras já agendadas (opcional, formato simplificado)
 */
export function calculateRotationPriority(
    publisherName: string,
    history: HistoryRecord[],
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
    // Filtrar histórico do publicador pelo nome
    const publisherHistory = history.filter(h =>
        h.resolvedPublisherName === publisherName ||
        h.rawPublisherName === publisherName
    );

    // Contar participações futuras ativas (não PENDENTE/REJEITADA/CANCELADA)
    let futureCount = 0;
    if (futureAssignments) {
        const activeStatuses = ['PROPOSTA', 'APROVADA', 'DESIGNADA', 'CONCLUIDA'];
        futureCount = futureAssignments.filter(p => {
            const isPublisher = (p.resolvedPublisherName === publisherName || p.rawPublisherName === publisherName);
            const isActive = !p.status || activeStatuses.includes(p.status);
            return isPublisher && isActive;
        }).length;
    }

    if (publisherHistory.length === 0 && futureCount === 0) {
        // Nunca participou e sem agendamentos futuros → prioridade máxima
        return Number.MAX_SAFE_INTEGER;
    }

    // Categorizar e calcular dias desde última participação
    const categoryDays = {
        PRESIDENCY: getDaysSinceCategoryLast(publisherHistory, 'PRESIDENCY', today),
        TEACHING: getDaysSinceCategoryLast(publisherHistory, 'TEACHING', today),
        STUDENT: getDaysSinceCategoryLast(publisherHistory, 'STUDENT', today),
        HELPER: getDaysSinceCategoryLast(publisherHistory, 'HELPER', today)
    };

    // Aplicar fórmula de prioridade ponderada
    let priority =
        categoryDays.PRESIDENCY * CATEGORY_WEIGHTS.PRESIDENCY +
        categoryDays.TEACHING * CATEGORY_WEIGHTS.TEACHING +
        categoryDays.STUDENT * CATEGORY_WEIGHTS.STUDENT +
        categoryDays.HELPER * CATEGORY_WEIGHTS.HELPER;

    // PENALIZAR por participações futuras já agendadas
    // Cada participação futura reduz a prioridade significativamente
    // (evita sobrecarregar quem já tem várias partes futuras)
    if (futureCount > 0) {
        const FUTURE_PENALTY = 0.5; // 50% de redução por cada parte futura
        priority = priority * Math.pow(FUTURE_PENALTY, futureCount);
    }

    return priority;
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
            (h.tipoParte === partType || h.tituloParte === partType)
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
 * @param futureAssignments Partes futuras já agendadas para penalizar publicadores sobrecarregados
 */
export function rankPublishersByRotation(
    publishers: Publisher[],
    history: HistoryRecord[],
    partType?: string,
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
        const priority = calculateRotationPriority(pub.name, history, today, futureAssignments);
        const cooldownInfo = partType ? getCooldownInfo(pub.name, partType, history, today) : null;

        // Aplicar penalidade de cooldown
        const adjustedPriority = cooldownInfo?.isInCooldown
            ? priority * COOLDOWN_PENALTY_MULTIPLIER
            : priority;

        // Detalhes por categoria
        const pubHistory = history.filter(h =>
            h.resolvedPublisherName === pub.name || h.rawPublisherName === pub.name
        );

        return {
            publisherId: pub.id,
            publisherName: pub.name,
            priority: adjustedPriority,
            daysSinceLastTeaching: getDaysSinceCategoryLast(pubHistory, 'TEACHING', today),
            daysSinceLastStudent: getDaysSinceCategoryLast(pubHistory, 'STUDENT', today),
            daysSinceLastHelper: getDaysSinceCategoryLast(pubHistory, 'HELPER', today),
            cooldownInfo
        };
    });

    // Ordenar por prioridade decrescente (maior prioridade = mais tempo esperando)
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

    const ranked = rankPublishersByRotation(eligiblePublishers, history, partType, today, futureAssignments);

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
 * Calcula dias desde a última participação numa categoria
 */
function getDaysSinceCategoryLast(
    history: HistoryRecord[],
    category: ParticipationCategory,
    today: Date
): number {
    // Filtrar por categoria
    const categoryHistory = history.filter(h =>
        getParticipationCategory(h) === category
    );

    if (categoryHistory.length === 0) {
        return 365 * 10; // "Infinito" - nunca participou nesta categoria
    }

    // Encontrar a mais recente
    const dates = categoryHistory.map(h => new Date(h.date || h.date || ''));
    const mostRecent = dates.reduce((max, d) => d > max ? d : max, new Date(0));

    return Math.floor((today.getTime() - mostRecent.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Determina a categoria de participação de um registro
 */
export function getParticipationCategory(record: HistoryRecord): ParticipationCategory {
    const modality = record.modalidade || record.modalidade;
    const funcao = record.funcao || record.funcao;
    const tipoParte = record.tipoParte || record.tituloParte;

    // HELPER: Qualquer ajudante
    if (funcao === 'Ajudante') {
        return 'HELPER';
    }

    // PRESIDENCY: Presidente + Oração Inicial + Comentários (conta como 1 participação)
    if (PRESIDENCY_BUNDLE.includes(tipoParte as any) || modality === EnumModalidade.PRESIDENCIA) {
        return 'PRESIDENCY';
    }

    // TEACHING: Discursos de ensino, Joias, Partes Vida Cristã (anciãos/SMs)
    const teachingModalities = [
        EnumModalidade.DISCURSO_ENSINO,
        EnumModalidade.ACONSELHAMENTO,
        EnumModalidade.DIRIGENTE_EBC,
        'Discurso de Ensino',
        'Aconselhamento',
        'Dirigente de EBC'
    ];
    const teachingParts = [
        EnumTipoParte.DISCURSO_TESOUROS,
        EnumTipoParte.JOIAS_ESPIRITUAIS,
        EnumTipoParte.PARTE_VIDA_CRISTA,
        EnumTipoParte.DIRIGENTE_EBC,
        EnumTipoParte.ELOGIOS_CONSELHOS,
        'Discurso na Tesouros',
        'Joias Espirituais',
        'Necessidades Locais'
    ];

    if (teachingModalities.includes(modality as any) ||
        teachingParts.includes(tipoParte as any)) {
        return 'TEACHING';
    }

    // STUDENT: Leitura, Demonstrações, Discurso estudante
    const studentModalities = [
        EnumModalidade.LEITURA_ESTUDANTE,
        EnumModalidade.DEMONSTRACAO,
        EnumModalidade.DISCURSO_ESTUDANTE,
        EnumModalidade.LEITOR_EBC,
        'Leitura de Estudante',
        'Demonstração',
        'Discurso de Estudante',
        'Leitor de EBC'
    ];
    const studentParts = [
        EnumTipoParte.PARTE_ESTUDANTE,
        EnumTipoParte.LEITOR_EBC,
        'Leitura da Bíblia',
        'Conversas Iniciais',
        'Interesse',
        'Revisita'
    ];

    if (studentModalities.includes(modality as any) ||
        studentParts.includes(tipoParte as any)) {
        return 'STUDENT';
    }

    // Default para HELPER se não identificado
    return 'HELPER';
}

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

    const categories = pubHistory.map(h => getParticipationCategory(h));

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
