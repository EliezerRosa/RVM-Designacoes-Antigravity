import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateScore,
    getRankedCandidates,
} from './unifiedRotationService';
import type { Publisher, HistoryRecord } from '../types';

// ---------- Helpers ----------
function mkPub(id: string, name: string): Publisher {
    return {
        id,
        name,
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

function mkHist(opts: {
    name: string;
    date: string;            // YYYY-MM-DD
    weekId: string;          // YYYY-MM-DD (segunda-feira)
    tipoParte: string;
}): HistoryRecord {
    return {
        id: `${opts.name}-${opts.date}-${opts.tipoParte}`,
        weekId: opts.weekId,
        weekDisplay: opts.weekId,
        date: opts.date,
        section: '',
        tipoParte: opts.tipoParte,
        modalidade: opts.tipoParte,
        tituloParte: opts.tipoParte,
        descricaoParte: '',
        detalhesParte: '',
        seq: 1,
        funcao: 'Titular',
        duracao: 0,
        horaInicio: '',
        horaFim: '',
        rawPublisherName: opts.name,
        resolvedPublisherName: opts.name,
        status: 'approved' as any,
        importSource: 'Manual',
        importBatchId: 'test',
        createdAt: '2026-01-01T00:00:00Z',
    };
}

// ---------- Cenário do bug reportado (print do usuário) ----------
// Semana alvo: 2026-05-11 (Presidente)
// Marcus Vinícius é o designado e aparece em ambos: lista do Agente (1580) e card (3100/118).
// Reproduzimos: histórico geral suficiente para gerar penalty + uma participação como Presidente
// já gravada NA PRÓPRIA semana (loop de auto-influência).

const TARGET_WEEK = '2026-05-11';
const TARGET_DATE = new Date(TARGET_WEEK + 'T12:00:00');
const PART_TYPE = 'Presidente';

const marcus = mkPub('p-marcus', 'Marcus Vinícius');
const eliezer = mkPub('p-eliezer', 'Eliezer Rosa');
const emerson = mkPub('p-emerson', 'Emerson França');

// Histórico geral nos últimos 3 meses para Marcus (penalidade de frequência)
// + uma participação como "Presidente" cravada NA semana corrente (simula o loop)
const history: HistoryRecord[] = [
    // Semana corrente — designação do próprio Marcus como Presidente (loop)
    mkHist({ name: 'Marcus Vinícius', date: TARGET_WEEK, weekId: TARGET_WEEK, tipoParte: 'Presidente' }),
    // Frequência recente (últimas ~12 semanas) — não é Presidente, mas conta para freq
    mkHist({ name: 'Marcus Vinícius', date: '2026-04-13', weekId: '2026-04-13', tipoParte: 'Joias espirituais' }),
    mkHist({ name: 'Marcus Vinícius', date: '2026-03-30', weekId: '2026-03-30', tipoParte: 'Discurso' }),
    mkHist({ name: 'Marcus Vinícius', date: '2026-03-16', weekId: '2026-03-16', tipoParte: 'Joias espirituais' }),
    // Última vez como Presidente — bem antiga (gera timeBonus alto se não filtrar)
    mkHist({ name: 'Marcus Vinícius', date: '2025-08-04', weekId: '2025-08-04', tipoParte: 'Presidente' }),
    // Outros candidatos sem histórico recente (controle)
    mkHist({ name: 'Eliezer Rosa', date: '2025-10-06', weekId: '2025-10-06', tipoParte: 'Presidente' }),
    mkHist({ name: 'Emerson França', date: '2025-09-22', weekId: '2025-09-22', tipoParte: 'Presidente' }),
];

test('REPRO bug: sem filtrar a semana corrente, score do designado vira "loop" (timeBonus zera)', () => {
    // Caminho ANTIGO do agente: passava history completo + sem referenceDate
    // Aqui forçamos referenceDate igual à data da parte para isolar o efeito do filtro de histórico
    const scoreLoop = calculateScore(marcus, PART_TYPE, history, TARGET_DATE);
    // Como existe um registro de "Presidente" na própria TARGET_DATE, weeksSinceLast = 0
    assert.equal(scoreLoop.weeksSinceLast, 0, 'sem filtrar, weeksSinceLast vira 0 (loop)');
    assert.equal(scoreLoop.details.timeBonus, 0);
});

test('FIX: filtrando a semana corrente, weeksSinceLast e timeBonus refletem realidade', () => {
    const historyFiltered = history.filter(h => h.weekId !== TARGET_WEEK);
    const scoreFixed = calculateScore(marcus, PART_TYPE, historyFiltered, TARGET_DATE);
    // Última vez como Presidente foi 2025-08-04 → ~40 semanas antes de 2026-05-11
    assert.ok(scoreFixed.weeksSinceLast >= 35 && scoreFixed.weeksSinceLast <= 45,
        `esperado ~40 semanas, obtido ${scoreFixed.weeksSinceLast}`);
    assert.ok(scoreFixed.details.timeBonus > 1500, 'timeBonus deveria ser alto (~40^1.5*8)');
});

test('CONSISTÊNCIA: getRankedCandidates com referenceDate produz mesmo score que calculateScore direto', () => {
    const historyFiltered = history.filter(h => h.weekId !== TARGET_WEEK);
    const ranked = getRankedCandidates(
        [marcus, eliezer, emerson],
        PART_TYPE,
        historyFiltered,
        undefined,
        TARGET_DATE,
    );
    const direct = calculateScore(marcus, PART_TYPE, historyFiltered, TARGET_DATE);
    const rankedMarcus = ranked.find(r => r.publisher.id === marcus.id)!;
    assert.equal(rankedMarcus.scoreData.score, direct.score,
        'lista do agente DEVE bater com score do card de detalhes');
});

test('REGRESSÃO: getRankedCandidates SEM referenceDate (default = hoje) diverge do card', () => {
    // Simula o bug original: agente não passava referenceDate → calculateScore usava new Date()
    const rankedAgentOld = getRankedCandidates(
        [marcus, eliezer, emerson],
        PART_TYPE,
        history,           // SEM filtrar
        undefined,
        undefined,         // SEM referenceDate (= bug)
    );
    const cardScore = calculateScore(
        marcus,
        PART_TYPE,
        history.filter(h => h.weekId !== TARGET_WEEK),
        TARGET_DATE,
    );
    const agentMarcus = rankedAgentOld.find(r => r.publisher.id === marcus.id)!;
    assert.notEqual(agentMarcus.scoreData.score, cardScore.score,
        'reproduz a inconsistência observada no print (1580 vs 3100)');
});

test('CONSISTÊNCIA TOTAL após fix: agente e card produzem mesma decomposição para o designado', () => {
    const historyFiltered = history.filter(h => h.weekId !== TARGET_WEEK);
    const agentRanked = getRankedCandidates(
        [marcus, eliezer, emerson],
        PART_TYPE,
        historyFiltered,
        undefined,
        TARGET_DATE,
    );
    const cardScore = calculateScore(marcus, PART_TYPE, historyFiltered, TARGET_DATE);
    const agentMarcus = agentRanked.find(r => r.publisher.id === marcus.id)!;
    assert.equal(agentMarcus.scoreData.score, cardScore.score);
    assert.equal(agentMarcus.scoreData.explanation, cardScore.explanation);
    assert.equal(agentMarcus.scoreData.details.timeBonus, cardScore.details.timeBonus);
    assert.equal(agentMarcus.scoreData.details.frequencyPenalty, cardScore.details.frequencyPenalty);
});

// ---------- Gate duro: NÃO repetir a MESMA parte na janela de proximidade (±4 sem, simétrico) ----------

test('SAME-PART GATE: mesma parte 3 semanas ANTES dentro da janela → samePartConflict=true', () => {
    // Israel presidiu 01/06; alvo 22/06 (3 sem) → dentro de ±4 → conflito.
    const ref = new Date('2026-06-22T12:00:00');
    const hist: HistoryRecord[] = [
        mkHist({ name: 'Israel Vieira', date: '2026-06-01', weekId: '2026-06-01', tipoParte: 'Presidente' }),
    ];
    const sd = calculateScore(mkPub('p-israel', 'Israel Vieira'), 'Presidente', hist, ref);
    assert.equal(sd.details.samePartConflict, true, 'deve marcar conflito de mesma parte na janela');
    assert.equal(sd.details.samePartConflictDate, '2026-06-01');
});

test('SAME-PART GATE: mesma parte 2 semanas DEPOIS (futuro) também conta (simétrico)', () => {
    const ref = new Date('2026-06-22T12:00:00');
    const hist: HistoryRecord[] = [
        mkHist({ name: 'Israel Vieira', date: '2026-07-06', weekId: '2026-07-06', tipoParte: 'Presidente' }),
    ];
    const sd = calculateScore(mkPub('p-israel', 'Israel Vieira'), 'Presidente', hist, ref);
    assert.equal(sd.details.samePartConflict, true, 'janela é simétrica: futuro dentro de ±4 conta');
});

test('SAME-PART GATE: mesma parte FORA da janela (6 semanas) → sem conflito', () => {
    const ref = new Date('2026-06-22T12:00:00');
    const hist: HistoryRecord[] = [
        mkHist({ name: 'Israel Vieira', date: '2026-05-11', weekId: '2026-05-11', tipoParte: 'Presidente' }),
    ];
    const sd = calculateScore(mkPub('p-israel', 'Israel Vieira'), 'Presidente', hist, ref);
    assert.equal(sd.details.samePartConflict, false, '6 semanas está fora de ±4 → sem conflito');
});

test('SAME-PART GATE: parte DIFERENTE na janela NÃO dispara o gate (é só proximidade mole)', () => {
    const ref = new Date('2026-06-22T12:00:00');
    const hist: HistoryRecord[] = [
        // Parte diferente (Vida Cristã) 1 semana antes — conta para proximityCost, NÃO para o gate.
        mkHist({ name: 'Diego Resmann', date: '2026-06-15', weekId: '2026-06-15', tipoParte: 'Parte Vida Cristã' }),
    ];
    const sd = calculateScore(mkPub('p-diego', 'Diego Resmann'), 'Presidente', hist, ref);
    assert.equal(sd.details.samePartConflict, false, 'parte diferente não dispara gate de mesma-parte');
    assert.ok(sd.details.proximityCost > 0, 'mas continua pagando proximidade mole (part-agnóstica)');
});
