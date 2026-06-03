import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkbookStatus } from '../types';
import { buildWorkbookPart } from '../test/factories';
import { shouldIncludePartForGeneration } from './generationService';

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