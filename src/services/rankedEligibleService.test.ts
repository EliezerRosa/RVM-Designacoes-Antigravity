import test from 'node:test';
import assert from 'node:assert/strict';
import type { Publisher, WorkbookPart, HistoryRecord } from '../types';
import { HistoryStatus } from '../types';
import { getRankedEligibleForPart } from './rankedEligibleService';

const mockElder: Publisher = {
    id: 'pub-elder-1',
    name: 'Ancião Teste',
    gender: 'brother',
    condition: 'Ancião',
    funcao: null,
    phone: '27999990001',
    isBaptized: true,
    isServing: true,
    ageGroup: 'Adulto',
    parentIds: [],
    isHelperOnly: false,
    canPairWithNonParent: true,
    privileges: {
        canGiveTalks: true,
        canGiveStudentTalks: true,
        canConductCBS: true,
        canReadCBS: true,
        canPray: true,
        canPreside: true,
    },
    privilegesBySection: {
        canParticipateInTreasures: true,
        canParticipateInMinistry: true,
        canParticipateInLife: true,
    },
    availability: { mode: 'always', exceptionDates: [], availableDates: [] },
    aliases: [],
};

const mockSister: Publisher = {
    id: 'pub-sister-1',
    name: 'Irmã Teste',
    gender: 'sister',
    condition: 'Publicador',
    funcao: null,
    phone: '27999990003',
    isBaptized: true,
    isServing: true,
    ageGroup: 'Adulto',
    parentIds: [],
    isHelperOnly: false,
    canPairWithNonParent: true,
    privileges: {
        canGiveTalks: false,
        canGiveStudentTalks: true,
        canConductCBS: false,
        canReadCBS: false,
        canPray: false,
        canPreside: false,
    },
    privilegesBySection: {
        canParticipateInTreasures: false,
        canParticipateInMinistry: true,
        canParticipateInLife: false,
    },
    availability: { mode: 'always', exceptionDates: [], availableDates: [] },
    aliases: [],
};

const targetTreasuresPart: WorkbookPart = {
    id: 'part-discurso-1',
    weekId: '2026-30',
    weekDisplay: 'Semana 30',
    date: '2026-08-10',
    section: 'Tesouros da Palavra de Deus',
    tipoParte: 'Discurso Tesouros',
    modalidade: 'Discurso de Ensino',
    tituloParte: 'Discurso na Tesouros',
    descricaoParte: '',
    detalhesParte: '',
    seq: 1,
    funcao: 'Titular',
    duracao: '10 min',
    horaInicio: '19:30',
    horaFim: '19:40',
    rawPublisherName: '',
    status: 'PENDENTE',
    createdAt: '2026-08-01T00:00:00Z',
};

const targetFSMPart: WorkbookPart = {
    id: 'part-fsm-1',
    weekId: '2026-30',
    weekDisplay: 'Semana 30',
    date: '2026-08-10',
    section: 'Faça Seu Melhor no Ministério',
    tipoParte: 'Iniciando Conversas',
    modalidade: 'Demonstração',
    tituloParte: 'Iniciando Conversas',
    descricaoParte: '',
    detalhesParte: '',
    seq: 3,
    funcao: 'Titular',
    duracao: '3 min',
    horaInicio: '19:50',
    horaFim: '19:53',
    rawPublisherName: '',
    status: 'PENDENTE',
    createdAt: '2026-08-01T00:00:00Z',
};

type HistorySeed = Pick<HistoryRecord, 'id' | 'weekId' | 'date' | 'section' | 'tipoParte' | 'modalidade'> & Partial<HistoryRecord>;
const h = (publisher: Publisher, seed: HistorySeed): HistoryRecord => ({
    weekDisplay: `Semana ${seed.weekId}`,
    tituloParte: seed.tipoParte,
    descricaoParte: '',
    detalhesParte: '',
    seq: 1,
    funcao: 'Titular',
    duracao: 0,
    horaInicio: '',
    horaFim: '',
    rawPublisherName: publisher.name,
    resolvedPublisherId: publisher.id,
    resolvedPublisherName: publisher.name,
    status: HistoryStatus.APPROVED,
    importSource: 'Manual',
    importBatchId: '',
    createdAt: `${seed.date}T00:00:00Z`,
    ...seed,
});

const TESOUROS = 'Tesouros da Palavra de Deus';

test('SECTION ROTATION GATE: marca sectionBlocked quando candidato deve outras partes elegíveis da seção', () => {
    const history = [
        h(mockElder, { id: 'h-1', weekId: '2026-25', date: '2026-07-01', section: TESOUROS, tipoParte: 'Discurso Tesouros', modalidade: 'Discurso de Ensino' }),
    ];

    const result = getRankedEligibleForPart(targetTreasuresPart, [targetTreasuresPart], [mockElder], history);
    const candidate = result.allCandidates.find(c => c.publisher.id === mockElder.id);

    assert.ok(candidate, 'Candidato deveria ser retornado');
    assert.equal(candidate?.sectionBlocked, true, 'Deveria estar sectionBlocked porque deve Joias');
    assert.ok((candidate?.sectionDebt || 0) >= 1, 'sectionDebt deveria ser >= 1');
});

test('SECTION ROTATION GATE: Leitura da Bíblia / Leitor EBC NÃO entram na dívida de seção (mesma classe apenas)', () => {
    const history = [
        h(mockElder, { id: 'h-dt', weekId: '2026-25', date: '2026-07-01', section: TESOUROS, tipoParte: 'Discurso Tesouros', modalidade: 'Discurso de Ensino' }),
        h(mockElder, { id: 'h-je', weekId: '2026-27', date: '2026-07-15', section: TESOUROS, tipoParte: 'Joias Espirituais', modalidade: 'Discurso de Ensino' }),
    ];

    const result = getRankedEligibleForPart(targetTreasuresPart, [targetTreasuresPart], [mockElder], history);
    const candidate = result.allCandidates.find(c => c.publisher.id === mockElder.id);

    assert.equal(candidate?.sectionDebt, 0, 'Fez Joias desde o último Discurso → dívida zero (Leitura não conta)');
    assert.equal(candidate?.sectionBlocked, false);
    assert.deepEqual(candidate?.unperformedSectionParts, []);
});

test('allCandidates inclui elegíveis barrados por gate, fora de eligibleCandidates, com flags', () => {
    const freeElder: Publisher = { ...mockElder, id: 'pub-elder-2', name: 'Ancião Livre' };
    const history = [
        h(mockElder, { id: 'h-gate', weekId: '2026-25', date: '2026-07-01', section: TESOUROS, tipoParte: 'Discurso Tesouros', modalidade: 'Discurso de Ensino' }),
    ];

    const result = getRankedEligibleForPart(targetTreasuresPart, [targetTreasuresPart], [mockElder, freeElder], history);

    assert.deepEqual(result.eligibleCandidates.map(c => c.publisher.id), [freeElder.id], 'Só o ancião livre passa no 1º passe');
    const gated = result.allCandidates.find(c => c.publisher.id === mockElder.id);
    assert.ok(gated, 'Barrado por gate deve aparecer em allCandidates');
    assert.equal(gated?.eligible, true);
    assert.equal(gated?.sectionBlocked, true);
    assert.equal(result.allCandidates.length, 2);
});

test('GARANTIA DE ESTUDANTE: ancião sem parte FSM em 13 semanas vai ao bucket 0, antes da irmã', () => {
    const history = [
        h(mockElder, { id: 'h-t1', weekId: '2026-20', date: '2026-05-15', section: TESOUROS, tipoParte: 'Discurso Tesouros', modalidade: 'Discurso de Ensino' }),
    ];

    const result = getRankedEligibleForPart(targetFSMPart, [targetFSMPart], [mockElder, mockSister], history);
    const elderCand = result.allCandidates.find(c => c.publisher.id === mockElder.id);
    const sisterCand = result.allCandidates.find(c => c.publisher.id === mockSister.id);

    assert.equal(sisterCand?.priorityBucket, 1, 'Irmã fica no Bucket 1');
    assert.equal(elderCand?.priorityBucket, 0, 'Ancião em seca vai ao Bucket 0');
    assert.equal(result.eligibleCandidates[0]?.publisher.id, mockElder.id, 'Ancião em seca é o primeiro da fila');
});

test('GARANTIA DE ESTUDANTE: ajudante conta — ancião que foi ajudante há 6 semanas NÃO está em seca', () => {
    const history = [
        h(mockElder, { id: 'h-aj', weekId: '2026-26', date: '2026-06-29', section: 'Faça Seu Melhor no Ministério', tipoParte: 'Iniciando Conversas (Ajudante)', modalidade: 'Demonstração', funcao: 'Ajudante' }),
    ];

    const result = getRankedEligibleForPart(targetFSMPart, [targetFSMPart], [mockElder, mockSister], history);
    const elderCand = result.allCandidates.find(c => c.publisher.id === mockElder.id);

    assert.equal(elderCand?.priorityBucket, 4, 'Fora da seca, ancião volta ao bucket 4 em demonstração');
    assert.equal(result.eligibleCandidates[0]?.publisher.id, mockSister.id);
});

test('GARANTIA DE ESTUDANTE: teto semanal — com 2 anciãos/SMs já em partes de estudante na semana, seca não promove', () => {
    const elderB: Publisher = { ...mockElder, id: 'pub-elder-b', name: 'Ancião B' };
    const elderC: Publisher = { ...mockElder, id: 'pub-elder-c', name: 'Ancião C' };
    const weekParts: WorkbookPart[] = [
        targetFSMPart,
        { ...targetFSMPart, id: 'fsm-2', seq: 4, tipoParte: 'Cultivando o Interesse', resolvedPublisherId: elderB.id, resolvedPublisherName: elderB.name },
        { ...targetFSMPart, id: 'fsm-3', seq: 5, tipoParte: 'Leitura da Bíblia', modalidade: 'Leitura de Estudante', resolvedPublisherId: elderC.id, resolvedPublisherName: elderC.name },
    ];

    const result = getRankedEligibleForPart(targetFSMPart, weekParts, [mockElder, mockSister, elderB, elderC], []);
    const elderCand = result.allCandidates.find(c => c.publisher.id === mockElder.id);

    assert.equal(elderCand?.priorityBucket, 4, 'Teto atingido: ancião em seca fica no bucket normal');
    assert.equal(result.eligibleCandidates[0]?.publisher.id, mockSister.id);
});

test('FILA DE PRESIDÊNCIA: bucket = nº de presidências na janela; quem presidiu menos vem antes', () => {
    const elderB: Publisher = { ...mockElder, id: 'pub-elder-b', name: 'Ancião B' };
    const presidentePart: WorkbookPart = { ...targetTreasuresPart, id: 'part-pres', section: 'Presidência', tipoParte: 'Presidente', modalidade: 'Presidência', tituloParte: 'Presidente' };
    const history = [
        h(mockElder, { id: 'p1', weekId: '2026-10', date: '2026-03-02', section: 'Presidência', tipoParte: 'Presidente', modalidade: 'Presidência' }),
        h(mockElder, { id: 'p2', weekId: '2026-18', date: '2026-04-27', section: 'Presidência', tipoParte: 'Presidente', modalidade: 'Presidência' }),
        h(elderB, { id: 'p3', weekId: '2026-14', date: '2026-03-30', section: 'Presidência', tipoParte: 'Presidente', modalidade: 'Presidência' }),
        // Ancião A com proximidade zero e carga menor; B com parte há 2 semanas — mesmo assim B vem antes, porque presidiu menos.
        h(elderB, { id: 'x1', weekId: '2026-29', date: '2026-07-27', section: TESOUROS, tipoParte: 'Joias Espirituais', modalidade: 'Discurso de Ensino' }),
    ];

    const result = getRankedEligibleForPart(presidentePart, [presidentePart], [mockElder, elderB], history);
    const a = result.allCandidates.find(c => c.publisher.id === mockElder.id);
    const b = result.allCandidates.find(c => c.publisher.id === elderB.id);

    assert.equal(a?.priorityBucket, 2);
    assert.equal(b?.priorityBucket, 1);
    assert.equal(result.eligibleCandidates[0]?.publisher.id, elderB.id, 'Fila cíclica vence proximidade/carga');
});

test('PRESIDÊNCIA: derivadas do presidente (Comentários/Oração Inicial) não excluem o próprio presidente ao avaliar a Presidência como vaga', () => {
    const presidentePart: WorkbookPart = { ...targetTreasuresPart, id: 'part-pres', section: 'Presidência', tipoParte: 'Presidente', modalidade: 'Presidência', tituloParte: 'Presidente' };
    const derived: WorkbookPart = { ...presidentePart, id: 'part-ci', tipoParte: 'Comentários Iniciais', modalidade: 'Comentários', tituloParte: 'Comentários Iniciais', resolvedPublisherId: mockElder.id, resolvedPublisherName: mockElder.name, rawPublisherName: mockElder.name };

    const result = getRankedEligibleForPart(presidentePart, [presidentePart, derived], [mockElder], []);
    const cand = result.allCandidates.find(c => c.publisher.id === mockElder.id);

    assert.equal(cand?.eligible, true, 'Derivada não conta como designação própria');
    assert.equal(cand?.inOtherPartSameWeek, undefined);
    assert.equal(result.eligibleCandidates[0]?.publisher.id, mockElder.id);
});

test('M-12 MEMÓRIA DE RECUSA: quem foi substituído em qualquer parte da semana fica inelegível nas demais partes da semana', () => {
    const elderB: Publisher = { ...mockElder, id: 'pub-elder-b', name: 'Ancião B' };
    const joias: WorkbookPart = { ...targetTreasuresPart, id: 'part-joias', tipoParte: 'Joias Espirituais', seq: 2, resolvedPublisherId: elderB.id, resolvedPublisherName: elderB.name, isSubstitution: true, substitutedPublisherName: mockElder.name };

    const result = getRankedEligibleForPart(targetTreasuresPart, [targetTreasuresPart, joias], [mockElder, elderB], []);
    const a = result.allCandidates.find(c => c.publisher.id === mockElder.id);

    assert.equal(a?.eligible, false);
    assert.match(a?.reason || '', /Memória de Recusa/);
    assert.equal(result.eligibleCandidates.length, 0, 'B já tem parte na semana e A foi substituído → ninguém');
});

test('M-12 MEMÓRIA DE RECUSA: excludedPublisherNames (refusal_logs) torna o recusante inelegível na semana', () => {
    const elderB: Publisher = { ...mockElder, id: 'pub-elder-b', name: 'Ancião B' };
    const result = getRankedEligibleForPart(targetTreasuresPart, [targetTreasuresPart], [mockElder, elderB], [], { excludedPublisherNames: [' Ancião Teste '] });

    assert.deepEqual(result.eligibleCandidates.map(c => c.publisher.id), [elderB.id]);
    assert.match(result.allCandidates.find(c => c.publisher.id === mockElder.id)?.reason || '', /Memória de Recusa/);
});

test('Q2 ALTERNÂNCIA: bloqueia enquanto há alternativa, mas relaxa (4º estágio) quando todos estão barrados', () => {
    const sisterB: Publisher = { ...mockSister, id: 'pub-sister-2', name: 'Irmã B' };
    const fsmTitular = (pub: Publisher, id: string, date: string) =>
        h(pub, { id, weekId: date, date, section: 'Faça Seu Melhor no Ministério', tipoParte: 'Iniciando Conversas', modalidade: 'Demonstração' });

    // Só a irmã A foi titular FSM há 2 semanas → Q2 a barra; irmã B passa.
    let result = getRankedEligibleForPart(targetFSMPart, [targetFSMPart], [mockSister, sisterB], [fsmTitular(mockSister, 'q2-a', '2026-07-27')]);
    assert.deepEqual(result.eligibleCandidates.map(c => c.publisher.id), [sisterB.id]);
    const gatedA = result.allCandidates.find(c => c.publisher.id === mockSister.id);
    assert.equal(gatedA?.eligible, true, 'Q2 não torna inelegível');
    assert.match(gatedA?.engineGateReason || '', /alternância FSM/);

    // Ambas foram titulares FSM há 2 semanas → pool esvazia → relaxamento libera as duas.
    result = getRankedEligibleForPart(targetFSMPart, [targetFSMPart], [mockSister, sisterB],
        [fsmTitular(mockSister, 'q2-a', '2026-07-27'), fsmTitular(sisterB, 'q2-b', '2026-07-27')]);
    assert.equal(result.eligibleCandidates.length, 2, 'Parte nunca fica desamparada por Q2');
});
