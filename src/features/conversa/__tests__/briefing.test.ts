import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBriefingData, type ConversaSpecialEvent } from '../ports/briefingPort';
import type { UpcomingAssignmentView } from '../ports/queryPort';

test('Briefing Port: computes pending items and future events correctly', () => {
  const mockConfirm: UpcomingAssignmentView[] = [
    {
      partId: '1',
      weekId: '2026-11-16',
      tipoParte: 'Oração Final',
      role: 'titular',
      status: 'proposta',
      dateStr: '18/11',
    },
  ];

  const mockFulfill: UpcomingAssignmentView[] = [
    {
      partId: '2',
      weekId: '2026-11-23',
      tipoParte: 'Leitura da Bíblia',
      role: 'titular',
      status: 'confirmada',
      dateStr: '25/11',
    },
  ];

  const mockEvents: ConversaSpecialEvent[] = [
    {
      id: 'e1',
      name: 'Visita do Superintendente de Circuito',
      startDate: '2026-11-25',
      endDate: '2026-11-29',
      type: 'circuit_overseer_visit',
    },
  ];

  const briefing = buildBriefingData('Irmão Silva', mockConfirm, mockFulfill, mockEvents);

  assert.equal(briefing.hasPendingItems, true);
  assert.equal(briefing.assignmentsToConfirm.length, 1);
  assert.equal(briefing.assignmentsToFulfill.length, 1);
  assert.equal(briefing.upcomingEvents.length, 1);
  assert.match(briefing.writtenGreeting, /aguardando confirmação/);
  assert.match(briefing.spokenSummary, /Irmão Silva/);
  assert.match(briefing.spokenSummary, /Superintendente/);
});

test('Briefing Port: empty agenda produces clean zero-pending briefing', () => {
  const briefing = buildBriefingData('Irmão Oliveira', [], [], []);
  assert.equal(briefing.hasPendingItems, false);
  assert.equal(briefing.assignmentsToConfirm.length, 0);
  assert.equal(briefing.assignmentsToFulfill.length, 0);
  assert.equal(briefing.upcomingEvents.length, 0);
  assert.match(briefing.spokenSummary, /em dia/i);
});

test('Briefing Port: preserves space before Lembre-se and pluralizes fulfillments with next part', () => {
  const events: ConversaSpecialEvent[] = [
    {
      id: 'ev-1',
      name: 'Assembleia de Circuito',
      startDate: '2026-11-16',
    },
  ];
  const noPartsBriefing = buildBriefingData('Eliezer Rosa', [], [], events);
  assert.match(noPartsBriefing.writtenGreeting, /Em que posso ajudar\? Lembre-se: Assembleia de Circuito/);
  assert.equal(noPartsBriefing.writtenGreeting.includes('ajudar?Lembre-se:'), false);

  const mockFulfill: UpcomingAssignmentView[] = [
    {
      partId: 'a1',
      weekId: '2026-11-23',
      tipoParte: 'Joias Espirituais',
      role: 'titular',
      status: 'DESIGNADA',
      dateStr: '2026-11-23',
    },
    {
      partId: 'a2',
      weekId: '2026-12-07',
      tipoParte: 'Presidente',
      role: 'titular',
      status: 'DESIGNADA',
      dateStr: '2026-12-07',
    },
  ];
  const withPartsBriefing = buildBriefingData('Eliezer Rosa', [], mockFulfill, events);
  assert.match(withPartsBriefing.writtenGreeting, /Você tem 2 designações a cumprir nas próximas reuniões \(próxima: Joias Espirituais em 23\/11\/2026\)\. Lembre-se: Assembleia de Circuito/);
});
