/**
 * Unified Rotation Service - RVM Designações
 * 
 * "A Solução Elegante" restaurada + Upgrade Científico.
 * Fonte única de verdade para lógica de rotação e prioridade.
 * Usado por: Agente IA, Motor de Geração e Dropdown UI.
 */

import type { Publisher, HistoryRecord, EngineConfig } from '../types';
import { DEFAULT_ENGINE_CONFIG } from '../types';
import { isBlocked } from './cooldownService';
import { toLocalISODate } from '../utils/dateUtils';

// ===== CONFIGURAÇÃO DE PESOS (DINÂMICA) =====
// Fonte canônica do shape: `EngineConfig` em `types.ts`.
// Defaults canônicos: `DEFAULT_ENGINE_CONFIG`.
// Persistência (setting `engine_config`) e UI (`EngineRulesPanel`) operam
// sobre este MESMO objeto plano via `engineConfigService`.
let CURRENT_SCORING_CONFIG: EngineConfig = { ...DEFAULT_ENGINE_CONFIG };

/**
 * Atualiza a configuração do motor em tempo real
 */
export function updateRotationConfig(newConfig: Partial<EngineConfig>) {
    console.log('[Rotation] Updating config:', newConfig);
    CURRENT_SCORING_CONFIG = { ...CURRENT_SCORING_CONFIG, ...newConfig };
}

export function getRotationConfig(): EngineConfig {
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

// Partes de alto peso: designação recente ou futura nestas partes
// impõe penalidade graduada na janela ±HEAVY_ROLE_RADIUS semanas.
// Critério: exigem preparação profunda e liderança de audiência comparável ao Presidente.
// Chaves normalizadas (sem artigos/preposições) — combinadas via normPartType() antes de comparar.
// Cobre tanto o workbook atual ("Dirigente EBC") quanto histórico legado ("Dirigente do EBC") etc.
export const HEAVY_WEIGHT_PARTS = [
    'presidente',
    'dirigente ebc',
    'discurso tesouros',
    'discurso vida cristã',
    'leitor ebc',
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
        /** Nº de partes contabilizadas na janela ±12 semanas (gera frequencyPenalty). */
        recentCount: number;
        cooldownPenalty: number;
        /** Penalidade graduada por papel pesado (Presidente, EBC, Discurso) em ±HEAVY_ROLE_RADIUS semanas. */
        heavyProximityPenalty: number;
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
 * Normaliza tipoParte para comparação: remove artigos/preposições comuns (do, da, na, no...)
 * que causam divergência entre o workbook atual ("Dirigente EBC") e registros históricos
 * legados ("Dirigente do EBC", "Discurso na Tesouros", "Parte na Vida Cristã" etc.).
 */
function normPartType(s: string): string {
    return s.toLowerCase()
        .replace(/\b(do|da|de|na|no|dos|das)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ===== HELPERS — janelas FSM (alternância e par) =====
// FSM = partes do "Faça Seu Melhor no Ministério": leitura/demonstração/discurso estudante.
// Alinhado ao critério já usado pelo FSM_TITULAR_PROMOTION_BONUS.
export function isFSMHistoryRecord(h: HistoryRecord): boolean {
    const t = (h.tipoParte || '').toLowerCase();
    const m = (h.modalidade || '').toLowerCase();
    return t.includes('ministerio') || t.includes('demonstra') || t.includes('estudante') ||
           m.includes('demonstra') || m.includes('estudante') || m.includes('leitura');
}

/**
 * Retorna o papel mais recente do publicador em parte FSM dentro da janela.
 * `null` se não tem nada na janela.
 */
export function getMostRecentFSMRole(
    publisherName: string,
    history: HistoryRecord[],
    referenceDate: Date,
    windowWeeks: number
): 'Titular' | 'Ajudante' | null {
    if (!publisherName || windowWeeks <= 0) return null;
    const cutoff = new Date(referenceDate);
    cutoff.setDate(cutoff.getDate() - windowWeeks * 7);
    const lowerName = publisherName.trim().toLowerCase();

    let best: HistoryRecord | null = null;
    for (const h of history) {
        const nm = (h.resolvedPublisherName || '').trim().toLowerCase();
        if (nm !== lowerName) continue;
        if (!isFSMHistoryRecord(h)) continue;
        const hDate = new Date(h.date + 'T12:00:00');
        if (hDate >= referenceDate) continue;     // só passado
        if (hDate < cutoff) continue;             // dentro da janela
        if (!best || new Date(best.date) < hDate) best = h;
    }
    return best ? (best.funcao as 'Titular' | 'Ajudante') : null;
}

/**
 * Verifica se o candidato já foi Ajudante deste titular dentro da janela.
 * Olha pares titular+ajudante via (weekId, seq).
 */
export function wasRecentlyPairedWith(
    candidateName: string,
    titularName: string,
    history: HistoryRecord[],
    referenceDate: Date,
    windowWeeks: number
): boolean {
    if (!candidateName || !titularName || windowWeeks <= 0) return false;
    const cutoff = new Date(referenceDate);
    cutoff.setDate(cutoff.getDate() - windowWeeks * 7);
    const candLower = candidateName.trim().toLowerCase();
    const titLower = titularName.trim().toLowerCase();

    // 1) Coletar registros do candidato como Ajudante na janela
    const candidateAjudantes = history.filter(h => {
        if (h.funcao !== 'Ajudante') return false;
        if ((h.resolvedPublisherName || '').trim().toLowerCase() !== candLower) return false;
        const d = new Date(h.date + 'T12:00:00');
        return d < referenceDate && d >= cutoff;
    });
    if (candidateAjudantes.length === 0) return false;

    // 2) Para cada um, procurar o titular correspondente (mesmo weekId+seq)
    for (const aj of candidateAjudantes) {
        const tit = history.find(h2 =>
            h2.weekId === aj.weekId &&
            h2.seq === aj.seq &&
            h2.funcao === 'Titular'
        );
        if (tit && (tit.resolvedPublisherName || '').trim().toLowerCase() === titLower) {
            return true;
        }
    }
    return false;
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
        recentCount: 0,
        cooldownPenalty: 0, // mantido em 0 (visual only) — score usa heavyProximityPenalty
        heavyProximityPenalty: 0,
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
    // Hoist pType para uso em specificHistory e bônus FSM
    const pType = partType.toLowerCase();

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
    // Normalização via normPartType(): elimina divergências entre nomes do workbook atual
    // ("Dirigente EBC", "Leitor EBC", "Discurso Tesouros", "Parte Vida Cristã") e registros
    // históricos legados ("Dirigente do EBC", "Leitor do EBC", "Discurso na Tesouros",
    // "Parte na Vida Cristã") — os artigos/preposições "do", "da", "na", etc. são removidos
    // antes de comparar, garantindo match correto e Time Bonus preciso.
    const pTypeNorm = normPartType(pType);
    const specificHistory = pastHistory.filter(h => {
        if (!partType) return true;
        const hType = (h.tipoParte || '').toLowerCase();
        const hFuncao = (h.funcao || '').toLowerCase();

        if (pType === 'ajudante' && hFuncao === 'ajudante') return true;

        // Item 1: Ajudante tem mesmo efeito e peso que Titular na mesma categoria.
        // Para partes de ministério/demonstração (FSM), inclui histórico de ajudante
        // no cálculo de weeksSinceLast — quem foi ajudante recentemente não deve
        // aparecer como "nunca participou" nessa categoria de parte.
        const isMinistryPart = pType.includes('ministerio') || pType.includes('demonstra') || pType.includes('estudante');
        if (isMinistryPart && hFuncao === 'ajudante') return true;

        // Comparação direta (sem normalização) — cobre casos onde os nomes já coincidem
        if (hType === pType || hType.includes(pType)) return true;
        // Comparação normalizada — cobre divergências com artigos/preposições
        const hTypeNorm = normPartType(hType);
        return hTypeNorm === pTypeNorm || hTypeNorm.includes(pTypeNorm);
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
    details.recentCount = recentCount;
    details.frequencyPenalty = recentCount * CURRENT_SCORING_CONFIG.RECENT_PARTICIPATION_PENALTY;

    // 3b. Penalidade de Proximidade de Papel Pesado (Heavy Proximity Penalty)
    // Partes de alto peso nos ±HEAVY_ROLE_RADIUS semanas impõem penalidade graduada:
    //   factor = max(0, (radius - weeksAway) / radius)
    // Cada ocorrência contribui independentemente (soma). Exclui a própria data.
    {
        const heavyRadius = CURRENT_SCORING_CONFIG.HEAVY_ROLE_RADIUS;
        const heavyBase = CURRENT_SCORING_CONFIG.HEAVY_ROLE_BASE;
        const refMs = referenceDate.getTime();
        const hwWinMs = heavyRadius * 7 * 24 * 60 * 60 * 1000;
        const hwStartStr = new Date(refMs - hwWinMs).toISOString().split('T')[0];
        const hwEndStr = new Date(refMs + hwWinMs).toISOString().split('T')[0];
        for (const h of history) {
            const isThisPublisher = h.resolvedPublisherName === publisher.name || h.rawPublisherName === publisher.name;
            if (!isThisPublisher) continue;
            const d = h.date || '';
            if (!d || d === refDateStrForFilter) continue;
            if (d < hwStartStr || d > hwEndStr) continue;
            const hTypeNorm = normPartType(h.tipoParte || '');
            if (!HEAVY_WEIGHT_PARTS.some(k => hTypeNorm.includes(k))) continue;
            const diffMs = Math.abs(new Date(d + 'T12:00:00').getTime() - refMs);
            const weeksAway = diffMs / (7 * 24 * 60 * 60 * 1000);
            const factor = Math.max(0, (heavyRadius - weeksAway) / heavyRadius);
            details.heavyProximityPenalty += Math.round(heavyBase * factor);
        }
        if (details.heavyProximityPenalty > 0) {
            details.specificAdjustments.push(`HeavyProx: -${details.heavyProximityPenalty}`);
        }
    }

    // 4. Bônus de Função
    const isDemonstration = pType.includes('demonstra') || pType.includes('estudante');
    if (isDemonstration && publisher.gender === 'sister') {
        details.roleBonus += CURRENT_SCORING_CONFIG.SISTER_DEMO_PRIORITY;
        details.specificAdjustments.push('Prioridade Irmã (Demo)');
    }

    // Item 2: Bônus de Promoção FSM — se a última participação na seção
    // Faça Seu Melhor foi como Ajudante, aumentar prioridade para partes de Titular.
    // Implementa a progressão pedagógica: Ajudante → Titular (sem impedimento).
    const isTitularMinistryPart = !pType.includes('ajudante') &&
        (pType.includes('ministerio') || pType.includes('demonstra') || pType.includes('estudante'));
    if (isTitularMinistryPart) {
        const lastFsmRecord = pastHistory.find(h => {
            const hFuncao = (h.funcao || '').toLowerCase();
            const hType = (h.tipoParte || '').toLowerCase();
            return hFuncao === 'ajudante' ||
                hType.includes('ministerio') || hType.includes('demonstra') || hType.includes('estudante');
        });
        if (lastFsmRecord?.funcao === 'Ajudante') {
            details.roleBonus += CURRENT_SCORING_CONFIG.FSM_TITULAR_PROMOTION_BONUS;
            details.specificAdjustments.push('Progressão FSM: última part. foi Ajudante');
        }
    }

    // Presidente na Oração Final: agora é bloqueio duro em eligibilityService (Regra 8)
    // Penalidade soft removida — não é mais necessária

    // 5. Cooldown — mantido APENAS para indicador visual (isInCooldown)
    // O score não usa mais cooldownPenalty; a penalidade real é heavyProximityPenalty (passo 3b).
    const blocked = isBlocked(publisher.name, history, referenceDate);
    if (blocked) {
        details.specificAdjustments.push('Intervalo ativo (visual)');
    }

    // 6. Score Final
    const score = details.base + details.timeBonus - details.frequencyPenalty
        + details.roleBonus + (details.scoreAdjustment || 0) - details.heavyProximityPenalty;

    const explanationParts = [
        `Base: ${details.base}`,
        `Tempo Exp: +${details.timeBonus}`,
        `Freq: -${details.frequencyPenalty}`,
    ];
    if (details.heavyProximityPenalty > 0) explanationParts.push(`HeavyProx: -${details.heavyProximityPenalty}`);
    if (blocked) explanationParts.push('Intervalo ativo');
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
 *   3) menor número total de participações na janela MAX_LOOKBACK_WEEKS — favorece
 *      quem participou menos no histórico recente (justiça acumulada)
 *   4) ordem alfabética (estabilidade determinística final)
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
    // Pré-computa contagem total de participações por nome dentro da janela MAX_LOOKBACK_WEEKS.
    // Menor contagem => candidato participou menos => vem primeiro no desempate.
    const totalCountByName = new Map<string, number>();
    const lookbackMs = CURRENT_SCORING_CONFIG.MAX_LOOKBACK_WEEKS * 7 * 24 * 60 * 60 * 1000;
    const refDateMs = (referenceDate ?? new Date()).getTime();
    const lookbackCutoffMs = refDateMs - lookbackMs;
    for (const h of history) {
        if (h.date >= refStr) continue; // só passado
        const nm = h.resolvedPublisherName || h.rawPublisherName;
        if (!nm) continue;
        const prev = lastAnyDateByName.get(nm);
        if (!prev || h.date > prev) lastAnyDateByName.set(nm, h.date);
        // Contagem dentro da janela de lookback
        const hMs = new Date(h.date).getTime();
        if (!Number.isNaN(hMs) && hMs >= lookbackCutoffMs) {
            totalCountByName.set(nm, (totalCountByName.get(nm) ?? 0) + 1);
        }
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
        // 2) weeksSinceLast da modalidade (descending) — quem está mais tempo parado na modalidade vem primeiro
        const wa = a.scoreData.weeksSinceLast ?? Number.MAX_SAFE_INTEGER;
        const wb = b.scoreData.weeksSinceLast ?? Number.MAX_SAFE_INTEGER;
        if (wb !== wa) return wb - wa;
        // 3) última participação em QUALQUER parte (ascending — data mais antiga primeiro = mais esquecido)
        const da = lastAnyDateByName.get(a.publisher.name) ?? '';
        const db = lastAnyDateByName.get(b.publisher.name) ?? '';
        if (da !== db) return da.localeCompare(db);
        // 4) menor número total de participações na janela (ascending)
        const ca = totalCountByName.get(a.publisher.name) ?? 0;
        const cb = totalCountByName.get(b.publisher.name) ?? 0;
        if (ca !== cb) return ca - cb;
        // 5) fallback alfabético (estável)
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
    // Limiar atualizado: penalidade = 50/participação → 2 participações = 100
    let narrative = "";
    if (details.frequencyPenalty > 100) {
        narrative = `${firstName} participou bastante nos últimos 3 meses — participação recente pesa mais no cálculo do que a vantagem de ter participado poucas vezes; a prioridade cai de forma mais acentuada.`;
    } else if (details.frequencyPenalty > 0) {
        narrative = `${firstName} teve algumas participações recentes, o que foi levado em conta no cálculo.`;
    } else {
        narrative = `${firstName} está com a agenda tranquila — sem participações recentes que reduzam a prioridade.`;
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
