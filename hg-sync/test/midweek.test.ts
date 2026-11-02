import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWeekPartsToHgSlots } from '../src/midweek/mapper.js';
import { computeMidweekDiff, HgWeekScheduleCurrent } from '../src/midweek/reconcile.js';

test('Midweek Mapper - correctly extracts core parts from RVM structure', () => {
  const weekId = '2026-11-02';
  const pubMap = new Map<string, any>([
    ['pub-1', { id: 'pub-1', name: 'Renato Oliveira', hg_id: 2491349 }],
    ['pub-2', { id: 'pub-2', name: 'Eliézer Silveira', hg_id: 3296266 }]
  ]);

  const mockParts = [
    {
      id: 'p-1',
      week_id: weekId,
      tipo_parte: 'Presidente da Reunião',
      section: 'tesouros',
      funcao: 'Titular' as const,
      resolved_publisher_id: 'pub-1',
      status: 'DESIGNADA',
      seq: 1
    },
    {
      id: 'p-2',
      week_id: weekId,
      tipo_parte: 'Leitor EBC',
      section: 'vida_crista',
      funcao: 'Titular' as const,
      resolved_publisher_id: 'pub-2',
      status: 'DESIGNADA',
      seq: 10
    }
  ];

  const schedule = mapWeekPartsToHgSlots(weekId, mockParts, pubMap, true);
  assert.equal(schedule.weekId, weekId);
  assert.ok(schedule.slots['chairman']);
  assert.equal(schedule.slots['chairman']?.assigneeHgId, 2491349);
  assert.equal(schedule.slots['chairman']?.assigneeName, 'Renato Oliveira');

  assert.ok(schedule.slots['cbs_reader']);
  assert.equal(schedule.slots['cbs_reader']?.assigneeHgId, 3296266);
  assert.equal(schedule.slots['cbs_reader']?.assigneeName, 'Eliézer Silveira');
});

test('Midweek Reconcile - computes diffs accurately (insert, update, clear, noop)', () => {
  const weekId = '2026-11-02';
  const rvmSchedule = {
    weekId,
    weekDisplay: '02/11/2026 a 08/11/2026',
    isPublished: true,
    slots: {
      chairman: {
        partTitle: 'Presidente',
        partType: 'Presidente',
        section: 'core',
        role: 'Titular' as const,
        assigneeName: 'Renato Oliveira',
        assigneeHgId: 2491349,
        rvmPartId: 'p-1',
        status: 'DESIGNADA'
      },
      openprayer: null, // Removed in RVM -> must clear in HG
      closeprayer: {
        partTitle: 'Oração Final',
        partType: 'Oração Final',
        section: 'core',
        role: 'Titular' as const,
        assigneeName: 'Eliézer Silveira',
        assigneeHgId: 3296266,
        rvmPartId: 'p-3',
        status: 'DESIGNADA'
      }
    }
  };

  const hgCurrent: HgWeekScheduleCurrent = {
    weekId,
    chairman: 0, // was empty in HG -> should insert
    openprayer: 3331181, // was Daniel in HG -> should clear
    closeprayer: 3296266 // already Eliézer -> noop
  };

  const knownPublishers = new Map<number, string>([
    [3331181, 'Daniel Figueiredo'],
    [2491349, 'Renato Oliveira'],
    [3296266, 'Eliézer Silveira']
  ]);

  const diffs = computeMidweekDiff(rvmSchedule, hgCurrent, knownPublishers);

  const chairmanDiff = diffs.find(d => d.slotKey === 'chairman');
  assert.equal(chairmanDiff?.action, 'insert');
  assert.equal(chairmanDiff?.newAssignee?.hgId, 2491349);

  const openPrayerDiff = diffs.find(d => d.slotKey === 'openprayer');
  assert.equal(openPrayerDiff?.action, 'clear');
  assert.equal(openPrayerDiff?.previousAssignee?.name, 'Daniel Figueiredo');

  const closePrayerDiff = diffs.find(d => d.slotKey === 'closeprayer');
  assert.equal(closePrayerDiff?.action, 'noop');
});
