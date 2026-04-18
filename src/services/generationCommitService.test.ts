import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkbookPart } from '../types';
import { createGenerationCommitService } from './generationCommitServiceCore';
import { buildWorkbookPart } from '../test/factories';

const basePart = buildWorkbookPart({
    section: 'Vida Cristã',
    tipoParte: 'Necessidades Locais',
    modalidade: 'Necessidades Locais',
    tituloParte: 'Tema',
}) as WorkbookPart;

test('commitGeneratedAssignment updates local needs title before proposing the publisher', async () => {
    const calls: string[] = [];
    const service = createGenerationCommitService({
        localNeedsClient: {
            assignToPart: async (preassignmentId, partId) => {
                calls.push(`localNeeds:${preassignmentId}:${partId}`);
            },
        },
        workbookMutations: {
            updatePart: async (_partId, updates) => {
                calls.push(`update:${String(updates.tituloParte)}`);
                return undefined;
            },
        },
        workbookAssignments: {
            assignPublisher: async (partId, publisherName, publisherId) => {
                calls.push(`assign:${partId}:${publisherName}:${publisherId}`);
                return undefined;
            },
        },
    });

    const result = await service.commitGeneratedAssignment({
        partId: 'part-1',
        part: basePart,
        publisher: { id: 'pub-1', name: 'Carlos Dias' },
        preassignmentId: 'pre-1',
        localNeedsTheme: 'Tema Especial',
    });

    assert.equal(result.mode, 'proposal');
    assert.deepEqual(calls, [
        'localNeeds:pre-1:part-1',
        'update:Necessidades Locais: Tema Especial',
        'assign:part-1:Carlos Dias:pub-1',
    ]);
});

test('commitGeneratedAssignment cleans non-designable parts through the workbook mutation boundary', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const service = createGenerationCommitService({
        localNeedsClient: {
            assignToPart: async () => undefined,
        },
        workbookMutations: {
            updatePart: async (_partId, nextUpdates) => {
                updates.push(nextUpdates);
                return undefined;
            },
        },
        workbookAssignments: {
            assignPublisher: async () => undefined,
        },
    });

    const result = await service.commitGeneratedAssignment({
        partId: 'part-1',
        part: { ...basePart, status: 'DESIGNADA', resolvedPublisherName: 'Nome Antigo' } as WorkbookPart,
        publisher: { id: 'CLEANUP', name: '' },
    });

    assert.equal(result.mode, 'cleanup');
    assert.deepEqual(updates, [{
        resolvedPublisherName: null,
        rawPublisherName: '',
        status: 'CONCLUIDA',
    }]);
});

test('commitGeneratedAssignment updates assigned parts directly when they are already finalized', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const service = createGenerationCommitService({
        localNeedsClient: {
            assignToPart: async () => undefined,
        },
        workbookMutations: {
            updatePart: async (_partId, nextUpdates) => {
                updates.push(nextUpdates);
                return undefined;
            },
        },
        workbookAssignments: {
            assignPublisher: async () => undefined,
        },
    });

    const result = await service.commitGeneratedAssignment({
        partId: 'part-1',
        part: { ...basePart, status: 'APROVADA' } as WorkbookPart,
        publisher: { id: 'pub-1', name: 'Carlos Dias' },
    });

    assert.equal(result.mode, 'direct-update');
    assert.deepEqual(updates, [{ resolvedPublisherName: 'Carlos Dias' }]);
});