import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialContext } from '../core/conversationState';
import { planTurn, type CardPlannerPorts } from '../core/cardPlanner';
import { parseL0Grammar } from '../core/nlu/l0Grammar';
import { expandAbsenceDateRange } from '../ports/actionPort';
import type { PermissionGate } from '../../../services/permissionService';
import type { Publisher } from '../../../types';
import { resolveIntent } from '../core/nlu/l2Classifier';

const fullGate: PermissionGate = {
  canViewTab: () => true,
  canAgentAction: () => true,
  canSeeSensitiveData: () => true,
  canSeeAgentControlPanel: () => true,
  canSendZap: () => true,
  getAccessLevel: () => 'elder',
  getPublisherFilters: () => ({ accessLevel: 'all' }),
  getPublisherScope: () => ({
    isAdmin: true,
    accessLevel: 'all',
    selfPublisherId: null,
    canSeeSensitiveData: true,
    filters: { accessLevel: 'all' },
  }),
  getAllowedAgentActions: () => [],
  isFullAdmin: () => true,
  isLoaded: () => true,
  hasNoTabs: () => false,
};

function makePublisher(id: string, name: string): Publisher {
  return {
    id,
    name,
    gender: 'sister',
    condition: 'Publicador',
    funcao: null,
    phone: '',
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
      canParticipateInLife: true,
    },
    availability: {
      mode: 'always',
      exceptionDates: [],
      availableDates: [],
    },
    aliases: [],
  };
}

test('cardPlanner: handles 0-based choiceIndex disambiguation without skipping first option', async () => {
  const pubs = [
    makePublisher('pub-maria-1', 'Maria Silva'),
    makePublisher('pub-maria-2', 'Maria Souza'),
  ];

  let queriedPublisherId: string | undefined;
  const ports: CardPlannerPorts = {
    queries: {
      getPublisherAssignments: async (publisherId) => {
        queriedPublisherId = publisherId;
        return [
          {
            partId: 'part-1',
            weekId: '2026-11-16',
            tipoParte: 'Primeira Conversa',
            role: 'titular',
            status: 'DESIGNADA',
            dateStr: '2026-11-16',
          },
        ];
      },
      getWeekParts: async () => [],
      getVacantParts: async () => [],
      getLastParticipation: async () => [],
      getPendingWeeks: async () => [],
    },
  };

  const turn1 = await planTurn(
    {
      intentId: 'query-my-assignments',
      slots: { personName: 'Maria' },
      confidence: 0.95,
      layer: 'l0-grammar',
      rawText: 'designações da Maria',
    },
    createInitialContext(),
    fullGate,
    pubs,
    ['2026-11-16'],
    {},
    ports
  );

  assert.equal(turn1.message.cardType, 'clarify');
  assert.ok(turn1.updatedContext.activeDisambiguation);

  // Escolha da 1ª opção ("1" -> choiceIndex = 0)
  const l0Choice = parseL0Grammar('1');
  assert.equal(l0Choice.slots.choiceIndex, 0);

  const turn2 = await planTurn(
    {
      intentId: l0Choice.intentId,
      slots: l0Choice.slots,
      confidence: 1,
      layer: 'l0-grammar',
      rawText: '1',
    },
    turn1.updatedContext,
    fullGate,
    pubs,
    ['2026-11-16'],
    {},
    ports
  );

  assert.equal(queriedPublisherId, 'pub-maria-1');
  assert.equal(turn2.message.cardType, 'micro-panel');
  assert.match(turn2.message.text, /Maria Silva/);
});

test('cardPlanner: register-absence requires valid dates, previews action, and executes real actionPort on confirmation', async () => {
  const pubs = [makePublisher('pub-self', 'João Santos')];
  let recordedCall: { id: string; start: string; end?: string } | null = null;

  const ports: CardPlannerPorts = {
    actions: {
      registerAbsence: async (publisherId, startDate, endDate) => {
        recordedCall = { id: publisherId, start: startDate, end: endDate };
        return {
          success: true,
          actionType: 'UPDATE_AVAILABILITY',
          message: `Indisponibilidade salva para ${startDate}`,
        };
      },
      approveWeekProposal: async () => ({
        success: true,
        actionType: 'APPROVE_PROPOSAL',
        message: 'ok',
      }),
    },
  };

  // Sem datas explícitas -> pede datas em vez de mostrar botão quebrado
  const noDatesTurn = await planTurn(
    {
      intentId: 'register-absence',
      slots: {},
      confidence: 0.9,
      layer: 'l2-classifier',
      rawText: 'vou viajar',
    },
    createInitialContext(),
    fullGate,
    pubs,
    ['2026-11-16'],
    { publisherId: 'pub-self', publisherName: 'João Santos' },
    ports
  );

  assert.equal(noDatesTurn.message.cardType, undefined);
  assert.equal(noDatesTurn.updatedContext.pendingAction, undefined);

  // Com datas -> mostra action-preview e executa registerAbsence ao confirmar
  const previewTurn = await planTurn(
    {
      intentId: 'register-absence',
      slots: { startDate: '2026-12-01', endDate: '2026-12-03' },
      confidence: 0.95,
      layer: 'l0-grammar',
      rawText: 'vou viajar de 01/12 a 03/12',
    },
    createInitialContext(),
    fullGate,
    pubs,
    ['2026-11-16'],
    { publisherId: 'pub-self', publisherName: 'João Santos' },
    ports
  );

  assert.equal(previewTurn.message.cardType, 'action-preview');
  assert.equal(previewTurn.updatedContext.pendingAction?.params.personId, 'pub-self');

  const confirmTurn = await planTurn(
    {
      intentId: 'clarify-ambiguity',
      slots: { confirmation: 'yes' },
      confidence: 1,
      layer: 'l0-grammar',
      rawText: 'sim',
    },
    previewTurn.updatedContext,
    fullGate,
    pubs,
    ['2026-11-16'],
    { publisherId: 'pub-self', publisherName: 'João Santos' },
    ports
  );

  assert.deepEqual(recordedCall, {
    id: 'pub-self',
    start: '2026-12-01',
    end: '2026-12-03',
  });
  assert.equal(confirmTurn.message.cardData?.status, 'success');
  assert.match(confirmTurn.message.text, /Indisponibilidade salva/);
});

test('cardPlanner: handles failed action execution honestly', async () => {
  const pubs = [makePublisher('pub-self', 'João Santos')];
  const ports: CardPlannerPorts = {
    actions: {
      registerAbsence: async () => ({
        success: false,
        actionType: 'UPDATE_AVAILABILITY',
        message: 'Ação não permitida pelo servidor.',
      }),
      approveWeekProposal: async () => ({
        success: false,
        actionType: 'APPROVE_PROPOSAL',
        message: 'Permissão negada.',
      }),
    },
  };

  const previewTurn = await planTurn(
    {
      intentId: 'approve-week-proposal',
      slots: { weekId: '2026-11-23' },
      confidence: 0.9,
      layer: 'l0-grammar',
      rawText: 'aprovar semana 23/11',
    },
    createInitialContext(),
    fullGate,
    pubs,
    ['2026-11-23'],
    { publisherId: 'pub-self', publisherName: 'João Santos', isAdmin: true },
    ports
  );

  assert.equal(previewTurn.message.cardType, 'action-preview');

  const confirmTurn = await planTurn(
    {
      intentId: 'clarify-ambiguity',
      slots: { confirmation: 'yes' },
      confidence: 1,
      layer: 'l0-grammar',
      rawText: 'sim',
    },
    previewTurn.updatedContext,
    fullGate,
    pubs,
    ['2026-11-23'],
    { publisherId: 'pub-self', publisherName: 'João Santos', isAdmin: true },
    ports
  );

  assert.equal(confirmTurn.message.cardData?.status, 'error');
  assert.match(confirmTurn.message.text, /Permissão negada/);
});

test('cardPlanner: self utterance ("minhas designações") overrides prior context person', async () => {
  let lastQueriedId = '';
  const ports: CardPlannerPorts = {
    queries: {
      getPublisherAssignments: async (id) => {
        lastQueriedId = id;
        return [];
      },
      getWeekParts: async () => [],
      getVacantParts: async () => [],
      getLastParticipation: async () => [],
      getPendingWeeks: async () => [],
    },
  };

  const ctx = {
    ...createInitialContext(),
    lastPersonId: 'other-pub-id',
    lastPersonName: 'Outro Publicador',
  };

  const res = await planTurn(
    {
      intentId: 'query-my-assignments',
      slots: {},
      confidence: 0.95,
      layer: 'l0-grammar',
      rawText: 'quais são minhas designações',
    },
    ctx,
    fullGate,
    [],
    [],
    { publisherId: 'self-pub-id', publisherName: 'Meu Nome' },
    ports
  );

  assert.equal(lastQueriedId, 'self-pub-id');
  assert.match(res.message.text, /Meu Nome/);
});

test('cardPlanner: handles query-pending-weeks and honest fallback', async () => {
  const ports: CardPlannerPorts = {
    queries: {
      getPublisherAssignments: async () => [],
      getWeekParts: async () => [],
      getVacantParts: async () => [],
      getLastParticipation: async () => [],
      getPendingWeeks: async () => ['2026-11-16', '2026-11-23'],
    },
  };

  const pendingTurn = await planTurn(
    {
      intentId: 'query-pending-weeks',
      slots: {},
      confidence: 0.9,
      layer: 'l0-grammar',
      rawText: 'quais semanas pendentes',
    },
    createInitialContext(),
    fullGate,
    [],
    [],
    {},
    ports
  );

  assert.equal(pendingTurn.message.cardType, 'micro-panel');
  assert.equal(pendingTurn.message.cardData?.type, 'pending-weeks-list');
  assert.equal(pendingTurn.message.cardData?.items.length, 2);

  const unsupportedTurn = await planTurn(
    {
      intentId: 'query-eligibility',
      slots: {},
      confidence: 0.9,
      layer: 'l2-classifier',
      rawText: 'elegibilidade do Lucas',
    },
    createInitialContext(),
    fullGate,
    [],
    [],
    {},
    ports
  );

  assert.doesNotMatch(unsupportedTurn.message.text, /Comando processado com sucesso/);
  assert.match(unsupportedTurn.message.text, /não possui execução direta/i);
});

test('actionPort expandAbsenceDateRange expands range safely', () => {
  const refDate = new Date(2026, 10, 11); // 11/11/2026
  const single = expandAbsenceDateRange('2026-12-05', undefined, refDate);
  assert.deepEqual(single, ['2026-12-05']);

  const range = expandAbsenceDateRange('2026-12-01', '2026-12-03', refDate);
  assert.deepEqual(range, ['2026-12-01', '2026-12-02', '2026-12-03']);

  const dayRange = expandAbsenceDateRange('dia-15', 'dia-17', new Date(2026, 10, 1));
  assert.deepEqual(dayRange, ['2026-11-15', '2026-11-16', '2026-11-17']);
});

test('l2Classifier: sanitizes string "null" slots and handles "fallback.unknown"', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    assert.ok(body.utterance);
    assert.equal(body.utterance, body.text);
    return new Response(
      JSON.stringify({
        intentId: 'query-week-assignments',
        confidence: 0.9,
        slots: {
          publisherName: 'null',
          weekId: '2026-11-23',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    const resolved = await resolveIntent('ver a reunião daquela data específica');
    assert.equal(resolved.intentId, 'query-week-assignments');
    assert.equal(resolved.layer, 'l2-classifier');
    assert.equal(resolved.slots.personName, undefined);
    assert.equal(resolved.slots.weekId, '2026-11-23');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('knowledgePort: matches Portuguese queries containing accents (rodízio, gênero)', async () => {
  const { knowledgePort } = await import('../ports/knowledgePort');
  const expl = knowledgePort.getExplanation('como funciona o rodízio?');
  assert.equal(expl.found, true);
  assert.ok(expl.officialSource);
  assert.match(expl.title, /Rodízio/i);
});

test('cardPlanner: renders S-4 and S-1 forms in document-carousel and restricts S-1 to RM-authorized profiles', async () => {
  const ports: CardPlannerPorts = {
    documents: {
      getS140ChronologicalList: async () => [],
      getS89ChronologicalList: async () => [],
      getS4ChronologicalList: async (name) => [
        {
          id: 's4-1',
          docType: 's4',
          title: 'Cartão S-4 · Outubro de 2026',
          subtitle: name || 'João Santos',
          dateStr: '10/2026',
          naturalWidth: 480,
          htmlContent: '<div>S-4-T</div>',
          isInitialFocus: true,
        },
      ],
      getS1ChronologicalList: async () => [
        {
          id: 's1-2026-10',
          docType: 's1',
          title: 'Consolidação S-1 · Outubro de 2026',
          subtitle: '120 relatórios computados',
          dateStr: '10/2026',
          naturalWidth: 800,
          htmlContent: '<div>S-1-T</div>',
          isInitialFocus: true,
        },
      ],
    },
  };

  const s4Turn = await planTurn(
    {
      intentId: 'view-s4',
      slots: { month: 'outubro' },
      confidence: 0.95,
      layer: 'l0-grammar',
      rawText: 'meu s-4 de outubro',
    },
    createInitialContext(),
    fullGate,
    [],
    [],
    { publisherId: 'pub-1', publisherName: 'João Santos' },
    ports
  );

  assert.equal(s4Turn.message.cardType, 'document-carousel');
  assert.equal(s4Turn.message.cardData?.items.length, 1);
  assert.equal(s4Turn.message.cardData?.items[0].docType, 's4');

  const s1Allowed = await planTurn(
    {
      intentId: 'view-s1-consolidation',
      slots: { month: 'outubro' },
      confidence: 0.95,
      layer: 'l0-grammar',
      rawText: 'ver s-1 de outubro',
    },
    createInitialContext(),
    fullGate,
    [],
    [],
    { isAdmin: true },
    ports
  );

  assert.equal(s1Allowed.message.cardType, 'document-carousel');
  assert.equal(s1Allowed.message.cardData?.items[0].docType, 's1');

  const publisherGate: PermissionGate = {
    ...fullGate,
    canViewTab: () => false,
    isFullAdmin: () => false,
  };

  const s1Blocked = await planTurn(
    {
      intentId: 'view-s1-consolidation',
      slots: {},
      confidence: 0.95,
      layer: 'l0-grammar',
      rawText: 'ver s-1',
    },
    createInitialContext(),
    publisherGate,
    [],
    [],
    { isAdmin: false },
    ports
  );

  assert.equal(s1Blocked.message.cardType, undefined);
  assert.match(s1Blocked.message.text, /restrita/i);
});


