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

test('PROMOÇÃO FSM: Ancião em seca (>13 sem sem FSM + cobertura Tesouros/Vida) sobe para Bucket 1 FSM', () => {
    const history = [
        h(mockElder, { id: 'h-t1', weekId: '2026-20', date: '2026-05-15', section: TESOUROS, tipoParte: 'Discurso Tesouros', modalidade: 'Discurso de Ensino' }),
        h(mockElder, { id: 'h-v1', weekId: '2026-22', date: '2026-06-01', section: 'Nossa Vida Cristã', tipoParte: 'Parte Vida Cristã', modalidade: 'Discurso de Ensino' }),
    ];

    const result = getRankedEligibleForPart(targetFSMPart, [targetFSMPart], [mockElder, mockSister], history);
    const elderCand = result.allCandidates.find(c => c.publisher.id === mockElder.id);
    const sisterCand = result.allCandidates.find(c => c.publisher.id === mockSister.id);

    assert.equal(sisterCand?.priorityBucket, 1, 'Irmã deve estar no Bucket 1');
    assert.equal(elderCand?.priorityBucket, 1, 'Ancião em seca + cobertura deve ser promovido ao Bucket 1 FSM');
});
