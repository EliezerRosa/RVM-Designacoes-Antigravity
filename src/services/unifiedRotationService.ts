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
    // Isso cria uma "Gravidade" que aumenta drasticamente quanto mais tempo se espera.
    TIME_POWER: 1.5,
    TIME_FACTOR: 8,

    RECENT_PARTICIPATION_PENALTY: 20, // -20 pontos por participação nos últimos 3 meses
    COOLDOWN_PENALTY: 1500, // Penalidade massiva para bloqueados (garante que caiam abaixo de livres)

    // Bônus específicos
    ELDER_BONUS: 5, // Pequeno bônus para manter anciãos visíveis se necessário
    SISTER_DEMO_PRIORITY: 50, // Prioridade alta para irmãs em demonstrações (Regra v8.3)

    // Limites
    MAX_LOOKBACK_WEEKS: 52, // Olhar no máximo 1 ano para trás
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
    "Comentários iniciais", // Lowercase normalized check usually better, but let's match user input then normalize in check
    "Elogios e conselhos",
    "Comentários finais",
    "Presidente" // User didn't ask for this but usually goes with Comentarios. Adhering strictly to user list first.
];

// Helper to check exclusion
export const isStatPart = (title: string) => {
    if (!title) return false;
    const lower = title.toLowerCase();
    // Use the constant for single source of truth
    return !EXCLUDED_STATS_PARTS.some(k => lower.includes(k.toLowerCase()));
};

export interface RotationScore {
    score: number;
    details: {
        base: number;
        timeBonus: number;
        frequencyPenalty: number;
        cooldownPenalty: number; // v10: Penalidade de cooldown
        roleBonus: number;
        specificAdjustments: string[];
        scoreAdjustment?: number; // v9.4: Penalidades ou bônus manuais
    };
    explanation: string;
    lastDate?: string;
    weeksSinceLast: number;
    isInCooldown: boolean; // v10: Flag de cooldown
}

export interface RankedCandidate {
    publisher: Publisher;
    scoreData: RotationScore;
}

// ============================================================================
// CORE LOGIC
// ============================================================================

export function calculateRotationScore(
    candidate: Publisher,
    _partDate: string, // Unused
    history: HistoryRecord[],
    partType: string
): RotationScore {
    // Legacy wrapper - redirects to main logic
    return calculateScore(candidate, partType, history);
}

export interface RankedCandidate {
    publisher: Publisher;
    scoreData: RotationScore;
}

// ============================================================================
// CORE LOGIC
// ============================================================================

/**
 * Calcula a pontuação unificada usando Lógica Científica (Crescimento Exponencial).
 * 
 * Por que Científico?
 * Ao contrário da média linear simples, usamos exponenciais para modelar a "Urgência".
 * - O tempo de espera tem peso crescente (Weeks^1.5): Esperar 10 semanas é MUITO pior do que esperar 5.
 * - Isso cria uma "Gravidade" que puxa rapidamente os negligenciados para o topo.
 */
export function calculateScore(
    publisher: Publisher,
    partType: string,
    history: HistoryRecord[],
    referenceDate: Date = new Date(),
    currentPresident?: string // Novo argumento opcional
): RotationScore {
    const details = {
        base: CURRENT_SCORING_CONFIG.BASE_SCORE,
        timeBonus: 0,
        frequencyPenalty: 0,
        cooldownPenalty: 0, // v10
        roleBonus: 0,
        specificAdjustments: [] as string[],
        scoreAdjustment: 0 // v9.4: Init
    };

    // 1. Separar Histórico: GERAL (Penalty) vs ESPECÍFICO (Time Bonus)
    // Histórico Geral: Qualquer participação relevante (Stat Part)
    const generalHistory = history
        .filter(h =>
            (h.resolvedPublisherName === publisher.name || h.rawPublisherName === publisher.name) &&
            isStatPart(h.tipoParte || h.funcao)
        )
        .sort((a, b) => b.date.localeCompare(a.date));

    // Histórico Específico: Apenas desta modalidade/tipo
    // Se partType for "Ajudante", aceitamos qualquer ajudante? Ou ajudante da mesma seção?
    // Por simplicidade, usamos match de string no tipoParte.
    const specificHistory = generalHistory.filter(h => {
        if (!partType) return true; // Se não especificado, usa geral
        // Normalize strings for comparison
        const pType = partType.toLowerCase();
        const hType = (h.tipoParte || '').toLowerCase();

        // Se for "Ajudante", é genérico
        if (pType === 'ajudante' && (h.funcao === 'Ajudante' || (h.funcao as any) === 'ajudante')) return true;

        // Match exato ou parcial suficiente
        return hType === pType || hType.includes(pType);
    });

    const lastParticipation = specificHistory[0]; // Agora é ESPECÍFICO
    let weeksSinceLast = CURRENT_SCORING_CONFIG.MAX_LOOKBACK_WEEKS; // Default para "nunca participou recentemente"

    if (lastParticipation) {
        const lastDate = new Date(lastParticipation.date);
        const diffTime = Math.abs(referenceDate.getTime() - lastDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        weeksSinceLast = Math.floor(diffDays / 7);
    }

    // Cap no lookback para não inflar infinitamente
    if (weeksSinceLast > CURRENT_SCORING_CONFIG.MAX_LOOKBACK_WEEKS) {
        weeksSinceLast = CURRENT_SCORING_CONFIG.MAX_LOOKBACK_WEEKS;
    }

    // 2. CÁLCULO CIENTÍFICO: Tempo (Exponencial) - Baseado no ESPECÍFICO
    // Fórmula: (Semanas ^ 1.5) * Fator
    // Ex: 4 semanas = 8 * 10 = 80 pts
    // Ex: 8 semanas = 22.6 * 10 = 226 pts (A urgência quase triplica, não apenas dobra!)
    // Usamos Math.pow para a curva
    details.timeBonus = Math.round(Math.pow(weeksSinceLast, CURRENT_SCORING_CONFIG.TIME_POWER) * CURRENT_SCORING_CONFIG.TIME_FACTOR);

    // 3. Calcular Penalidade de Frequência (Participações recentes - 12 semanas)
    // Penaliza quem fez MUITAS partes recentemente, mesmo que a última tenha sido há algumas semanas.
    // Isso evita o "efeito ioiô" (faz 3 seguidas e para).
    const recentCutoff = new Date(referenceDate);
    recentCutoff.setDate(recentCutoff.getDate() - (12 * 7)); // 3 meses
    const recentDateStr = recentCutoff.toISOString().split('T')[0];

    const recentCount = generalHistory.filter(h => h.date >= recentDateStr).length;
    details.frequencyPenalty = recentCount * CURRENT_SCORING_CONFIG.RECENT_PARTICIPATION_PENALTY;

    // 4. Bônus de Função / Regras Específicas
    // Exemplo: Irmãs em demonstrações (Regra v8.3)
    const isDemonstration = partType.toLowerCase().includes('demonstra') || partType.toLowerCase().includes('estudante');
    if (isDemonstration && publisher.gender === 'sister') {
        details.roleBonus += CURRENT_SCORING_CONFIG.SISTER_DEMO_PRIORITY;
        details.specificAdjustments.push('Prioridade Irmã (Demo)');
    }

    // Regra v9.4: Penalidade para Presidente na Oração Final
    if (currentPresident && publisher.name === currentPresident && partType.toLowerCase().includes('oração final')) {
        details.scoreAdjustment = -200; // Penalidade massiva para jogar para o final da fila
        details.specificAdjustments.push('Penalidade Presidente (Último Recurso)');
    }

    // 5. v10: Penalidade de Cooldown (BLOQUEIO SUAVE)
    const blocked = isBlocked(publisher.name, history, referenceDate);
    if (blocked) {
        details.cooldownPenalty = CURRENT_SCORING_CONFIG.COOLDOWN_PENALTY;
        details.specificAdjustments.push('Cooldown Ativo');
    }

    // 6. Score Final
    const score = details.base + details.timeBonus - details.frequencyPenalty
        + details.roleBonus + (details.scoreAdjustment || 0) - details.cooldownPenalty;

    // Gerar explicação legível (Científica)
    const explanationParts = [
        `Base: ${details.base}`,
        `Tempo Exp: +${details.timeBonus} (${weeksSinceLast}^${CURRENT_SCORING_CONFIG.TIME_POWER})`,
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
        isInCooldown: blocked // v10
    };
}

/**
 * Retorna lista de candidatos classificada por pontuação (Score)
 */
export function getRankedCandidates(
    candidates: Publisher[], // Já devem vir filtrados por elegibilidade básica
    partType: string,
    history: HistoryRecord[],
    currentPresident?: string
): RankedCandidate[] {
    const ranked = candidates.map(pub => {
        const scoreData = calculateScore(pub, partType, history, undefined, currentPresident);
        return {
            publisher: pub,
            scoreData
        };
    });

    // Ordenar: Maior score primeiro
    // Desempate: Menor quantidade de participações recentes, depois Alfabético
    return ranked.sort((a, b) => {
        if (b.scoreData.score !== a.scoreData.score) {
            return b.scoreData.score - a.scoreData.score;
        }
        return a.publisher.name.localeCompare(b.publisher.name);
    });
}

/**
 * Explica a pontuação para o Agente IA (formato string amigável)
 */
export function explainScoreForAgent(candidate: RankedCandidate): string {
    const { publisher, scoreData } = candidate;
    return `${publisher.name}: Score ${scoreData.score}. Razão: ${scoreData.explanation}.`;
}

/**
 * Gera uma explicação em linguagem natural para a UI
 */
export function generateNaturalLanguageExplanation(
    candidate: RankedCandidate,
    history: HistoryRecord[],
    referenceDate: Date = new Date() // Default to NOW if not provided
): string {
    const { publisher, scoreData } = candidate;
    const { details, weeksSinceLast } = scoreData;

    // 1. Encontrar a ÚLTIMA PARTICIPAÇÃO REAL (Passado)
    // Filtramos para garantir que seja estritamente ANTERIOR à data de referência (ou hoje)
    const refDateStr = referenceDate.toISOString().split('T')[0];

    const allHistory = history
        .filter(h =>
            (h.resolvedPublisherName === publisher.name || h.rawPublisherName === publisher.name) &&
            h.date < refDateStr && // STRICTLY PASSED
            isStatPart(h.tipoParte || h.funcao) // NEW: Filter out non-stat parts
        )
        .sort((a, b) => b.date.localeCompare(a.date));


    // 2. Construir narrativa do Score
    let narrative = "";

    const pastCount12Months = allHistory.filter(h => {
        const d = new Date(h.date);
        const twelveMonthsAgo = new Date(referenceDate);
        twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
        return d >= twelveMonthsAgo;
    }).length;

    // Listar as últimas 3 datas para dar contexto visual
    // allHistory já está filtrado (Passado) e ordenado (Recente primeiro)
    const recentDates = allHistory.slice(0, 3).map(h => {
        const safeDate = new Date(h.date + 'T12:00:00');
        const dateStr = safeDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
        return `${dateStr} (${h.funcao})`;
    });

    const datesText = recentDates.length > 0
        ? `Últimas: ${recentDates.join(', ')}.`
        : "Nenhuma participação recente.";

    const countText = pastCount12Months > 0 ? `Total: ${pastCount12Months}x (12 meses).` : "";

    // Penalidades
    if (details.frequencyPenalty > 50) {
        narrative = "⚠️ Pontuação reduzida pois tem muitas designações recentes (Geral).";
    } else if (details.frequencyPenalty > 0) {
        narrative = "Prioridade levemente reduzida devido a outras designações recentes (Geral).";
    } else {
        narrative = "Está com a agenda geral livre, o que aumenta a prioridade.";
    }

    if (weeksSinceLast > 20) {
        narrative += " E faz muito tempo que não realiza ESTA parte específica.";
    } else if (weeksSinceLast > 10) {
        narrative += " E já faz um tempo desde a última vez NESTA parte.";
    } else if (weeksSinceLast < 4 && weeksSinceLast > 0) {
        narrative += " Porém, fez ESTA parte recentemente.";
    } else {
        narrative += " (Disponível para esta função).";
    }

    // Montar string final
    return `${narrative}\n\n📅 ${datesText}\n📊 ${countText}`;
}

// Exportar configuração para uso em UI se necessário
export const ROTATION_CONFIG = CURRENT_SCORING_CONFIG;
