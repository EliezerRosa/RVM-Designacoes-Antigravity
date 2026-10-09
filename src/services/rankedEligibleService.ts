import { EnumFuncao, EnumModalidade, type HistoryRecord, type Publisher, type WorkbookPart } from '../types';
import { getModalidadeFromTipo } from '../constants/mappings';
import { getBlockInfo, isBlocked, type CooldownInfo } from './cooldownService';
import { buildEligibilityContext, checkEligibility, getCompatiblePartTypes, isElderOrMS } from './eligibilityService';
import { calculateScore, getMostRecentFSMRole, getRankedCandidates, getRotationConfig, type RotationScore, wasRecentlyPairedWith, calculateSectionDebt, isFSMHistoryRecord } from './unifiedRotationService';

export interface RankedEligibleCandidate {
    publisher: Publisher;
    eligible: boolean;
    reason?: string;
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
    /** Gate do motor Q2/Q3 (alternância FSM / par recente): relaxável em último caso; motivo para exibição. */
    engineGateReason?: string;
}

export interface RankedEligibleOptions {
    currentPresident?: string;
    excludeAssignedInSameWeek?: boolean;
    applyEngineRules?: boolean;
    excludedPublisherNames?: string[];
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
 * Mapeia os tipos de parte elegíveis de uma seção para determinação de sectionDebt.
 * Só partes da MESMA CLASSE (ensino): Leitura da Bíblia e Leitor EBC ficam fora —
 * incluí-las tornava anciãos perpetuamente `sectionBlocked` (caso Israel Vieira, 2026-10-08).
 */
function getEligibleSectionPartTypes(section: string, publisher: Publisher): string[] {
    const secLower = (section || '').toLowerCase();

    if (secLower.includes('tesouros')) {
        const parts = ['Discurso Tesouros', 'Joias Espirituais'];
        return parts.filter(p => checkEligibility(publisher, getModalidadeFromTipo(p, section) as never, EnumFuncao.TITULAR).eligible);
    }

    if (secLower.includes('vida cristã') || secLower.includes('vida crista')) {
        const parts = ['Parte Vida Cristã', 'Dirigente EBC'];
        return parts.filter(p => checkEligibility(publisher, getModalidadeFromTipo(p, section) as never, EnumFuncao.TITULAR).eligible);
    }

    return [];
}

function isRecordOf(h: HistoryRecord, publisher: Publisher): boolean {
    return h.resolvedPublisherId
        ? h.resolvedPublisherId === publisher.id
        : (h.resolvedPublisherName === publisher.name || h.rawPublisherName === publisher.name);
}

/** Registros do publicador dentro de ±windowWeeks da data de referência (passado e futuro; a semana-alvo já foi removida do histórico). */
function recordsInSymmetricWindow(publisher: Publisher, history: HistoryRecord[], referenceDate: Date, windowWeeks: number): HistoryRecord[] {
    const refMs = referenceDate.getTime();
    const winMs = windowWeeks * 7 * 24 * 60 * 60 * 1000;
    return history.filter(h => {
        if (!isRecordOf(h, publisher) || !h.date) return false;
        const d = new Date(h.date + 'T12:00:00').getTime();
        return Math.abs(d - refMs) <= winMs;
    });
}

/**
 * Fila cíclica de presidência (decisão Eliezer 2026-10-09): nº de presidências na janela ±PRESIDENCY_CYCLE_WINDOW_WEEKS.
 * Usado como bucket → quem presidiu menos vem antes; ninguém recebe a (k+1)-ésima enquanto houver elegível com k.
 */
export function countPresidenciesInCycle(publisher: Publisher, history: HistoryRecord[], referenceDate: Date, windowWeeks: number): number {
    return recordsInSymmetricWindow(publisher, history, referenceDate, windowWeeks)
        .filter(h => h.funcao !== 'Ajudante' && normalizePartType(h.tipoParte).includes('presidente'))
        .length;
}

/**
 * Garantia de parte de estudante (decisão Eliezer 2026-10-09): ancião/SM sem NENHUMA parte FSM
 * (titular ou ajudante) em ±STUDENT_PART_GUARANTEE_WEEKS está "em seca" → bucket 0 nas modalidades de estudante.
 */
export function isElderOrMSInStudentDrought(publisher: Publisher, history: HistoryRecord[], referenceDate: Date, windowWeeks: number): boolean {
    if (!isElderOrMS(publisher) || windowWeeks <= 0) return false;
    return !recordsInSymmetricWindow(publisher, history, referenceDate, windowWeeks).some(isFSMHistoryRecord);
}

const STUDENT_MODALITIES: string[] = [EnumModalidade.LEITURA_ESTUDANTE, EnumModalidade.DEMONSTRACAO, EnumModalidade.DISCURSO_ESTUDANTE];

/** Titulares ancião/SM já em partes de estudante nesta semana (para o teto semanal da garantia). */
function countElderMSStudentTitularsInWeek(targetPart: WorkbookPart, allWeekParts: WorkbookPart[], publishers: Publisher[]): number {
    return allWeekParts.filter(p => {
        if (p.id === targetPart.id || p.weekId !== targetPart.weekId || p.status === 'CANCELADA' || p.funcao !== 'Titular') return false;
        const mod = p.modalidade || getModalidadeFromTipo(p.tipoParte, p.section);
        if (!STUDENT_MODALITIES.includes(mod)) return false;
        const pub = publishers.find(x => (p.resolvedPublisherId && x.id === p.resolvedPublisherId) || (!!p.resolvedPublisherName && x.name === p.resolvedPublisherName));
        return !!pub && isElderOrMS(pub);
    }).length;
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
    config: ReturnType<typeof getRotationConfig> = getRotationConfig(),
    droughtPromotionOpen = true,
): number {
    if (!applyEngineRules) return 1;

    if (isFinalPrayerPart(targetPart, modalidade)) {
        if (!inOtherPartSameWeek && publisher.name !== currentPresident) return 1;
        if (inOtherPartSameWeek && publisher.name !== currentPresident) return 2;
        if (publisher.name === currentPresident) return 3;
    }

    if (targetPart.funcao === EnumFuncao.TITULAR && modalidade === EnumModalidade.PRESIDENCIA) {
        return countPresidenciesInCycle(publisher, history, referenceDate, config.PRESIDENCY_CYCLE_WINDOW_WEEKS ?? 52);
    }

    if (targetPart.funcao === EnumFuncao.TITULAR && modalidade === EnumModalidade.LEITOR_EBC) {
        if (!isElderOrMS(publisher)) return 1;
        if (publisher.condition === 'Servo Ministerial') return 2;
        return 3;
    }

    if (targetPart.funcao === EnumFuncao.TITULAR && STUDENT_MODALITIES.includes(modalidade)) {
        if (droughtPromotionOpen && isElderOrMSInStudentDrought(publisher, history, referenceDate, config.STUDENT_PART_GUARANTEE_WEEKS ?? 13)) return 0;
        if (modalidade === EnumModalidade.DEMONSTRACAO && publisher.gender === 'sister') return 1;
        if (!isElderOrMS(publisher)) return modalidade === EnumModalidade.DEMONSTRACAO ? 2 : 1;
        if (publisher.condition === 'Servo Ministerial') return modalidade === EnumModalidade.DEMONSTRACAO ? 3 : 2;
        return modalidade === EnumModalidade.DEMONSTRACAO ? 4 : 3;
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
    const droughtPromotionOpen = countElderMSStudentTitularsInWeek(targetPart, allWeekParts, publishers) < (config.STUDENT_GUARANTEE_MAX_PER_WEEK ?? 2);

    const precomputedCandidates = publishers.map((publisher): RankedEligibleCandidate => {
        let eligibility = checkEligibility(
            publisher,
            modalidade as Parameters<typeof checkEligibility>[1],
            funcao,
            eligibilityContext,
        );

        if (eligibility.eligible && options.excludedPublisherNames?.includes(publisher.name)) {
            eligibility = { eligible: false, reason: 'Recusou esta parte recentemente (Memória de Recusa)' };
        }

        const inOtherPartSameWeek = inWeekMap.get(publisher.name);
        const allowsSecondAssignment = isFinalPrayerPart(targetPart, modalidade) || excludeAssignedInSameWeek === false;

        if (eligibility.eligible && inOtherPartSameWeek && !allowsSecondAssignment) {
            eligibility = { eligible: false, reason: 'Já tem designação nesta semana' };
        }

        // Q2/Q3: gates do motor relaxáveis em último caso (4º estágio) — não tornam o candidato inelegível.
        let engineGateReason: string | undefined;

        if (eligibility.eligible && applyEngineRules && isFSMTitularPart(targetPart, modalidade)) {
            const alternWeeks = config.ROLE_ALTERNATION_WINDOW_WEEKS ?? 0;
            if (alternWeeks > 0) {
                const lastRole = getMostRecentFSMRole(publisher.name, historyForScoring, referenceDate, alternWeeks);
                if (lastRole === 'Titular') {
                    engineGateReason = 'Motor: alternância FSM bloqueia novo Titular nesta janela';
                }
            }
        }

        if (eligibility.eligible && applyEngineRules && funcao === EnumFuncao.AJUDANTE) {
            const alternWeeks = config.ROLE_ALTERNATION_WINDOW_WEEKS ?? 0;
            if (alternWeeks > 0 && !publisher.isHelperOnly) {
                const lastRole = getMostRecentFSMRole(publisher.name, historyForScoring, referenceDate, alternWeeks);
                if (lastRole === 'Ajudante') {
                    engineGateReason = 'Motor: alternância FSM bloqueia novo Ajudante nesta janela';
                }
            }

            const pairWeeks = config.PAIR_REPETITION_WINDOW_WEEKS ?? 0;
            if (!engineGateReason && pairWeeks > 0 && titularNameResolved && eligibilityContext.titularPublisherId) {
                const isSpouseBypass = !!eligibilityContext.titularSpouseId && publisher.id === eligibilityContext.titularSpouseId;
                const isParentChildBypass = (eligibilityContext.titularParentIds || []).includes(publisher.id)
                    || (eligibilityContext.titularChildIds || []).includes(publisher.id)
                    || (publisher.parentIds || []).includes(eligibilityContext.titularPublisherId);

                if (!isSpouseBypass && !isParentChildBypass && wasRecentlyPairedWith(publisher.name, titularNameResolved, historyForScoring, referenceDate, pairWeeks)) {
                    engineGateReason = 'Motor: par recente com o titular nesta janela';
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
            scoreData,
            blocked,
            cooldownInfo,
            inOtherPartSameWeek,
            isSisterForDemo: modalidade === EnumModalidade.DEMONSTRACAO && funcao === EnumFuncao.TITULAR && publisher.gender === 'sister',
            lastAnyDate,
            priorityBucket: computePriorityBucket(targetPart, modalidade, publisher, inOtherPartSameWeek, currentPresident, applyEngineRules, historyForScoring, referenceDate, config, droughtPromotionOpen),
            samePartBlocked: !!scoreData.details.samePartConflict,
            samePartConflictDate: scoreData.details.samePartConflictDate || undefined,
            sectionBlocked,
            sectionDebt,
            unperformedSectionParts,
            engineGateReason,
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
    // GATES DO MOTOR Q2/Q3 (`engineGateReason`): alternância FSM e par recente.
    // Relaxamento em cascata para nunca deixar a parte desamparada:
    // 1. Q2/Q3 + mesma-parte + seção → 2. Q2/Q3 + mesma-parte → 3. só Q2/Q3 → 4. nenhum gate.
    const hardSamePartGate = (candidate: RankedEligibleCandidate) => !(applyEngineRules && candidate.samePartBlocked);
    const sectionGate = (candidate: RankedEligibleCandidate) => !(applyEngineRules && config.ENABLE_SECTION_ROTATION_GATE && candidate.sectionBlocked);
    const engineGate = (candidate: RankedEligibleCandidate) => !candidate.engineGateReason;

    let rankedById = buildRankedMap(c => engineGate(c) && hardSamePartGate(c) && sectionGate(c));
    if (rankedById.size === 0) {
        rankedById = buildRankedMap(c => engineGate(c) && hardSamePartGate(c));
    }
    if (rankedById.size === 0) {
        rankedById = buildRankedMap(engineGate);
    }
    if (rankedById.size === 0) {
        rankedById = buildRankedMap(() => true);
    }

    const eligibleCandidates = [...rankedById.values()];
    // Elegíveis barrados por gate (samePart/section) ficam visíveis em allCandidates com seus flags;
    // antes sumiam de ambas as listas e a UI não conseguia explicar a ausência.
    const gatedOutCandidates = precomputedCandidates
        .filter(candidate => candidate.eligible && !rankedById.has(candidate.publisher.id))
        .sort((a, b) => a.publisher.name.localeCompare(b.publisher.name));
    const ineligibleCandidates = precomputedCandidates
        .filter(candidate => !candidate.eligible)
        .sort((a, b) => a.publisher.name.localeCompare(b.publisher.name));

    return {
        allCandidates: [...eligibleCandidates, ...gatedOutCandidates, ...ineligibleCandidates],
        eligibleCandidates,
        currentPresident,
        inWeekMap,
        scoringPartType,
        historyForScoring,
        referenceDate,
    };
}