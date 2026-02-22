/**
 * Unified Rotation Service - RVM Designações
 * 
 * "A Solução Elegante" restaurada + Upgrade Científico.
 * Fonte única de verdade para lógica de rotação e prioridade.
 * Usado por: Agente IA, Motor de Geração e Dropdown UI.
 */

import type { Publisher, HistoryRecord } from '../types';
import { isBlocked } from './cooldownService';

// ===== CONFIGURAÇÃO DE PESOS (DINÂMICA) =====
let CURRENT_SCORING_CONFIG = {
    BASE_SCORE: 100,
    // FÓRMULA EXPONENCIAL: Score = Base + (Weeks^POWER * FACTOR)
    TIME_POWER: 1.5,
    TIME_FACTOR: 8,

    RECENT_PARTICIPATION_PENALTY: 20, // -20 pontos por participação nos últimos 3 meses
    COOLDOWN_PENALTY: 1500, // Penalidade massiva para bloqueados

    // Bônus específicos
    ELDER_BONUS: 5,
    SISTER_DEMO_PRIORITY: 50,

    // Limites
    MAX_LOOKBACK_WEEKS: 52,
};

/**
 * Atualiza a configuração do motor em tempo real
 */
export function updateRotationConfig(newConfig: Partial<typeof CURRENT_SCORING_CONFIG>) {
    console.log('[Rotation] Updating config:', newConfig);
    CURRENT_SCORING_CONFIG = { ...CURRENT_SCORING_CONFIG, ...newConfig };
}

export function getRotationConfig() {
    return { ...CURRENT_SCORING_CONFIG };
}

// Partes que não contam para estatísticas ou histórico do publicador
export const EXCLUDED_STATS_PARTS = [
    "Cântico",
    "Oração",
    "Comentários iniciais",
    "Elogios e conselhos",
    "Comentários finais",
    "Presidente"
];

// Helper to check exclusion
export const isStatPart = (title: string) => {
    if (!title) return false;
    const lower = title.toLowerCase();
    return !EXCLUDED_STATS_PARTS.some(k => lower.includes(k.toLowerCase()));
};

export interface RotationScore {
    score: number;
    details: {
        base: number;
        timeBonus: number;
        frequencyPenalty: number;
        cooldownPenalty: number;
        roleBonus: number;
        specificAdjustments: string[];
        scoreAdjustment?: number;
    };
    explanation: string;
    lastDate?: string;
    weeksSinceLast: number;
    isInCooldown: boolean;
}

export interface RankedCandidate {
    publisher: Publisher;
    scoreData: RotationScore;
}

/**
 * Calcula a pontuação unificada usando Lógica Científica (Crescimento Exponencial).
 */
export function calculateScore(
    publisher: Publisher,
    partType: string,
    history: HistoryRecord[],
    referenceDate: Date = new Date(),
    currentPresident?: string
): RotationScore {
    const details = {
        base: CURRENT_SCORING_CONFIG.BASE_SCORE,
        timeBonus: 0,
        frequencyPenalty: 0,
        cooldownPenalty: 0,
        roleBonus: 0,
        specificAdjustments: [] as string[],
        scoreAdjustment: 0
    };

    // 1. Separar Histórico: GERAL (Penalty) vs ESPECÍFICO (Time Bonus)
    const generalHistory = history
        .filter(h =>
            (h.resolvedPublisherName === publisher.name || h.rawPublisherName === publisher.name) &&
            isStatPart(h.tipoParte || h.funcao)
        )
        .sort((a, b) => b.date.localeCompare(a.date));

    // Histórico Específico: Apenas desta modalidade/tipo
    const specificHistory = generalHistory.filter(h => {
        if (!partType) return true;
        const pType = partType.toLowerCase();
        const hType = (h.tipoParte || '').toLowerCase();

        if (pType === 'ajudante' && (h.funcao === 'Ajudante' || (h.funcao as any) === 'ajudante')) return true;
        return hType === pType || hType.includes(pType);
    });

    const lastParticipation = specificHistory[0];
    let weeksSinceLast = CURRENT_SCORING_CONFIG.MAX_LOOKBACK_WEEKS;

    if (lastParticipation) {
        const lastDate = new Date(lastParticipation.date);
        const diffTime = Math.abs(referenceDate.getTime() - lastDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        weeksSinceLast = Math.floor(diffDays / 7);
    }

    if (weeksSinceLast > CURRENT_SCORING_CONFIG.MAX_LOOKBACK_WEEKS) {
        weeksSinceLast = CURRENT_SCORING_CONFIG.MAX_LOOKBACK_WEEKS;
    }

    // 2. CÁLCULO CIENTÍFICO: Tempo (Exponencial)
    details.timeBonus = Math.round(Math.pow(weeksSinceLast, CURRENT_SCORING_CONFIG.TIME_POWER) * CURRENT_SCORING_CONFIG.TIME_FACTOR);

    // 3. Calcular Penalidade de Frequência (12 semanas)
    const recentCutoff = new Date(referenceDate);
    recentCutoff.setDate(recentCutoff.getDate() - (12 * 7));
    const recentDateStr = recentCutoff.toISOString().split('T')[0];

    const recentCount = generalHistory.filter(h => h.date >= recentDateStr).length;
    details.frequencyPenalty = recentCount * CURRENT_SCORING_CONFIG.RECENT_PARTICIPATION_PENALTY;

    // 4. Bônus de Função
    const isDemonstration = partType.toLowerCase().includes('demonstra') || partType.toLowerCase().includes('estudante');
    if (isDemonstration && publisher.gender === 'sister') {
        details.roleBonus += CURRENT_SCORING_CONFIG.SISTER_DEMO_PRIORITY;
        details.specificAdjustments.push('Prioridade Irmã (Demo)');
    }

    if (currentPresident && publisher.name === currentPresident && partType.toLowerCase().includes('oração final')) {
        details.scoreAdjustment = -200;
        details.specificAdjustments.push('Penalidade Presidente (Último Recurso)');
    }

    // 5. Cooldown
    const blocked = isBlocked(publisher.name, history, referenceDate);
    if (blocked) {
        details.cooldownPenalty = CURRENT_SCORING_CONFIG.COOLDOWN_PENALTY;
        details.specificAdjustments.push('Cooldown Ativo');
    }

    // 6. Score Final
    const score = details.base + details.timeBonus - details.frequencyPenalty
        + details.roleBonus + (details.scoreAdjustment || 0) - details.cooldownPenalty;

    const explanationParts = [
        `Base: ${details.base}`,
        `Tempo Exp: +${details.timeBonus}`,
        `Freq: -${details.frequencyPenalty}`,
    ];
    if (details.cooldownPenalty > 0) explanationParts.push(`Cooldown: -${details.cooldownPenalty}`);
    if (details.roleBonus !== 0) explanationParts.push(`Bônus: +${details.roleBonus}`);
    if (details.scoreAdjustment) explanationParts.push(`Ajuste: ${details.scoreAdjustment}`);

    const explanation = `Score ${score} [${explanationParts.join(', ')}]`;

    return {
        score,
        details,
        explanation,
        lastDate: lastParticipation?.date,
        weeksSinceLast,
        isInCooldown: blocked
    };
}

/**
 * Retorna lista de candidatos classificada por pontuação (Score)
 */
export function getRankedCandidates(
    candidates: Publisher[],
    partType: string,
    history: HistoryRecord[],
    currentPresident?: string
): RankedCandidate[] {
    const ranked = candidates.map(pub => {
        const scoreData = calculateScore(pub, partType, history, undefined, currentPresident);
        return { publisher: pub, scoreData };
    });

    return ranked.sort((a, b) => {
        if (b.scoreData.score !== a.scoreData.score) {
            return b.scoreData.score - a.scoreData.score;
        }
        return a.publisher.name.localeCompare(b.publisher.name);
    });
}

export function explainScoreForAgent(candidate: RankedCandidate): string {
    const { publisher, scoreData } = candidate;
    return `${publisher.name}: Score ${scoreData.score}. Razão: ${scoreData.explanation}.`;
}

export function generateNaturalLanguageExplanation(
    candidate: RankedCandidate,
    history: HistoryRecord[],
    referenceDate: Date = new Date()
): string {
    const { publisher, scoreData } = candidate;
    const { details, weeksSinceLast } = scoreData;

    const refDateStr = referenceDate.toISOString().split('T')[0];

    const allHistory = history
        .filter(h =>
            (h.resolvedPublisherName === publisher.name || h.rawPublisherName === publisher.name) &&
            h.date < refDateStr &&
            isStatPart(h.tipoParte || h.funcao)
        )
        .sort((a, b) => b.date.localeCompare(a.date));

    const recentDates = allHistory.slice(0, 3).map(h => {
        const safeDate = new Date(h.date + 'T12:00:00');
        const dateStr = safeDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
        return `${dateStr} (${h.funcao})`;
    });

    const datesText = recentDates.length > 0
        ? `Últimas: ${recentDates.join(', ')}.`
        : "Nenhuma participação recente.";

    let narrative = "";
    if (details.frequencyPenalty > 50) {
        narrative = "⚠️ Pontuação reduzida pois tem muitas designações recentes.";
    } else if (details.frequencyPenalty > 0) {
        narrative = "Prioridade levemente reduzida devido a outras designações recentes.";
    } else {
        narrative = "Está com a agenda geral livre.";
    }

    if (weeksSinceLast > 20) {
        narrative += " E faz muito tempo que não realiza esta parte específica.";
    } else if (weeksSinceLast > 10) {
        narrative += " E já faz um tempo desde a última vez nesta parte.";
    } else {
        narrative += " (Disponível).";
    }

    return `${narrative}\n\n📅 ${datesText}`;
}

export const ROTATION_CONFIG = CURRENT_SCORING_CONFIG;
