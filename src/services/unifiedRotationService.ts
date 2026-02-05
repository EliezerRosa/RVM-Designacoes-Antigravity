/**
 * Unified Rotation Service - RVM Designações
 * 
 * "A Solução Elegante" restaurada + Upgrade Científico.
 * Fonte única de verdade para lógica de rotação e prioridade.
 * Usado por: Agente IA, Motor de Geração e Dropdown UI.
 */

import type { Publisher, HistoryRecord } from '../types';

// ===== CONFIGURAÇÃO DE PESOS =====
const SCORING_CONFIG = {
    BASE_SCORE: 100,
    // FÓRMULA EXPONENCIAL: Score = Base + (Weeks^POWER * FACTOR)
    // Isso cria uma "Gravidade" que aumenta drasticamente quanto mais tempo se espera.
    TIME_POWER: 1.5,
    TIME_FACTOR: 8,

    RECENT_PARTICIPATION_PENALTY: 20, // -20 pontos por participação nos últimos 3 meses

    // Bônus específicos
    ELDER_BONUS: 5, // Pequeno bônus para manter anciãos visíveis se necessário
    SISTER_DEMO_PRIORITY: 50, // Prioridade alta para irmãs em demonstrações (Regra v8.3)

    // Limites
    MAX_LOOKBACK_WEEKS: 52, // Olhar no máximo 1 ano para trás
};

export interface RotationScore {
    score: number;
    details: {
        base: number;
        timeBonus: number;
        frequencyPenalty: number;
        roleBonus: number;
        specificAdjustments: string[];
    };
    explanation: string;
    lastDate?: string;
    weeksSinceLast: number;
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
    referenceDate: Date = new Date()
): RotationScore {
    const details = {
        base: SCORING_CONFIG.BASE_SCORE,
        timeBonus: 0,
        frequencyPenalty: 0,
        roleBonus: 0,
        specificAdjustments: [] as string[]
    };

    // 1. Encontrar última participação
    // Filtrar apenas participações relevantes (ex: se for parte de estudante, olhar histórico de estudante)
    // Por simplicidade na v1 (restauração), olhamos qualquer participação principal como "reset" de tempo
    // Idealmente, poderíamos ter categorias (Mechanical vs Teaching), mas vamos manter simples e coeso.

    const publisherHistory = history
        .filter(h =>
            (h.resolvedPublisherName === publisher.name || h.rawPublisherName === publisher.name) &&
            h.funcao === 'Titular' // Ajudante conta menos ou não zera "tempo sem parte principal"
            // TODO: Refinar se Ajudante deve contar como participação full. 
            // Na "Solução Elegante" original, ajudante contava menos. Vamos manter simples agora.
        )
        .sort((a, b) => b.date.localeCompare(a.date)); // Mais recente primeiro

    const lastParticipation = publisherHistory[0];
    let weeksSinceLast = SCORING_CONFIG.MAX_LOOKBACK_WEEKS; // Default para "nunca participou recentemente"

    if (lastParticipation) {
        const lastDate = new Date(lastParticipation.date);
        const diffTime = Math.abs(referenceDate.getTime() - lastDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        weeksSinceLast = Math.floor(diffDays / 7);
    }

    // Cap no lookback para não inflar infinitamente
    if (weeksSinceLast > SCORING_CONFIG.MAX_LOOKBACK_WEEKS) {
        weeksSinceLast = SCORING_CONFIG.MAX_LOOKBACK_WEEKS;
    }

    // 2. CÁLCULO CIENTÍFICO: Tempo (Exponencial)
    // Fórmula: (Semanas ^ 1.5) * Fator
    // Ex: 4 semanas = 8 * 10 = 80 pts
    // Ex: 8 semanas = 22.6 * 10 = 226 pts (A urgência quase triplica, não apenas dobra!)
    // Usamos Math.pow para a curva
    details.timeBonus = Math.round(Math.pow(weeksSinceLast, SCORING_CONFIG.TIME_POWER) * SCORING_CONFIG.TIME_FACTOR);

    // 3. Calcular Penalidade de Frequência (Participações recentes - 12 semanas)
    // Penaliza quem fez MUITAS partes recentemente, mesmo que a última tenha sido há algumas semanas.
    // Isso evita o "efeito ioiô" (faz 3 seguidas e para).
    const recentCutoff = new Date(referenceDate);
    recentCutoff.setDate(recentCutoff.getDate() - (12 * 7)); // 3 meses
    const recentDateStr = recentCutoff.toISOString().split('T')[0];

    const recentCount = publisherHistory.filter(h => h.date >= recentDateStr).length;
    details.frequencyPenalty = recentCount * SCORING_CONFIG.RECENT_PARTICIPATION_PENALTY;

    // 4. Bônus de Função / Regras Específicas
    // Exemplo: Irmãs em demonstrações (Regra v8.3)
    const isDemonstration = partType.toLowerCase().includes('demonstra') || partType.toLowerCase().includes('estudante');
    if (isDemonstration && publisher.gender === 'sister') {
        details.roleBonus += SCORING_CONFIG.SISTER_DEMO_PRIORITY;
        details.specificAdjustments.push('Prioridade Irmã (Demo)');
    }

    // 5. Score Final
    let score = details.base + details.timeBonus - details.frequencyPenalty + details.roleBonus;

    // Gerar explicação legível (Científica)
    const explanationParts = [
        `Base: ${details.base}`,
        `Tempo Exp: +${details.timeBonus} (${weeksSinceLast}^${SCORING_CONFIG.TIME_POWER})`,
        `Freq: -${details.frequencyPenalty}`,
    ];
    if (details.roleBonus !== 0) explanationParts.push(`Bônus: +${details.roleBonus}`);

    const explanation = `Score ${score} [${explanationParts.join(', ')}]`;

    return {
        score,
        details,
        explanation,
        lastDate: lastParticipation?.date,
        weeksSinceLast
    };
}

/**
 * Retorna lista de candidatos classificada por pontuação (Score)
 */
export function getRankedCandidates(
    candidates: Publisher[], // Já devem vir filtrados por elegibilidade básica
    partType: string,
    history: HistoryRecord[]
): RankedCandidate[] {
    const ranked = candidates.map(pub => {
        const scoreData = calculateScore(pub, partType, history);
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
            h.date < refDateStr // STRICTLY PASSED
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
        narrative = "⚠️ Pontuação reduzida devido a muitas participações recentes.";
    } else if (details.frequencyPenalty > 0) {
        narrative = "Possui participações recentes, o que reduz levemente a prioridade.";
    } else {
        narrative = "Está com a agenda livre recentemente, aumentando a prioridade.";
    }

    if (weeksSinceLast > 20) {
        narrative += " Faz muito tempo que não realiza essa parte específica.";
    } else if (weeksSinceLast > 10) {
        narrative += " Já faz um tempo desde a última designação.";
    } else if (weeksSinceLast < 4 && weeksSinceLast > 0) {
        narrative += " Designado recentemente.";
    }

    // Montar string final
    return `${narrative}\n\n📅 ${datesText}\n📊 ${countText}`;
}

// Exportar configuração para uso em UI se necessário
export const ROTATION_CONFIG = SCORING_CONFIG;
