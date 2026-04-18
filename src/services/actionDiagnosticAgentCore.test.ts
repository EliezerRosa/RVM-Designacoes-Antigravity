import test from 'node:test';
import assert from 'node:assert/strict';
import type { Publisher, WorkbookPart } from '../types';
import { createActionDiagnosticAgentSupport } from './actionDiagnosticAgentCore';
import { buildWorkbookPart } from '../test/factories';

const assignedPart = buildWorkbookPart({
    id: 'part-assigned',
    section: 'Tesouros',
    modalidade: 'Discurso',
    status: 'APROVADA',
    resolvedPublisherName: 'Carlos Dias',
    resolvedPublisherId: 'pub-1',
}) as WorkbookPart;

const pendingPart = buildWorkbookPart({
    ...assignedPart,
    id: 'part-pending',
    seq: 2,
    resolvedPublisherName: '',
    resolvedPublisherId: undefined,
    status: 'PENDENTE',
    tipoParte: 'Primeira Conversa',
});

const publisher = {
    id: 'pub-1',
    name: 'Carlos Dias',
    gender: 'brother',
    availability: {
        exceptionDates: ['1999-01-01', '2026-05-08'],
    },
} as Publisher;

test('loadLiveFixtures uses publisher and workbook query boundaries to build runtime fixtures', async () => {
    let publisherLoads = 0;
    let workbookLoads = 0;

    const support = createActionDiagnosticAgentSupport({
        publisherDirectoryReader: {
            loadAllPublishers: async () => {
                publisherLoads += 1;
                return [publisher];
            },
        },
        workbookReader: {
            getAllParts: async () => {
                workbookLoads += 1;
                return [assignedPart, pendingPart];
            },
        },
        workbookMutations: {
            updatePart: async () => undefined,
        },
        publisherAvailabilityMutations: {
            replaceExceptionDates: async () => undefined,
        },
    });

    const fixtures = await support.loadLiveFixtures();

    assert.equal(publisherLoads, 1);
    assert.equal(workbookLoads, 1);
    assert.equal(fixtures.publishers.length, 1);
    assert.equal(fixtures.parts.length, 2);
    assert.equal(fixtures.history.length, 1);
    assert.equal(fixtures.firstWeekId, '2026-05-08');
    assert.equal(fixtures.firstPartWithAssignment?.id, 'part-assigned');
    assert.equal(fixtures.firstPartWithoutAssignment?.id, 'part-pending');
});

test('rollbackAssignedPart delegates to workbook management boundary with the original part state', async () => {
    const updates: Array<{ partId: string; updates: Record<string, unknown> }> = [];
    const support = createActionDiagnosticAgentSupport({
        publisherDirectoryReader: {
            loadAllPublishers: async () => [],
        },
        workbookReader: {
            getAllParts: async () => [],
        },
        workbookMutations: {
            updatePart: async (partId, nextUpdates) => {
                updates.push({ partId, updates: nextUpdates });
                return undefined;
            },
        },
        publisherAvailabilityMutations: {
            replaceExceptionDates: async () => undefined,
        },
    });

    await support.rollbackAssignedPart({ success: true, data: { partId: 'part-assigned' } }, assignedPart);

    assert.deepEqual(updates, [{
        partId: 'part-assigned',
        updates: {
            resolvedPublisherName: 'Carlos Dias',
            status: 'APROVADA',
        },
    }]);
});

test('rollbackAvailabilityDate delegates to publisher availability boundary after removing the test date', async () => {
    const persisted: Array<{ publisherName: string; dates: string[] }> = [];
    const support = createActionDiagnosticAgentSupport({
        publisherDirectoryReader: {
            loadAllPublishers: async () => [],
        },
        workbookReader: {
            getAllParts: async () => [],
        },
        workbookMutations: {
            updatePart: async () => undefined,
        },
        publisherAvailabilityMutations: {
            replaceExceptionDates: async (targetPublisher, dates) => {
                persisted.push({ publisherName: targetPublisher.name, dates });
                return undefined;
            },
        },
    });

    await support.rollbackAvailabilityDate('Carlos Dias', [publisher], '1999-01-01');

    assert.deepEqual(persisted, [{
        publisherName: 'Carlos Dias',
        dates: ['2026-05-08'],
    }]);
});