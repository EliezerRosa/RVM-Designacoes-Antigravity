import { EnumFuncao, EnumModalidade, type HistoryRecord, type Publisher, type WorkbookPart } from '../types';
import { getModalidadeFromTipo } from '../constants/mappings';
import { getBlockInfo, isBlocked, type CooldownInfo } from './cooldownService';
import { buildEligibilityContext, checkEligibility, getCompatiblePartTypes, isElderOrMS } from './eligibilityService';
import { calculateScore, getMostRecentFSMRole, getRankedCandidates, getRotationConfig, type RotationScore, wasRecentlyPairedWith, calculateSectionDebt, isFSMHistoryRecord } from './unifiedRotationService';

export interface RankedEligibleCandidate {
    publisher: Publisher;
    eligible: boolean;
    reason?: string;
    score: number;
    scoreData: RotationScore;
    blocked: boolean;
    cooldownInfo: CooldownInfo | null;
    inOtherPartSameWeek?: string;
    isSisterForDemo: boolean;
    lastAnyDate: string;
    priorityBucket: number;
    /** Gate duro Camada 1: já fez ESTA mesma parte na janela ±radius (simétrico). Bloqueia, com fallback de relaxamento. */
    samePartBlocked: boolean;
    /** Data (ISO) da ocorrência mais próxima da mesma parte na janela (para exibição). */
    samePartConflictDate?: string;
    /** Soft Gate: possui outras partes elegíveis na mesma seção que AINDA NÃO realizou desde a última vez em targetPart. */
    sectionBlocked?: boolean;
    /** Quantidade de outras partes elegíveis pendentes na mesma seção. */
    sectionDebt?: number;
    /** Lista das partes elegíveis da seção pendentes de realização. */
    unperformedSectionParts?: string[];
}

export interface RankedEligibleOptions {
    currentPresident?: string;
    excludeAssignedInSameWeek?: boolean;
    applyEngineRules?: boolean;
}

export interface RankedEligibleResult {
    allCandidates: RankedEligibleCandidate[];
    eligibleCandidates: RankedEligibleCandidate[];
    currentPresident?: string;
    inWeekMap: Map<string, string>;
    scoringPartType: string;
    historyForScoring: HistoryRecord[];
    referenceDate: Date;
}

function toReferenceDate(part: WorkbookPart): Date {
    if (!part.date) return new Date();
    if (part.date.includes('T')) return new Date(part.date);
    return new Date(part.date + 'T12:00:00');
}

function normalizePartType(value: string): string {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function resolveScoringPartType(targetPart: WorkbookPart, modalidade: string): string {
    const compatible = getCompatiblePartTypes(modalidade as never);
    if (compatible.length === 0) return targetPart.tipoParte;

    const targetNorm = normalizePartType(targetPart.tipoParte);
    const directMatch = compatible.find(partType => {
        const compatibleNorm = normalizePartType(partType);
        return compatibleNorm === targetNorm
            || compatibleNorm.includes(targetNorm)
            || targetNorm.includes(compatibleNorm);
    });

    return directMatch || compatible[0] || targetPart.tipoParte;
}

function buildInWeekMap(targetPart: WorkbookPart, allWeekParts: WorkbookPart[]): Map<string, string> {
    const inWeekMap = new Map<string, string>();

    for (const weekPart of allWeekParts) {
        if (weekPart.id === targetPart.id) continue;
        if (weekPart.weekId !== targetPart.weekId) continue;
        if (weekPart.status === 'CANCELADA') continue;

        const assignedName = weekPart.resolvedPublisherName || weekPart.rawPublisherName;
        if (!assignedName || inWeekMap.has(assignedName)) continue;

        inWeekMap.set(assignedName, weekPart.tituloParte || weekPart.tipoParte);
    }

    return inWeekMap;
}

function resolveCurrentPresident(allWeekParts: WorkbookPart[], fallback?: string): string | undefined {
    if (fallback) return fallback;

    return allWeekParts.find(part =>
        part.funcao === 'Titular'
        && normalizePartType(part.tipoParte).includes('presidente')
        && !!(part.resolvedPublisherName || part.rawPublisherName)
    )?.resolvedPublisherName || allWeekParts.find(part =>
        part.funcao === 'Titular'
        && normalizePartType(part.tipoParte).includes('presidente')
        && !!(part.resolvedPublisherName || part.rawPublisherName)
    )?.rawPublisherName;
}

function isFinalPrayerPart(targetPart: WorkbookPart, modalidade: string): boolean {
    return modalidade === EnumModalidade.ORACAO && normalizePartType(targetPart.tipoParte).includes('oracao final');
}

function isFSMTitularPart(targetPart: WorkbookPart, modalidade: string): boolean {
    return targetPart.funcao === EnumFuncao.TITULAR
        && [EnumModalidade.LEITURA_ESTUDANTE, EnumModalidade.DEMONSTRACAO, EnumModalidade.DISCURSO_ESTUDANTE].includes(modalidade as never);
}

function resolveTitularName(targetPart: WorkbookPart, allWeekParts: WorkbookPart[], publishers: Publisher[], titularPublisherId?: string): string | undefined {
    if (titularPublisherId) {
        return publishers.find(publisher => publisher.id === titularPublisherId)?.name;
    }

    const sameSlotTitular = allWeekParts.find(part =>
        part.weekId === targetPart.weekId
        && part.id !== targetPart.id
        && part.seq === targetPart.seq
        && part.funcao === 'Titular'
    ) || allWeekParts.find(part =>
        part.weekId === targetPart.weekId
        && part.id !== targetPart.id
        && part.tipoParte === targetPart.tipoParte
        && part.funcao === 'Titular'
    );

    return sameSlotTitular?.resolvedPublisherName || sameSlotTitular?.rawPublisherName;
}

/**
 * Mapeia os tipos de parte elegíveis de uma seção para determinação de sectionDebt
 */
function getEligibleSectionPartTypes(section: string, publisher: Publisher): string[] {
    const secLower = (section || '').toLowerCase();

    if (secLower.includes('tesouros')) {
        const parts = ['Discurso Tesouros', 'Joias Espirituais', 'Leitura da Bíblia'];
        return parts.filter(p => checkEligibility(publisher, getModalidadeFromTipo(p, section) as never, EnumFuncao.TITULAR).eligible);
    }

    if (secLower.includes('vida cristã') || secLower.includes('vida crista')) {
        const parts = ['Parte Vida Cristã', 'Dirigente EBC', 'Leitor EBC'];
        return parts.filter(p => checkEligibility(publisher, getModalidadeFromTipo(p, section) as never, EnumFuncao.TITULAR).eligible);
    }

    return [];
}

/**
 * Avalia se Ancião/SM qualifica para Bucket 1 FSM devido a seca + cobertura prévia em Tesouros E Vida Cristã
 */
function checkElderMSFSMPromotion(
    publisher: Publisher,
    history: HistoryRecord[],
    referenceDate: Date,
    config: ReturnType<typeof getRotationConfig>
): { promoted: boolean; consecutiveWeeksInB1: number } {
    if (!isElderOrMS(publisher)) return { promoted: false, consecutiveWeeksInB1: 0 };

    const isElder = publisher.condition === 'Ancião' || publisher.condition === 'Anciao';
    const droughtWeeks = isElder ? config.FSM_ELDER_DROUGHT_WEEKS : config.FSM_MS_DROUGHT_WEEKS;

    if (droughtWeeks <= 0) return { promoted: false, consecutiveWeeksInB1: 0 };

    const refDateStr = referenceDate.toISOString().split('T')[0];
    const cutoffDate = new Date(referenceDate);
    cutoffDate.setDate(cutoffDate.getDate() - (droughtWeeks * 7));
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    // 1. Não realizou parte FSM como Titular nos últimos droughtWeeks
    const recentFsmAsTitular = history.find(h => {
        const matches = h.resolvedPublisherId ? h.resolvedPublisherId === publisher.id : (h.resolvedPublisherName === publisher.name || h.rawPublisherName === publisher.name);
        if (!matches) return false;
        if (h.funcao === 'Ajudante') return false;
        const d = h.date || '';
        if (d >= refDateStr || d < cutoffStr) return false;
        return isFSMHistoryRecord(h);
    });

    if (recentFsmAsTitular) return { promoted: false, consecutiveWeeksInB1: 0 };

    // 2. Teve cobertura prévia em Tesouros E Vida Cristã dentro da janela de droughtWeeks
    let hasTreasures = false;
    let hasLife = false;

    history.forEach(h => {
        const matches = h.resolvedPublisherId ? h.resolvedPublisherId === publisher.id : (h.resolvedPublisherName === publisher.name || h.rawPublisherName === publisher.name);
        if (!matches) return;
        const d = h.date || '';
        if (d >= refDateStr || d < cutoffStr) return;

        const sec = (h.section || '').toLowerCase();
        const tipo = (h.tipoParte || '').toLowerCase();

        if (sec.includes('tesouros') || tipo.includes('discurso') || tipo.includes('joias') || tipo.includes('leitura')) {
            hasTreasures = true;
        }
        if (sec.includes('vida') || tipo.includes('dirigente') || tipo.includes('leitor') || tipo.includes('vida cristã')) {
            hasLife = true;
        }
    });

    if (!hasTreasures || !hasLife) {
        return { promoted: false, consecutiveWeeksInB1: 0 };
    }

    // 3. Estimar semanas consecutivas sem designação após entrar em seca
    // Se a última participação FSM foi a mais de (droughtWeeks + X) semanas, X é o tempo em seca
    let weeksSinceLastFsm = droughtWeeks + 4;
    const lastFsmAnyDate = history
        .filter(h => {
            const matches = h.resolvedPublisherId ? h.resolvedPublisherId === publisher.id : (h.resolvedPublisherName === publisher.name || h.rawPublisherName === publisher.name);
            return matches && h.funcao !== 'Ajudante' && isFSMHistoryRecord(h) && (h.date || '') < refDateStr;
        })
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]?.date;

    if (lastFsmAnyDate) {
        const diffMs = referenceDate.getTime() - new Date(lastFsmAnyDate + 'T12:00:00').getTime();
        weeksSinceLastFsm = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
    }

    const consecutiveWeeksInB1 = Math.max(0, weeksSinceLastFsm - droughtWeeks);

    return { promoted: true, consecutiveWeeksInB1 };
}

function computePriorityBucket(
    targetPart: WorkbookPart,
    modalidade: string,
    publisher: Publisher,
    inOtherPartSameWeek: string | undefined,
    currentPresident: string | undefined,
    applyEngineRules: boolean,
    history: HistoryRecord[] = [],
    referenceDate: Date = new Date(),
    config: ReturnType<typeof getRotationConfig> = getRotationConfig()
): number {
    if (!applyEngineRules) return 1;

    if (isFinalPrayerPart(targetPart, modalidade)) {
        if (!inOtherPartSameWeek && publisher.name !== currentPresident) return 1;
        if (inOtherPartSameWeek && publisher.name !== currentPresident) return 2;
        if (publisher.name === currentPresident) return 3;
    }

    if (targetPart.funcao === EnumFuncao.TITULAR && modalidade === EnumModalidade.LEITOR_EBC) {
        if (!isElderOrMS(publisher)) return 1;
        if (publisher.condition === 'Servo Ministerial') return 2;
        return 3;
    }

    if (targetPart.funcao === EnumFuncao.TITULAR && modalidade === EnumModalidade.DEMONSTRACAO) {
        if (publisher.gender === 'sister') return 1;

        // Promoção Elder/SM para Bucket 1 FSM se qualificado por Seca + Cobertura
        const { promoted } = checkElderMSFSMPromotion(publisher, history, referenceDate, config);
        if (promoted) return 1;

        if (publisher.gender === 'brother' && !isElderOrMS(publisher)) return 2;
        if (publisher.condition === 'Servo Ministerial') return 3;
        return 4;
    }

    return 1;
}

export function getRankedEligibleForPart(
    targetPart: WorkbookPart,
    allWeekParts: WorkbookPart[],
    publishers: Publisher[],
    history: HistoryRecord[],
    options: RankedEligibleOptions = {},
): RankedEligibleResult {
    const modalidade = targetPart.modalidade || getModalidadeFromTipo(targetPart.tipoParte, targetPart.section);
    const funcao = targetPart.funcao === 'Ajudante' ? EnumFuncao.AJUDANTE : EnumFuncao.TITULAR;
    const applyEngineRules = options.applyEngineRules ?? true;
    const eligibilityContext = buildEligibilityContext(targetPart, allWeekParts, publishers);
    eligibilityContext.ignoreTextualConstraints = !applyEngineRules;
    const referenceDate = toReferenceDate(targetPart);
    const historyForScoring = history.filter(record => record.weekId !== targetPart.weekId);
    const currentPresident = resolveCurrentPresident(allWeekParts, options.currentPresident);
    const scoringPartType = resolveScoringPartType(targetPart, modalidade);
    const inWeekMap = buildInWeekMap(targetPart, allWeekParts);
    const excludeAssignedInSameWeek = options.excludeAssignedInSameWeek ?? true;

    const config = getRotationConfig();
    const titularNameResolved = resolveTitularName(targetPart, allWeekParts, publishers, eligibilityContext.titularPublisherId);

    const precomputedCandidates = publishers.map((publisher): RankedEligibleCandidate => {
        let eligibility = checkEligibility(
            publisher,
            modalidade as Parameters<typeof checkEligibility>[1],
            funcao,
            eligibilityContext,
        );

        const inOtherPartSameWeek = inWeekMap.get(publisher.name);
        const allowsSecondAssignment = isFinalPrayerPart(targetPart, modalidade) || excludeAssignedInSameWeek === false;

        if (eligibility.eligible && inOtherPartSameWeek && !allowsSecondAssignment) {
            eligibility = { eligible: false, reason: 'Já tem designação nesta semana' };
        }

        if (eligibility.eligible && applyEngineRules && isFSMTitularPart(targetPart, modalidade)) {
            const alternWeeks = config.ROLE_ALTERNATION_WINDOW_WEEKS ?? 0;
            if (alternWeeks > 0) {
                const lastRole = getMostRecentFSMRole(publisher.name, historyForScoring, referenceDate, alternWeeks);
                if (lastRole === 'Titular') {
                    eligibility = { eligible: false, reason: 'Motor: alternância FSM bloqueia novo Titular nesta janela' };
                }
            }
        }

        if (eligibility.eligible && applyEngineRules && funcao === EnumFuncao.AJUDANTE) {
            const alternWeeks = config.ROLE_ALTERNATION_WINDOW_WEEKS ?? 0;
            if (alternWeeks > 0 && !publisher.isHelperOnly) {
                const lastRole = getMostRecentFSMRole(publisher.name, historyForScoring, referenceDate, alternWeeks);
                if (lastRole === 'Ajudante') {
                    eligibility = { eligible: false, reason: 'Motor: alternância FSM bloqueia novo Ajudante nesta janela' };
                }
            }

            const pairWeeks = config.PAIR_REPETITION_WINDOW_WEEKS ?? 0;
            if (eligibility.eligible && pairWeeks > 0 && titularNameResolved && eligibilityContext.titularPublisherId) {
                const isSpouseBypass = !!eligibilityContext.titularSpouseId && publisher.id === eligibilityContext.titularSpouseId;
                const isParentChildBypass = (eligibilityContext.titularParentIds || []).includes(publisher.id)
                    || (eligibilityContext.titularChildIds || []).includes(publisher.id)
                    || (publisher.parentIds || []).includes(eligibilityContext.titularPublisherId);

                if (!isSpouseBypass && !isParentChildBypass && wasRecentlyPairedWith(publisher.name, titularNameResolved, historyForScoring, referenceDate, pairWeeks)) {
                    eligibility = { eligible: false, reason: 'Motor: par recente com o titular nesta janela' };
                }
            }
        }

        let scoreData = calculateScore(publisher, scoringPartType, historyForScoring, referenceDate, currentPresident);

        // Escalação suave FSM se em B1 a ≥4 semanas sem designação
        if (applyEngineRules && modalidade === EnumModalidade.DEMONSTRACAO && funcao === EnumFuncao.TITULAR && isElderOrMS(publisher)) {
            const { promoted, consecutiveWeeksInB1 } = checkElderMSFSMPromotion(publisher, historyForScoring, referenceDate, config);
            if (promoted && consecutiveWeeksInB1 >= config.FSM_ESCALATION_THRESHOLD_WEEKS) {
                // Remove efeito do SISTER_DEMO_PRIORITY das irmãs no score relativo concedendo bônus compensatório
                scoreData.score += config.SISTER_DEMO_PRIORITY;
                scoreData.details.specificAdjustments.push(`Escalação FSM Elder/SM (${consecutiveWeeksInB1} sem em B1)`);
            }
        }

        const blocked = isBlocked(publisher.name, historyForScoring, referenceDate, publisher.id);
        const cooldownInfo = getBlockInfo(publisher.name, historyForScoring, referenceDate, publisher.id);
        const lastAnyDate = historyForScoring
            .filter(record => (record.resolvedPublisherId ? record.resolvedPublisherId === publisher.id : (record.resolvedPublisherName === publisher.name || record.rawPublisherName === publisher.name)) && !!record.date)
            .map(record => record.date)
            .filter(Boolean)
            .sort()
            .pop() || '';

        // Cálculo do Soft Gate Intra-Seção (sectionDebt / sectionBlocked)
        let sectionDebt = 0;
        let unperformedSectionParts: string[] = [];
        let sectionBlocked = false;

        if (applyEngineRules && config.ENABLE_SECTION_ROTATION_GATE && targetPart.section) {
            const eligiblePartsForSection = getEligibleSectionPartTypes(targetPart.section, publisher);
            const debtRes = calculateSectionDebt(publisher, targetPart, historyForScoring, referenceDate, eligiblePartsForSection);

            sectionDebt = debtRes.sectionDebt;
            unperformedSectionParts = debtRes.unperformedParts;
            sectionBlocked = sectionDebt > 0;
        }

        return {
            publisher,
            eligible: eligibility.eligible,
            reason: eligibility.reason,
            score: scoreData.score,
            scoreData,
            blocked,
            cooldownInfo,
            inOtherPartSameWeek,
            isSisterForDemo: modalidade === EnumModalidade.DEMONSTRACAO && funcao === EnumFuncao.TITULAR && publisher.gender === 'sister',
            lastAnyDate,
            priorityBucket: computePriorityBucket(targetPart, modalidade, publisher, inOtherPartSameWeek, currentPresident, applyEngineRules, historyForScoring, referenceDate, config),
            samePartBlocked: !!scoreData.details.samePartConflict,
            samePartConflictDate: scoreData.details.samePartConflictDate || undefined,
            sectionBlocked,
            sectionDebt,
            unperformedSectionParts,
        };
    });

    // Monta o ranking lexicográfico (por priorityBucket) sobre um subconjunto elegível.
    const buildRankedMap = (gate: (candidate: RankedEligibleCandidate) => boolean): Map<string, RankedEligibleCandidate> => {
        const map = new Map<string, RankedEligibleCandidate>();
        const pool = precomputedCandidates.filter(candidate => candidate.eligible && gate(candidate));
        const orderedBuckets = [...new Set(pool.map(candidate => candidate.priorityBucket))].sort((a, b) => a - b);
        for (const bucket of orderedBuckets) {
            const publishersInBucket = pool
                .filter(candidate => candidate.priorityBucket === bucket)
                .map(candidate => candidate.publisher);
            const rankedBucket = getRankedCandidates(publishersInBucket, scoringPartType, historyForScoring, currentPresident, referenceDate);
            for (const rankedCandidate of rankedBucket) {
                const precomputed = precomputedCandidates.find(candidate => candidate.publisher.id === rankedCandidate.publisher.id);
                if (precomputed) map.set(precomputed.publisher.id, precomputed);
            }
        }
        return map;
    };

    // GATE DURO (Camada 1) — NÃO REPETIR a MESMA parte na janela de proximidade (±radius, simétrico).
    // SOFT GATE — ROTAÇÃO INTRA-SEÇÃO (`sectionBlocked`): evita repetir a mesma parte se deve outras da seção.
    // FALLBACK duplo de relaxamento:
    // 1. Tenta passar com hardSamePartGate + sectionGate
    // 2. Se esvaziar, tenta apenas hardSamePartGate
    // 3. Se esvaziar, aceita todos (sem gates) para nunca deixar a parte desamparada.
    const hardSamePartGate = (candidate: RankedEligibleCandidate) => !(applyEngineRules && candidate.samePartBlocked);
    const sectionGate = (candidate: RankedEligibleCandidate) => !(applyEngineRules && config.ENABLE_SECTION_ROTATION_GATE && candidate.sectionBlocked);

    let rankedById = buildRankedMap(c => hardSamePartGate(c) && sectionGate(c));
    if (rankedById.size === 0) {
        rankedById = buildRankedMap(hardSamePartGate);
    }
    if (rankedById.size === 0) {
        rankedById = buildRankedMap(() => true);
    }

    const eligibleCandidates = [...rankedById.values()];
    const ineligibleCandidates = precomputedCandidates
        .filter(candidate => !candidate.eligible)
        .sort((a, b) => a.publisher.name.localeCompare(b.publisher.name));

    return {
        allCandidates: [...eligibleCandidates, ...ineligibleCandidates],
        eligibleCandidates,
        currentPresident,
        inWeekMap,
        scoringPartType,
        historyForScoring,
        referenceDate,
    };
}