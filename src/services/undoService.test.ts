import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkbookPart } from '../types';
import { createUndoService } from './undoServiceCore';
import { buildWorkbookPart } from '../test/factories';

const snapshotPart = buildWorkbookPart({ section: 'Tesouros', modalidade: 'Discurso' }) as WorkbookPart;

test('undo restores captured part state through the workbook mutation boundary', async () => {
    const updates: Array<{ partId: string; updates: Record<string, unknown> }> = [];
    const undoService = createUndoService({
        idFactory: () => 'undo-1',
        clock: () => 123,
        workbookMutations: {
            updatePart: async (partId, nextUpdates) => {
                updates.push({ partId, updates: nextUpdates });
                return undefined;
            },
        },
    });

    undoService.captureSingle({ ...snapshotPart, resolvedPublisherName: 'Carlos Dias', status: 'APROVADA' } as WorkbookPart, 'Reverter teste');

    const result = await undoService.undo();

    assert.equal(result.success, true);
    assert.equal(result.description, 'Reverter teste');
    assert.deepEqual(updates, [{
        partId: 'part-1',
        updates: {
            resolvedPublisherName: 'Carlos Dias',
            status: 'APROVADA',
            tituloParte: 'Tema 1',
        },
    }]);
});

test('subscribe receives the canUndo state transitions', async () => {
    const states: Array<{ canUndo: boolean; description?: string }> = [];
    const undoService = createUndoService({
        workbookMutations: {
            updatePart: async () => undefined,
        },
    });

    const unsubscribe = undoService.subscribe((canUndo, description) => {
        states.push({ canUndo, description });
    });

    undoService.captureBatch([snapshotPart], 'Lote');
    await undoService.undo();
    unsubscribe();

    assert.deepEqual(states, [
        { canUndo: false, description: undefined },
        { canUndo: true, description: 'Lote' },
        { canUndo: false, description: undefined },
    ]);
});