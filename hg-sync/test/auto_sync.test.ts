import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAutoSyncDownloadDoc } from '../src/worker.js';
import { store } from '../src/store.js';
import { nameResolver } from '../src/names/resolver.js';
import { computeMidweekDiff } from '../src/midweek/reconcile.js';
import type { ParsedDocument, MidweekWeekSchedule } from '../src/types.js';

test('shouldAutoSyncDownloadDoc - triggers on new file, changed sha256, or reduced unresolvedCount', () => {
  const mockDoc: ParsedDocument = {
    filePath: 'C:/Downloads/INDICADORES E MICROFONE.pdf',
    fileName: 'INDICADORES E MICROFONE.pdf',
    detectedType: {
      id: 'indicadores_microfone',
      name: 'Indicadores e Microfones',
      targetModule: 'av',
      headerMatchAny: ['INDICADOR'],
      columns: []
    },
    yearInferred: 2026,
    rows: [],
    unresolvedCount: 0
  };

  // 1. Arquivo novo -> deve sincronizar
  assert.equal(shouldAutoSyncDownloadDoc(mockDoc, 'hash-abc', {}), true);

  // 2. Mesmo hash e mesmo unresolvedCount -> ignora
  assert.equal(
    shouldAutoSyncDownloadDoc(mockDoc, 'hash-abc', {
      'INDICADORES E MICROFONE.pdf': { sha256: 'hash-abc', unresolvedCount: 0, syncedCount: 20 }
    }),
    false
  );

  // 3. Hash mudou -> deve sincronizar
  assert.equal(
    shouldAutoSyncDownloadDoc(mockDoc, 'hash-def', {
      'INDICADORES E MICROFONE.pdf': { sha256: 'hash-abc', unresolvedCount: 0, syncedCount: 20 }
    }),
    true
  );

  // 4. Mesmo hash mas unresolvedCount caiu (apelidos resolvidos) -> deve sincronizar
  assert.equal(
    shouldAutoSyncDownloadDoc(mockDoc, 'hash-abc', {
      'INDICADORES E MICROFONE.pdf': { sha256: 'hash-abc', unresolvedCount: 3, syncedCount: 17 }
    }),
    true
  );
});

test('NameResolver & DataStore - resolves ELIEZER and LUIZ ALEXAND from INDICADORES E MICROFONE.pdf', () => {
  const eliezer = nameResolver.resolve('ELIEZER', 'attendants_0');
  assert.equal(eliezer.canonicalName, 'Eliezer Rosa');
  assert.ok(eliezer.hg_id && eliezer.hg_id > 0);
  assert.notEqual(eliezer.confidence, 'unresolved');

  const luiz = nameResolver.resolve('LUIZ ALEXAND', 'mics_1');
  assert.equal(luiz.canonicalName, 'Luiz Alexandrino');
  assert.equal(luiz.hg_id, 3331204);
  assert.notEqual(luiz.confidence, 'unresolved');
});

test('computeMidweekDiff - covers core, cbs, tgw, fm (assignee + assistant), and lac with partId', () => {
  const rvm: MidweekWeekSchedule = {
    weekId: '2026-11-09',
    weekDisplay: 'Semana 2026-11-09',
    isPublished: true,
    slots: {
      chairman: { partTitle: 'Presidente', partType: 'Presidente', section: 'Core', role: 'Titular', assigneeName: 'Marcos Vinícius', assigneeHgId: 2491442, rvmPartId: 'p1', status: 'DESIGNADA' },
      cbs: { partTitle: 'EBC', partType: 'Dirigente EBC', section: 'Vida Cristã', role: 'Titular', assigneeName: 'Diego Resmann', assigneeHgId: 2491224, rvmPartId: 'p2', status: 'DESIGNADA' },
      tgw_0: { partTitle: 'Discurso TGW', partType: 'Tesouros', section: 'Tesouros', role: 'Titular', assigneeName: 'Samuel Almeida', assigneeHgId: 3331195, rvmPartId: 'p3', status: 'DESIGNADA' },
      fm_0_assignee: { partTitle: 'Iniciando Conversas', partType: 'Ministério', section: 'Ministério', role: 'Titular', assigneeName: 'Victor Correa', assigneeHgId: 3331161, rvmPartId: 'p4', status: 'DESIGNADA' },
      fm_0_assistant: { partTitle: 'Iniciando Conversas', partType: 'Ministério', section: 'Ministério', role: 'Ajudante', assigneeName: 'Luan Sabadim', assigneeHgId: 3331139, rvmPartId: 'p5', status: 'DESIGNADA' },
      lac_0: null
    }
  };

  const hgCurrent = {
    weekId: '2026-11-09',
    chairman: 2491442,
    cbs: 0,
    tgw: [{ id: 101, part: 1, assignee: 0 }],
    fm: [{ id: 201, part: 4, assignee: 3331161, assistant: 3331160 }],
    lac: [{ id: 301, part: 7, assignee: 3296264 }]
  };

  const knownMap = new Map<number, string>([
    [2491442, 'Marcos Vinícius'],
    [2491224, 'Diego Resmann'],
    [3331195, 'Samuel Almeida'],
    [3331161, 'Victor Correa'],
    [3331139, 'Luan Sabadim'],
    [3331160, 'Jairo Santos'],
    [3296264, 'Emerson França']
  ]);

  const diffs = computeMidweekDiff(rvm, hgCurrent, knownMap);
  const bySlot = new Map(diffs.map(d => [d.slotKey, d]));

  assert.equal(bySlot.get('chairman')?.action, 'noop');
  assert.equal(bySlot.get('cbs')?.action, 'insert');
  assert.equal(bySlot.get('tgw_0')?.action, 'insert');
  assert.equal(bySlot.get('tgw_0')?.partId, 101);
  assert.equal(bySlot.get('fm_0_assignee')?.action, 'noop');
  assert.equal(bySlot.get('fm_0_assistant')?.action, 'update');
  assert.equal(bySlot.get('fm_0_assistant')?.partId, 201);
  assert.equal(bySlot.get('lac_0')?.action, 'clear');
  assert.equal(bySlot.get('lac_0')?.partId, 301);
});
