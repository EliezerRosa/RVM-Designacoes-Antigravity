import { EnumFuncao, EnumModalidade, type HistoryRecord, type Publisher, type WorkbookPart } from '../types';
import { getModalidadeFromTipo } from '../constants/mappings';
import { getBlockInfo, isBlocked, type CooldownInfo } from './cooldownService';
import { buildEligibilityContext, checkEligibility, getCompatiblePartTypes, isElderOrMS } from './eligibilityService';
import { calculateScore, getMostRecentFSMRole, getRankedCandidates, getRotationConfig, type RotationScore, wasRecentlyPairedWith } from './unifiedRotationService';

export interface RankedEligibleCandidate {
    publisher: Publisher;
    eligible: boolean;
    reason?: string;
    score: number;
    scoreData: RotationScore;
    blocked: boolean;
    cooldownInfo: CooldownInfo;
    inOtherPartSameWeek?: string;
    isSisterForDemo: boolean;
    lastAnyDate: string;
    priorityBucket: number;
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

function computePriorityBucket(
    targetPart: WorkbookPart,
    modalidade: string,
    publisher: Publisher,
    inOtherPartSameWeek: string | undefined,
    currentPresident: string | undefined,
    applyEngineRules: boolean,
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
    const eligibilityContext = buildEligibilityContext(targetPart, allWeekParts, publishers);
    const referenceDate = toReferenceDate(targetPart);
    const historyForScoring = history.filter(record => record.weekId !== targetPart.weekId);
    const currentPresident = resolveCurrentPresident(allWeekParts, options.currentPresident);
    const scoringPartType = resolveScoringPartType(targetPart, modalidade);
    const inWeekMap = buildInWeekMap(targetPart, allWeekParts);
    const applyEngineRules = options.applyEngineRules ?? true;
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

        const scoreData = calculateScore(publisher, scoringPartType, historyForScoring, referenceDate, currentPresident);
        const blocked = isBlocked(publisher.name, historyForScoring, referenceDate, publisher.id);
        const cooldownInfo = getBlockInfo(publisher.name, historyForScoring, referenceDate, publisher.id);
        const lastAnyDate = historyForScoring
            .filter(record => (record.resolvedPublisherId ? record.resolvedPublisherId === publisher.id : (record.resolvedPublisherName === publisher.name || record.rawPublisherName === publisher.name)) && !!record.date)
            .map(record => record.date)
            .filter(Boolean)
            .sort()
            .pop() || '';

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
            priorityBucket: computePriorityBucket(targetPart, modalidade, publisher, inOtherPartSameWeek, currentPresident, applyEngineRules),
        };
    });

    const rankedById = new Map<string, RankedEligibleCandidate>();
    const buckets = [...new Set(precomputedCandidates.filter(candidate => candidate.eligible).map(candidate => candidate.priorityBucket))].sort((a, b) => a - b);

    for (const bucket of buckets) {
        const publishersInBucket = precomputedCandidates
            .filter(candidate => candidate.eligible && candidate.priorityBucket === bucket)
            .map(candidate => candidate.publisher);

        const rankedBucket = getRankedCandidates(publishersInBucket, scoringPartType, historyForScoring, currentPresident, referenceDate);
        for (const rankedCandidate of rankedBucket) {
            const precomputed = precomputedCandidates.find(candidate => candidate.publisher.id === rankedCandidate.publisher.id);
            if (precomputed) rankedById.set(precomputed.publisher.id, precomputed);
        }
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