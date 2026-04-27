/**
 * Comparação de score entre TODOS os caminhos do app que perguntam:
 * "Qual o score de X para a parte Y na semana Z?"
 *
 * Cenário do print do usuário:
 *   - Semana: 2026-05-11
 *   - Parte: Presidente
 *   - Foco: Marcus Vinícius e Marcos Rogério
 *
 * Caminhos simulados (mirroring exato dos call sites):
 *   A. ActionControlPanel        (card "Controle & Explicações")
 *   B. agentActionService        (CHECK_SCORE — chat: "score de X")
 *   C. agentActionService        (EXPLAIN_PART — chat: "explique a parte")
 *   D. PublisherSelect           (dropdown manual de troca)
 *   E. generationService         (motor automático, L209)
 *   F. communicationService      (sugestão de substituto, L333)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateScore,
    getRankedCandidates,
} from './unifiedRotationService';
import type { Publisher, HistoryRecord } from '../types';

// ---------- Fixtures ----------
function mkPub(id: string, name: string): Publisher {
    return {
        id, name,
        gender: 'brother' as any,
        condition: 'Ancião' as any,
        funcao: 'Ancião' as any,
        phone: '',
        isBaptized: true,
        isServing: true,
        ageGroup: 'Adulto' as any,
        parentIds: [],
        isHelperOnly: false,
        canPairWithNonParent: true,
        privileges: {} as any,
        privilegesBySection: {} as any,
        availability: {} as any,
        aliases: [],
    };
}

function mkHist(name: string, date: string, weekId: string, tipoParte: string): HistoryRecord {
    return {
        id: `${name}-${date}-${tipoParte}`,
        weekId, weekDisplay: weekId, date,
        section: '', tipoParte, modalidade: tipoParte,
        tituloParte: tipoParte, descricaoParte: '', detalhesParte: '',
        seq: 1, funcao: 'Titular', duracao: 0, horaInicio: '', horaFim: '',
        rawPublisherName: name, resolvedPublisherName: name,
        status: 'approved' as any,
        importSource: 'Manual', importBatchId: 'sim',
        createdAt: '2026-01-01T00:00:00Z',
    };
}

const TARGET_WEEK = '2026-05-11';
const TARGET_DATE = new Date(TARGET_WEEK + 'T12:00:00');
const PART_TYPE = 'Presidente';

const marcusV = mkPub('p-marcus-v', 'Marcus Vinícius');
const marcosR = mkPub('p-marcos-r', 'Marcos Rogério');
const eliezer = mkPub('p-eliezer', 'Eliezer Rosa');
const candidates = [marcusV, marcosR, eliezer];

// História: ambos foram designados como Presidente na semana atual em momentos diferentes
// (loop). Marcus tem +participação recente (frequência alta). Marcos é mais "limpo".
const history: HistoryRecord[] = [
    // Designação atual (loop) — está no histórico porque foi salva
    mkHist('Marcus Vinícius', TARGET_WEEK, TARGET_WEEK, 'Presidente'),
    mkHist('Marcos Rogério',  TARGET_WEEK, TARGET_WEEK, 'Presidente'),
    // Marcus: alta frequência recente (penalidade)
    mkHist('Marcus Vinícius', '2026-04-13', '2026-04-13', 'Joias espirituais'),
    mkHist('Marcus Vinícius', '2026-03-30', '2026-03-30', 'Discurso'),
    mkHist('Marcus Vinícius', '2026-03-16', '2026-03-16', 'Joias espirituais'),
    // Última vez como Presidente — ambos há ~40 semanas
    mkHist('Marcus Vinícius', '2025-08-04', '2025-08-04', 'Presidente'),
    mkHist('Marcos Rogério',  '2025-08-11', '2025-08-11', 'Presidente'),
    // Eliezer
    mkHist('Eliezer Rosa',    '2025-10-06', '2025-10-06', 'Presidente'),
];

// ---------- Simuladores de cada caminho ----------

/** A. ActionControlPanel — após fix */
function pathA(focus: Publisher) {
    const historyForRanking = history.filter(h => h.weekId !== TARGET_WEEK);
    const ranked = getRankedCandidates(candidates, PART_TYPE, historyForRanking, undefined, TARGET_DATE);
    const r = ranked.find(x => x.publisher.id === focus.id)!;
    const direct = calculateScore(focus, PART_TYPE, historyForRanking, TARGET_DATE);
    return { listScore: r.scoreData.score, cardScore: direct.score, exp: direct.explanation };
}

/** B. agentActionService CHECK_SCORE — após fix */
function pathB(focus: Publisher) {
    const historyForScoring = history.filter(h => h.weekId !== TARGET_WEEK);
    const ranked = getRankedCandidates(candidates, PART_TYPE, historyForScoring, undefined, TARGET_DATE);
    const r = ranked.find(x => x.publisher.id === focus.id)!;
    return { score: r.scoreData.score, exp: r.scoreData.explanation };
}

/** C. agentActionService EXPLAIN_PART — após fix */
function pathC(focus: Publisher) {
    const historyForScoring = history.filter(h => h.weekId !== TARGET_WEEK);
    const ranked = getRankedCandidates(candidates, PART_TYPE, historyForScoring, undefined, TARGET_DATE);
    const r = ranked.find(x => x.publisher.id === focus.id)!;
    return { score: r.scoreData.score, exp: r.scoreData.explanation };
}

/** D. PublisherSelect (dropdown) — após fix: filtra weekId atual */
function pathD(focus: Publisher) {
    // Mesma chamada do PublisherSelect (após fix):
    //   calculateScore(p, part.tipoParte, historyRecords.filter(h => h.weekId !== part.weekId), referenceDate, currentPresident)
    const historyForCooldown = history.filter(h => h.weekId !== TARGET_WEEK);
    const score = calculateScore(focus, PART_TYPE, historyForCooldown, TARGET_DATE);
    return { score: score.score, exp: score.explanation };
}

/** E. generationService — após fix: filtra weekId + passa refDate */
function pathE(focus: Publisher) {
    const historyForRanking = history.filter(h => h.weekId !== TARGET_WEEK);
    const ranked = getRankedCandidates(candidates, PART_TYPE, historyForRanking, undefined, TARGET_DATE);
    const r = ranked.find(x => x.publisher.id === focus.id)!;
    return { score: r.scoreData.score, exp: r.scoreData.explanation };
}

/** F. communicationService — após fix: filtra weekId + passa refDate */
function pathF(focus: Publisher) {
    const historyForRanking = history.filter(h => h.weekId !== TARGET_WEEK);
    const ranked = getRankedCandidates(candidates, PART_TYPE, historyForRanking, undefined, TARGET_DATE);
    const r = ranked.find(x => x.publisher.id === focus.id)!;
    return { score: r.scoreData.score, exp: r.scoreData.explanation };
}

// ---------- Execução & Relatório ----------

function runForPublisher(p: Publisher) {
    return {
        A: pathA(p),
        B: pathB(p),
        C: pathC(p),
        D: pathD(p),
        E: pathE(p),
        F: pathF(p),
    };
}

const resMarcus = runForPublisher(marcusV);
const resMarcos = runForPublisher(marcosR);

function table(name: string, r: ReturnType<typeof runForPublisher>) {
    console.log(`\n=== ${name} ===`);
    console.log(`A. Card Detalhes              listScore=${r.A.listScore}  cardScore=${r.A.cardScore}`);
    console.log(`   └─ ${r.A.exp}`);
    console.log(`B. Agente CHECK_SCORE         score=${r.B.score}`);
    console.log(`   └─ ${r.B.exp}`);
    console.log(`C. Agente EXPLAIN_PART        score=${r.C.score}`);
    console.log(`   └─ ${r.C.exp}`);
    console.log(`D. Dropdown PublisherSelect   score=${r.D.score}`);
    console.log(`   └─ ${r.D.exp}`);
    console.log(`E. Motor Geração              score=${r.E.score}`);
    console.log(`   └─ ${r.E.exp}`);
    console.log(`F. Substituto (Comm)          score=${r.F.score}`);
    console.log(`   └─ ${r.F.exp}`);
}

test('SIMULAÇÃO: 6 caminhos do app, 2 publicadores, mesma semana/parte', () => {
    table('Marcus Vinícius', resMarcus);
    table('Marcos Rogério', resMarcos);
});

// ---------- Asserções: caminhos corrigidos devem convergir ----------

test('A/B/C convergem (todos pós-fix) para Marcus Vinícius', () => {
    assert.equal(resMarcus.A.listScore, resMarcus.A.cardScore, 'Card: lista vs designado');
    assert.equal(resMarcus.A.listScore, resMarcus.B.score, 'A vs B');
    assert.equal(resMarcus.B.score, resMarcus.C.score, 'B vs C');
});

test('A/B/C convergem (todos pós-fix) para Marcos Rogério', () => {
    assert.equal(resMarcos.A.listScore, resMarcos.A.cardScore);
    assert.equal(resMarcos.A.listScore, resMarcos.B.score);
    assert.equal(resMarcos.B.score, resMarcos.C.score);
});

test('CONVERGÊNCIA TOTAL pós-fix: TODOS os 6 caminhos retornam o mesmo score (Marcus)', () => {
    const ref = resMarcus.A.cardScore;
    assert.equal(resMarcus.A.listScore, ref, 'A list');
    assert.equal(resMarcus.B.score, ref, 'B agente CHECK_SCORE');
    assert.equal(resMarcus.C.score, ref, 'C agente EXPLAIN_PART');
    assert.equal(resMarcus.D.score, ref, 'D dropdown');
    assert.equal(resMarcus.E.score, ref, 'E motor de geração');
    assert.equal(resMarcus.F.score, ref, 'F sugestão de substituto');
});

test('CONVERGÊNCIA TOTAL pós-fix: TODOS os 6 caminhos retornam o mesmo score (Marcos)', () => {
    const ref = resMarcos.A.cardScore;
    assert.equal(resMarcos.A.listScore, ref);
    assert.equal(resMarcos.B.score, ref);
    assert.equal(resMarcos.C.score, ref);
    assert.equal(resMarcos.D.score, ref);
    assert.equal(resMarcos.E.score, ref);
    assert.equal(resMarcos.F.score, ref);
});

test('SANITY: scores corrigidos (A/B/C) refletem decomposição real, sem cooldown loop', () => {
    // Marcus: timeBonus alto + freq -60 (3 participações últimas 12 sem)
    assert.match(resMarcus.A.exp, /Tempo Exp: \+\d{3,4}/);
    assert.match(resMarcus.A.exp, /Freq: -60/);
    assert.doesNotMatch(resMarcus.A.exp, /Cooldown/, 'após filtrar a semana atual, cooldown não acende');
    // Marcos: timeBonus alto + freq 0 (sem participações recentes)
    assert.match(resMarcos.A.exp, /Freq: -0/);
    assert.doesNotMatch(resMarcos.A.exp, /Cooldown/);
});
