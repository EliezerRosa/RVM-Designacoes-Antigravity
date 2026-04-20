import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkbookPart } from '../types';
import { createWorkbookManagementService } from './workbookManagementServiceCore';
import { buildWorkbookPart } from '../test/factories';

const weekPartAssigned = buildWorkbookPart({
    id: 'week-part-1',
    weekId: '2026-05-01',
    weekDisplay: '01/05/2026',
    date: '2026-05-01',
    section: 'Tesouros',
    tipoParte: 'Joias Espirituais',
    modalidade: 'Discurso de Ensino',
    tituloParte: 'Tema 1',
    status: 'APROVADA',
    resolvedPublisherName: 'Carlos Dias',
}) as WorkbookPart;

const weekPartPending = {
    ...weekPartAssigned,
    id: 'week-part-2',
    seq: 2,
    resolvedPublisherName: '',
    status: 'PENDENTE',
} as WorkbookPart;

test('clearWeek resets only assigned parts to pending', async () => {
    const updates: Array<{ partId: string; updates: Record<string, unknown> }> = [];
    const service = createWorkbookManagementService({
        workbookClient: {
            getPartById: async () => null,
            updatePart: async (partId, nextUpdates) => {
                updates.push({ partId, updates: nextUpdates });
                return weekPartAssigned;
            },
            deletePart: async () => undefined,
            getPartsByWeekId: async () => [],
            updateWeekStatus: async () => undefined,
        },
    });

    const result = await service.clearWeek([weekPartAssigned, weekPartPending]);

    assert.equal(result.clearedCount, 1);
    assert.deepEqual(updates, [{
        partId: 'week-part-1',
        updates: { resolvedPublisherName: '', resolvedPublisherId: '', rawPublisherName: '', status: 'PENDENTE' },
    }]);
});

test('reimportWeek deletes existing parts before importing the new week data', async () => {
    const deleted: string[] = [];
    const service = createWorkbookManagementService({
        workbookClient: {
            getPartById: async () => null,
            updatePart: async () => weekPartAssigned,
            deletePart: async partId => {
                deleted.push(partId);
            },
            getPartsByWeekId: async () => [weekPartAssigned, weekPartPending],
            updateWeekStatus: async () => undefined,
        },
        importWeek: async weekDate => {
            assert.equal(weekDate.toISOString().slice(0, 10), '2026-05-01');
            return { success: true, totalParts: 9 };
        },
    });

    const result = await service.reimportWeek('2026-05-01');

    assert.deepEqual(deleted, ['week-part-1', 'week-part-2']);
    assert.equal(result.deletedCount, 2);
    assert.equal(result.importResult.success, true);
    assert.equal(result.importResult.totalParts, 9);
});