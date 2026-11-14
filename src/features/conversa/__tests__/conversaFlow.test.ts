import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialContext } from '../core/conversationState';
import { planTurn, type CardPlannerPorts } from '../core/cardPlanner';
import { parseL0Grammar } from '../core/nlu/l0Grammar';
import { expandAbsenceDateRange } from '../ports/actionPort';
import type { DocumentCarouselItem } from '../ports/documentPort';
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
  assert.equal(pendingTurn.message.cardData?.items?.length, 2);

  const noPubEligibility = await planTurn(
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

  assert.doesNotMatch(noPubEligibility.message.text, /Comando processado com sucesso/);
  assert.match(noPubEligibility.message.text, /publicador/i);
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
  const s4Items = (s4Turn.message.cardData?.items ?? []) as DocumentCarouselItem[];
  assert.equal(s4Items.length, 1);
  assert.equal(s4Items[0].docType, 's4');

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
  const s1Items = (s1Allowed.message.cardData?.items ?? []) as DocumentCarouselItem[];
  assert.equal(s1Items[0].docType, 's1');

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

test('knowledgePort: covers all canonical RVM topics (goal, M-0..M-12, S-4/S-1, Z-API, governance)', async () => {
  const { knowledgePort } = await import('../ports/knowledgePort');

  const obj = knowledgePort.getExplanation('Qual o objetivo do sistema RVM Designações?');
  assert.equal(obj.found, true);
  assert.match(obj.summary, /Vida e Ministério Cristão/i);

  const zapi = knowledgePort.getExplanation('Como funcionam os botões do Z-API e WhatsApp?');
  assert.equal(zapi.found, true);
  assert.match(`${zapi.summary} ${zapi.details.join(' ')}`, /Confirmar|Não Poderei|recusa/i);

  const s4 = knowledgePort.getExplanation('Quais as invariantes do relatório mensal S-4 e S-1?');
  assert.equal(s4.found, true);
  assert.match(`${s4.summary} ${s4.details.join(' ')}`, /Pioneir|I-[0-7]|S-4/i);

  const cca = knowledgePort.getExplanation('O que é a invariante CCA e governança de papéis?');
  assert.equal(cca.found, true);
  assert.match(`${cca.summary} ${cca.details.join(' ')}`, /CCA|Coordenador/i);

  const m12 = knowledgePort.getExplanation('Como funciona a memória de recusa M-12?');
  assert.equal(m12.found, true);
  assert.match(`${m12.summary} ${m12.details.join(' ')}`, /recus|substitu/i);
});

test('cardPlanner: specialist queries (quantas designacoes, eligibility, profile, list, analytics) & micro-actions with RBAC', async () => {
  const pubs: Publisher[] = [
    { ...makePublisher('pub-1', 'Eliezer Rosa'), condition: 'Ancião', privileges: { ...makePublisher('p', 'x').privileges, canPreside: true, canGiveTalks: true } },
    { ...makePublisher('pub-2', 'Maria Clara'), gender: 'sister', condition: 'Publicador' },
  ];

  const generatedWeeks: string[] = [];
  const clearedWeeks: string[] = [];
  let undoCalled = false;

  const ports: CardPlannerPorts = {
    actions: {
      registerAbsence: async () => ({ success: true, actionType: 'UPDATE_AVAILABILITY', message: 'ok' }),
      approveWeekProposal: async () => ({ success: true, actionType: 'APPROVE_PROPOSAL', message: 'ok' }),
      generateWeekDesignations: async (weekId) => {
        generatedWeeks.push(weekId);
        return { success: true, actionType: 'GENERATE_WEEK', message: `Semana ${weekId} gerada.` };
      },
      clearWeekDesignations: async (weekId) => {
        clearedWeeks.push(weekId);
        return { success: true, actionType: 'CLEAR_WEEK', message: `Semana ${weekId} limpa.` };
      },
      undoLastAction: async () => {
        undoCalled = true;
        return { success: true, actionType: 'UNDO_LAST', message: 'Ação desfeita.' };
      },
    },
    queries: {
      getPublisherAssignments: async (publisherId) =>
        publisherId === 'pub-1'
          ? [{ partId: 'p1', weekId: '2026-11-16', tipoParte: 'Presidente', role: 'titular', status: 'DESIGNADA', dateStr: '2026-11-16' }]
          : [],
      getWeekParts: async () => [],
      getVacantParts: async () => [],
      getLastParticipation: async () => [],
      getPendingWeeks: async () => [],
      checkPublisherEligibility: async (pub, partType) => ({
        title: `Elegibilidade — ${pub.name}`,
        summary: `${pub.name} elegível para ${partType || 'Presidência'}.`,
        items: [{ label: 'Presidência', value: 'Elegível', badge: 'OK' }],
      }),
      getPublisherProfileSummary: (pub) => ({
        title: `Perfil — ${pub.name}`,
        summary: `${pub.name}: ${pub.condition}`,
        items: [{ label: 'Condição', value: pub.condition }],
      }),
      getPublisherListSummary: (list, filter) => ({
        title: `Lista (${filter || 'Todos'})`,
        summary: `Total filtrado: ${list.filter((p) => (filter?.includes('anciao') ? p.condition.toLowerCase().includes('anci') : true)).length}`,
        items: [{ label: 'Eliezer Rosa', value: 'Ancião' }],
      }),
      getAnalyticsSummary: async () => ({
        title: 'Resumo RVM',
        summary: '2 publicadores ativos',
        items: [{ label: 'Ativos', value: '2' }],
      }),
    },
  };

  // 1. "Quantas designações eu tenho" -> L0 + cardPlanner -> 1 designação
  const l0Count = parseL0Grammar('Quantas designações eu tenho');
  assert.equal(l0Count.intentId, 'query-my-assignments');
  const myTurn = await planTurn(
    { ...l0Count, layer: 'l0-grammar' },
    createInitialContext(),
    fullGate,
    pubs,
    ['2026-11-16'],
    { publisherId: 'pub-1', publisherName: 'Eliezer Rosa', isAdmin: true },
    ports
  );
  assert.equal(myTurn.message.cardType, 'micro-panel');
  assert.match(myTurn.message.text, /1 designação/);

  // 2. Profile & List & Analytics
  const profileTurn = await planTurn(
    { intentId: 'query-publisher-profile', slots: { personName: 'Eliezer Rosa' }, confidence: 0.9, layer: 'l0-grammar', rawText: 'perfil de Eliezer Rosa' },
    createInitialContext(),
    fullGate,
    pubs,
    ['2026-11-16'],
    { publisherId: 'pub-1', publisherName: 'Eliezer Rosa', isAdmin: true },
    ports
  );
  assert.equal(profileTurn.message.cardData?.type, 'info-list');
  assert.match(profileTurn.message.text, /Eliezer Rosa/);

  const listTurn = await planTurn(
    { intentId: 'query-publisher-list', slots: { filter: 'anciaos' }, confidence: 0.9, layer: 'l0-grammar', rawText: 'listar anciãos' },
    createInitialContext(),
    fullGate,
    pubs,
    ['2026-11-16'],
    { publisherId: 'pub-1', isAdmin: true },
    ports
  );
  assert.equal(listTurn.message.cardData?.type, 'info-list');
  assert.match(listTurn.message.text, /1/);

  const analyticsTurn = await planTurn(
    { intentId: 'query-analytics', slots: {}, confidence: 0.9, layer: 'l0-grammar', rawText: 'estatisticas gerais' },
    createInitialContext(),
    fullGate,
    pubs,
    ['2026-11-16'],
    { isAdmin: true },
    ports
  );
  assert.equal(analyticsTurn.message.cardData?.type, 'info-list');

  // 3. Micro-action generate-week (preview + confirm) and RBAC denial for non-admin
  const genPreview = await planTurn(
    { intentId: 'generate-week', slots: {}, confidence: 0.92, layer: 'l0-grammar', rawText: 'gerar semana' },
    createInitialContext(),
    fullGate,
    pubs,
    ['2026-11-16'],
    { isAdmin: true },
    ports
  );
  assert.equal(genPreview.message.cardType, 'action-preview');

  const genConfirmed = await planTurn(
    { intentId: 'clarify-ambiguity', slots: { confirmation: 'yes' }, confidence: 1, layer: 'l0-grammar', rawText: 'sim' },
    genPreview.updatedContext,
    fullGate,
    pubs,
    ['2026-11-16'],
    { isAdmin: true },
    ports
  );
  assert.deepEqual(generatedWeeks, ['2026-11-16']);
  assert.equal(genConfirmed.message.cardData?.status, 'success');

  // Undo confirmation
  const undoPreview = await planTurn(
    { intentId: 'undo-last-action', slots: {}, confidence: 1, layer: 'l0-grammar', rawText: 'desfazer' },
    createInitialContext(),
    fullGate,
    pubs,
    ['2026-11-16'],
    { isAdmin: true },
    ports
  );
  const undoConfirmed = await planTurn(
    { intentId: 'clarify-ambiguity', slots: { confirmation: 'yes' }, confidence: 1, layer: 'l0-grammar', rawText: 'sim' },
    undoPreview.updatedContext,
    fullGate,
    pubs,
    ['2026-11-16'],
    { isAdmin: true },
    ports
  );
  assert.equal(undoCalled, true);
  assert.equal(undoConfirmed.message.cardData?.status, 'success');

  // Clear-week blocked for restricted profile
  const restrictedGate: PermissionGate = {
    ...fullGate,
    canAgentAction: () => false,
    isFullAdmin: () => false,
  };
  const blockedClear = await planTurn(
    { intentId: 'clear-week', slots: {}, confidence: 0.92, layer: 'l0-grammar', rawText: 'limpar semana' },
    createInitialContext(),
    restrictedGate,
    pubs,
    ['2026-11-16'],
    { isAdmin: false },
    ports
  );
  assert.equal(blockedClear.message.cardType, undefined);
  assert.match(blockedClear.message.text, /permiss|restrita|bloquead/i);
  assert.equal(clearedWeeks.length, 0);
});

test('cardPlanner & knowledgePort: contextual reasoning for funcionalidades, permissoes do usuario, abas e fallback sem perda de this', async () => {
  const pubs: Publisher[] = [
    { ...makePublisher('pub-1', 'Eliezer Rosa'), condition: 'Ancião', funcao: 'Superintendente da Reunião Vida e Ministério', privileges: { ...makePublisher('p', 'x').privileges, canPreside: true, canGiveTalks: true } },
    { ...makePublisher('pub-2', 'Maria Clara'), gender: 'sister', condition: 'Publicador' },
  ];

  // 1. "Quais são suas funcionalidades?" -> resposta especialista rica com contexto vivo
  const funcL0 = parseL0Grammar('Quais são suas funcionalidades?');
  const funcTurn = await planTurn(
    { ...funcL0, layer: 'l0-grammar' },
    createInitialContext(),
    fullGate,
    pubs,
    ['2026-11-30'],
    { publisherId: 'pub-1', publisherName: 'Eliezer Rosa', isAdmin: true }
  );
  assert.equal(funcTurn.message.cardType, 'explain');
  assert.equal(funcTurn.message.cardData?.found, true);
  assert.match(funcTurn.message.text, /Eliezer Rosa/i);
  const funcDetails = (funcTurn.message.cardData?.details || []).join('\n');
  assert.match(funcDetails, /2 publicador\(es\).*1 semana\(s\)/i);

  // 2. "O que é que é permitido eu fazer?" -> adaptado dinamicamente ao PermissionGate (Admin vs Publicador restrito)
  const permL0 = parseL0Grammar('O que é que é permitido eu fazer?');
  const adminPermTurn = await planTurn(
    { ...permL0, layer: 'l0-grammar' },
    createInitialContext(),
    fullGate,
    pubs,
    ['2026-11-30'],
    { publisherId: 'pub-1', publisherName: 'Eliezer Rosa', isAdmin: true }
  );
  assert.equal(adminPermTurn.message.cardType, 'explain');
  assert.equal(adminPermTurn.message.cardData?.found, true);
  assert.match(adminPermTurn.message.text, /Administrador Geral|acesso integral/i);

  const pubGate: PermissionGate = {
    ...fullGate,
    isFullAdmin: () => false,
    canViewTab: (tab) => tab === 'workbook',
    canAgentAction: (action) => action === 'QUERY_PUBLISHER_ASSIGNMENTS' || action === 'UPDATE_AVAILABILITY',
    getPublisherScope: () => ({
      isAdmin: false,
      accessLevel: 'self',
      selfPublisherId: 'pub-2',
      canSeeSensitiveData: false,
      filters: { accessLevel: 'self' },
    }),
  };
  const pubPermTurn = await planTurn(
    { ...permL0, layer: 'l0-grammar' },
    createInitialContext(),
    pubGate,
    pubs,
    ['2026-11-30'],
    { publisherId: 'pub-2', publisherName: 'Maria Clara', isAdmin: false }
  );
  assert.equal(pubPermTurn.message.cardData?.found, true);
  assert.match(pubPermTurn.message.text, /Maria Clara/i);
  assert.match((pubPermTurn.message.cardData?.details || []).join('\n'), /Apenas seus próprios dados/i);

  // 3. "Quais são as abas do RVM?"
  const tabsL0 = parseL0Grammar('Quais são as abas do RVM?');
  const tabsTurn = await planTurn(
    { ...tabsL0, layer: 'l0-grammar' },
    createInitialContext(),
    fullGate,
    pubs,
    ['2026-11-30'],
    { publisherId: 'pub-1', publisherName: 'Eliezer Rosa', isAdmin: true }
  );
  assert.equal(tabsTurn.message.cardData?.found, true);
  assert.match(`${tabsTurn.message.text} ${(tabsTurn.message.cardData?.details || []).join(' ')}`, /Territórios|Backup|Apostila/i);

  // 4. Default queryPort sem mocks explícitos (ports = {}) não perde binding `this`
  const eligTurn = await planTurn(
    {
      intentId: 'query-eligibility',
      slots: { personName: 'Eliezer Rosa', partType: 'Presidente' },
      confidence: 0.9,
      layer: 'l0-grammar',
      rawText: 'O irmão Eliezer Rosa pode fazer Presidente?',
    },
    createInitialContext(),
    fullGate,
    pubs,
    [],
    { publisherId: 'pub-1', publisherName: 'Eliezer Rosa', isAdmin: true }
  );
  assert.equal(eligTurn.message.cardType, 'micro-panel');
  assert.equal(eligTurn.message.cardData?.type, 'info-list');
  assert.match(eligTurn.message.text, /Eliezer Rosa/);
});


