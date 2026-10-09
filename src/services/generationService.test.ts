import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkbookStatus } from '../types';
import { buildWorkbookPart } from '../test/factories';
import { shouldIncludePartForGeneration, excludeRegeneratedFromHistory, buildSyntheticHistoryRecord } from './generationService';

const requestedWeek = '2026-06-15';
const today = new Date('2026-06-01T12:00:00');

test('requested weeks form a hard boundary for cleanup parts from other weeks', () => {
    const parts = [
        buildWorkbookPart({
            id: 'cleanup-other-week',
            weekId: '2026-06-08',
            weekDisplay: '08/06/2026',
            date: '2026-06-08',
            tipoParte: 'Oração Inicial',
            modalidade: 'Oração',
            tituloParte: 'Oração Inicial',
            status: WorkbookStatus.DESIGNADA,
            resolvedPublisherName: 'Edmardo Queiroz',
            rawPublisherName: 'Edmardo Queiroz',
        }),
        buildWorkbookPart({
            id: 'requested-week-part',
            weekId: requestedWeek,
            weekDisplay: '15/06/2026',
            date: '2026-06-15',
            tipoParte: 'Presidente',
            modalidade: 'Presidência',
            tituloParte: 'Presidente',
            status: WorkbookStatus.PENDENTE,
        }),
    ];

    const selected = parts
        .filter(part => shouldIncludePartForGeneration(part, [], today, { isDryRun: false, generationWeeks: [requestedWeek] }))
        .map(part => part.id);

    assert.deepEqual(selected, ['requested-week-part']);
});

test('cleanup parts inside the requested week remain eligible for cleanup', () => {
    const cleanupInsideRequestedWeek = buildWorkbookPart({
        id: 'cleanup-requested-week',
        weekId: requestedWeek,
        weekDisplay: '15/06/2026',
        date: '2026-06-15',
        tipoParte: 'Oração Inicial',
        modalidade: 'Oração',
        tituloParte: 'Oração Inicial',
        status: WorkbookStatus.DESIGNADA,
        resolvedPublisherName: 'Edmardo Queiroz',
        rawPublisherName: 'Edmardo Queiroz',
    });

    const include = shouldIncludePartForGeneration(
        cleanupInsideRequestedWeek,
        [],
        today,
        { isDryRun: false, generationWeeks: [requestedWeek] },
    );

    assert.equal(include, true);
});

test('excludeRegeneratedFromHistory remove só as partes do escopo, preservando a mesma semana fora dele', () => {
    const regen = buildWorkbookPart({ id: 'p-regen', weekId: requestedWeek, date: requestedWeek });
    const kept = buildWorkbookPart({ id: 'p-kept', weekId: requestedWeek, date: requestedWeek, tipoParte: 'Dirigente EBC' });
    const history = [regen, kept].map(p => ({ ...buildSyntheticHistoryRecord(p, { id: '1', name: 'A' }), id: p.id }));

    const filtered = excludeRegeneratedFromHistory(history, [regen]);

    assert.deepEqual(filtered.map(h => h.id), ['p-kept']);
});

test('buildSyntheticHistoryRecord carrega resolvedPublisherId e omite para pré-designação', () => {
    const part = buildWorkbookPart({ id: 'p-1', funcao: 'Ajudante' });

    const withId = buildSyntheticHistoryRecord(part, { id: '42', name: 'Fulano' });
    assert.equal(withId.resolvedPublisherId, '42');
    assert.equal(withId.resolvedPublisherName, 'Fulano');
    assert.equal(withId.funcao, 'Ajudante');
    assert.equal(withId.importSource, 'AUTO_INJECTED');

    const preassigned = buildSyntheticHistoryRecord(part, { id: 'preassigned', name: 'Beltrano' });
    assert.equal(preassigned.resolvedPublisherId, undefined);
});