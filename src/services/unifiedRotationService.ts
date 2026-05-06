/**
 * Unified Rotation Service - RVM Designações
 * 
 * "A Solução Elegante" restaurada + Upgrade Científico.
 * Fonte única de verdade para lógica de rotação e prioridade.
 * Usado por: Agente IA, Motor de Geração e Dropdown UI.
 */

import type { Publisher, HistoryRecord } from '../types';
import { isBlocked } from './cooldownService';
import { toLocalISODate } from '../utils/dateUtils';

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

// Partes que não contam para estatísticas ou histórico do publicador.
// Critério: apenas partes auto-atribuídas ao Presidente (cascata de quem já foi
// escolhido para presidir) e cânticos (não são designação pessoal).
// NOTAS:
// - "Presidente" NÃO está aqui: o scoring rastreia histórico de presidência
//   para rotação adequada entre anciãos elegíveis.
// - "Necessidades Locais" NÃO está aqui: embora seja designada à parte (fora do
//   algoritmo de rotação, na criação de eventos), DEVE pesar no histórico/score
//   geral do publicador para influenciar designações de outras partes.
export const EXCLUDED_STATS_PARTS = [
    "Cântico",
    "Cantico",
    "Oração Inicial",
    "Oracao Inicial",
    "Comentários iniciais",
    "Comentarios iniciais",
    "Elogios e conselhos",
    "Observações finais",
    "Observacoes finais",
    "Comentários finais",
    "Comentarios finais"
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

    // 1. Separar Histórico em duas visões temporais distintas:
    //
    //    a) PASSADO ESTRITO  → para Time Bonus ("há quanto tempo NÃO participa").
    //       Só faz sentido olhar pra trás; futuro nunca "reseta" ausência.
    //
    //    b) JANELA SIMÉTRICA → para Frequency Penalty.
    //       Carga real do publicador no contexto da rotação inclui designações
    //       JÁ MARCADAS para o futuro. Quem tem 3 partes pré-designadas nas
    //       próximas semanas NÃO é candidato neutro para uma substituição.
    //
    //    Em ambos os casos, excluir SOMENTE a própria data sendo avaliada
    //    (caso a designação atual já esteja no histórico passado).
    const refDateStrForFilter = referenceDate.toISOString().split('T')[0];

    const isMine = (h: HistoryRecord) =>
        (h.resolvedPublisherName === publisher.name || h.rawPublisherName === publisher.name) &&
        isStatPart(h.tipoParte || h.funcao);

    // PASSADO ESTRITO (Time Bonus): h.date < refDate
    const pastHistory = history
        .filter(h => isMine(h) && (h.date || '') < refDateStrForFilter)
        .sort((a, b) => b.date.localeCompare(a.date));

    // JANELA SIMÉTRICA ±12 semanas (Frequency Penalty): exclui só a própria data
    const windowStart = new Date(referenceDate);
    windowStart.setDate(windowStart.getDate() - (12 * 7));
    const windowEnd = new Date(referenceDate);
    windowEnd.setDate(windowEnd.getDate() + (12 * 7));
    const windowStartStr = windowStart.toISOString().split('T')[0];
    const windowEndStr = windowEnd.toISOString().split('T')[0];

    const windowHistory = history.filter(h => {
        if (!isMine(h)) return false;
        const d = h.date || '';
        if (!d || d === refDateStrForFilter) return false;
        return d >= windowStartStr && d <= windowEndStr;
    });

    // Histórico Específico: Apenas desta modalidade/tipo, SÓ PASSADO (Time Bonus)
    const specificHistory = pastHistory.filter(h => {
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
        // Garantido > 0 porque pastHistory já é estritamente anterior a refDate.
        const diffTime = referenceDate.getTime() - lastDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        weeksSinceLast = Math.floor(diffDays / 7);
    }

    if (weeksSinceLast > CURRENT_SCORING_CONFIG.MAX_LOOKBACK_WEEKS) {
        weeksSinceLast = CURRENT_SCORING_CONFIG.MAX_LOOKBACK_WEEKS;
    }

    // 2. CÁLCULO CIENTÍFICO: Tempo (Exponencial) — só passado importa
    details.timeBonus = Math.round(Math.pow(weeksSinceLast, CURRENT_SCORING_CONFIG.TIME_POWER) * CURRENT_SCORING_CONFIG.TIME_FACTOR);

    // 3. Penalidade de Frequência: carga na janela ±12 semanas (passado E futuro)
    const recentCount = windowHistory.length;
    details.frequencyPenalty = recentCount * CURRENT_SCORING_CONFIG.RECENT_PARTICIPATION_PENALTY;

    // 4. Bônus de Função
    const isDemonstration = partType.toLowerCase().includes('demonstra') || partType.toLowerCase().includes('estudante');
    if (isDemonstration && publisher.gender === 'sister') {
        details.roleBonus += CURRENT_SCORING_CONFIG.SISTER_DEMO_PRIORITY;
        details.specificAdjustments.push('Prioridade Irmã (Demo)');
    }

    // Presidente na Oração Final: agora é bloqueio duro em eligibilityService (Regra 8)
    // Penalidade soft removida — não é mais necessária

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
 * Retorna lista de candidatos classificada por pontuação (Score).
 *
 * Critério de desempate (quando dois candidatos têm score idêntico):
 *   1) maior weeksSinceLast (já refletido no score, mas reforça em caso de empate por teto da fórmula)
 *   2) maior tempo desde QUALQUER participação histórica (inclui partes não-rotacionadas) —
 *      garante que quem está mais "esquecido" globalmente venha primeiro
 *   3) ordem alfabética (estabilidade determinística final)
 *
 * Motivação: quando vários candidatos atingem o teto da fórmula (≥52 semanas para o tipo),
 * o desempate alfabético é arbitrário e gera viés sistêmico (sempre os mesmos primeiros nomes).
 * Ver /memories/session/pacote-melhorias-rotacao-2026-04-30.md.
 */
export function getRankedCandidates(
    candidates: Publisher[],
    partType: string,
    history: HistoryRecord[],
    currentPresident?: string,
    referenceDate?: Date
): RankedCandidate[] {
    const refStr = toLocalISODate(referenceDate ?? new Date());

    // Pré-computa última data de QUALQUER participação histórica por nome.
    // Mais tempo sem participação => menor lastAnyDate (string ISO) => deve vir primeiro.
    const lastAnyDateByName = new Map<string, string>();
    for (const h of history) {
        if (h.date >= refStr) continue; // só passado
        const nm = h.resolvedPublisherName || h.rawPublisherName;
        if (!nm) continue;
        const prev = lastAnyDateByName.get(nm);
        if (!prev || h.date > prev) lastAnyDateByName.set(nm, h.date);
    }

    const ranked = candidates.map(pub => {
        const scoreData = calculateScore(pub, partType, history, referenceDate, currentPresident);
        return { publisher: pub, scoreData };
    });

    return ranked.sort((a, b) => {
        // 1) score (descending)
        if (b.scoreData.score !== a.scoreData.score) {
            return b.scoreData.score - a.scoreData.score;
        }
        // 2) weeksSinceLast da modalidade (descending) — quem está mais tempo parado NA modalidade vem primeiro
        const wa = a.scoreData.weeksSinceLast ?? Number.MAX_SAFE_INTEGER;
        const wb = b.scoreData.weeksSinceLast ?? Number.MAX_SAFE_INTEGER;
        if (wb !== wa) return wb - wa;
        // 3) última participação em QUALQUER parte (ascending — data mais antiga primeiro = mais esquecido)
        const da = lastAnyDateByName.get(a.publisher.name) ?? '';
        const db = lastAnyDateByName.get(b.publisher.name) ?? '';
        if (da !== db) return da.localeCompare(db);
        // 4) fallback alfabético (estável)
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
): string;
export function generateNaturalLanguageExplanation(
    candidate: RankedCandidate,
    history: HistoryRecord[],
    referenceDate: Date,
    partType: string
): string;
export function generateNaturalLanguageExplanation(
    candidate: RankedCandidate,
    history: HistoryRecord[],
    referenceDate: Date = new Date(),
    partType?: string
): string {
    const { publisher, scoreData } = candidate;
    const { details, weeksSinceLast } = scoreData;

    const firstName = publisher.name.split(' ')[0];
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
        ? `Últimas participações: ${recentDates.join(', ')}.`
        : `${firstName} não tem participações anteriores registradas.`;

    // Frequência geral (agenda lotada ou livre)
    let narrative = "";
    if (details.frequencyPenalty > 50) {
        narrative = `${firstName} participou bastante nos últimos 3 meses — muitas designações recentes reduzem um pouco a prioridade geral.`;
    } else if (details.frequencyPenalty > 0) {
        narrative = `${firstName} teve algumas participações recentes, o que foi levado em conta no cálculo.`;
    } else {
        narrative = `${firstName} está com a agenda tranquila — sem muitas participações nos últimos meses.`;
    }

    // Tempo específico nesta parte
    const partLabel = partType ? `"${partType}"` : 'esta parte específica';
    if (weeksSinceLast > 20) {
        narrative += ` Além disso, há bastante tempo que não realiza ${partLabel}, o que aumenta a prioridade para ela.`;
    } else if (weeksSinceLast > 10) {
        narrative += ` Já faz um tempo considerável desde a última vez em ${partLabel}.`;
    } else if (weeksSinceLast <= 4 && weeksSinceLast >= 0) {
        narrative += ` Realizou ${partLabel} recentemente.`;
    }

    return `${narrative}\n\n📅 ${datesText}`;
}

export const ROTATION_CONFIG = CURRENT_SCORING_CONFIG;
