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

export const COOLDOWN_WEEKS = 6; // Semanas mínimas entre mesma parte
export const COOLDOWN_PENALTY_MULTIPLIER = 0.1; // Penalidade para quem está em cooldown

export const CATEGORY_WEIGHTS = {
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
 * Calcula a prioridade de rodízio para um publicador
 */
export function calculateRotationPriority(
    publisherId: string,
    history: HistoryRecord[],
    today: Date = new Date()
): number {
    // Filtrar histórico do publicador (resolvido ou original)
    const publisherHistory = history.filter(h =>
        h.resolvedPublisherId === publisherId ||
        h.resolvedPublisherId === publisherId
    );

    if (publisherHistory.length === 0) {
        // Nunca participou → prioridade máxima
        return Number.MAX_SAFE_INTEGER;
    }

    // Categorizar e calcular dias
    const categoryDays = {
        TEACHING: getDaysSinceCategoryLast(publisherHistory, 'TEACHING', today),
        STUDENT: getDaysSinceCategoryLast(publisherHistory, 'STUDENT', today),
        HELPER: getDaysSinceCategoryLast(publisherHistory, 'HELPER', today)
    };

    // Aplicar fórmula de prioridade ponderada
    const priority =
        categoryDays.TEACHING * CATEGORY_WEIGHTS.TEACHING +
        categoryDays.STUDENT * CATEGORY_WEIGHTS.STUDENT +
        categoryDays.HELPER * CATEGORY_WEIGHTS.HELPER;

    return priority;
}

/**
 * Verifica se um publicador está em cooldown para um tipo de parte
 */
export function getCooldownInfo(
    publisherId: string,
    partType: string,
    history: HistoryRecord[],
    today: Date = new Date()
): CooldownInfo | null {
    // Filtrar histórico do publicador para o tipo de parte específico
    const relevantHistory = history
        .filter(h =>
            (h.resolvedPublisherId === publisherId || h.resolvedPublisherId === publisherId) &&
            (h.tipoParte === partType || h.tituloParte === partType)
        )
        .sort((a, b) => {
            const dateA = new Date(a.date || a.date || '');
            const dateB = new Date(b.date || b.date || '');
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
    partType?: string,
    today: Date = new Date()
): RotationScore[] {
    const scores: RotationScore[] = publishers.map(pub => {
        const priority = calculateRotationPriority(pub.id, history, today);
        const cooldownInfo = partType ? getCooldownInfo(pub.id, partType, history, today) : null;

        // Aplicar penalidade de cooldown
        const adjustedPriority = cooldownInfo?.isInCooldown
            ? priority * COOLDOWN_PENALTY_MULTIPLIER
            : priority;

        // Detalhes por categoria
        const pubHistory = history.filter(h =>
            h.resolvedPublisherId === pub.id || h.resolvedPublisherId === pub.id
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
 */
export function selectBestCandidate(
    eligiblePublishers: Publisher[],
    history: HistoryRecord[],
    partType: string,
    today: Date = new Date()
): Publisher | null {
    if (eligiblePublishers.length === 0) return null;

    const ranked = rankPublishersByRotation(eligiblePublishers, history, partType, today);

    // O primeiro é o que tem maior prioridade
    const bestId = ranked[0]?.publisherId;
    return eligiblePublishers.find(p => p.id === bestId) || null;
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

    // TEACHING: Discursos de ensino, Joias, Partes Vida Cristã (anciãos/SMs)
    const teachingModalities = [
        EnumModalidade.DISCURSO_ENSINO,
        EnumModalidade.PRESIDENCIA,
        EnumModalidade.ACONSELHAMENTO,
        EnumModalidade.DIRIGENTE_EBC,
        'Discurso de Ensino',
        'Presidência',
        'Aconselhamento',
        'Dirigente de EBC'
    ];
    const teachingParts = [
        EnumTipoParte.PRESIDENTE,
        EnumTipoParte.DISCURSO_TESOUROS,
        EnumTipoParte.JOIAS_ESPIRITUAIS,
        EnumTipoParte.PARTE_VIDA_CRISTA,
        EnumTipoParte.DIRIGENTE_EBC,
        EnumTipoParte.ELOGIOS_CONSELHOS,
        'Presidente',
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
    publisherId: string,
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
        .filter(h => h.resolvedPublisherId === publisherId || h.resolvedPublisherId === publisherId)
        .sort((a, b) => {
            const dateA = new Date(a.date || a.date || '');
            const dateB = new Date(b.date || b.date || '');
            return dateA.getTime() - dateB.getTime();
        });

    const categories = pubHistory.map(h => getParticipationCategory(h));

    // Calcular intervalo médio
    let totalInterval = 0;
    for (let i = 1; i < pubHistory.length; i++) {
        const dateA = new Date(pubHistory[i - 1].date || pubHistory[i - 1].date || '');
        const dateB = new Date(pubHistory[i].date || pubHistory[i].date || '');
        totalInterval += (dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24);
    }

    return {
        totalParticipations: pubHistory.length,
        teachingCount: categories.filter(c => c === 'TEACHING').length,
        studentCount: categories.filter(c => c === 'STUDENT').length,
        helperCount: categories.filter(c => c === 'HELPER').length,
        lastParticipation: pubHistory.length > 0
            ? pubHistory[pubHistory.length - 1].date || pubHistory[pubHistory.length - 1].date || null
            : null,
        averageIntervalDays: pubHistory.length > 1 ? totalInterval / (pubHistory.length - 1) : 0
    };
}
