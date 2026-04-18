import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkbookPart } from '../types';
import { createWorkbookLifecycleService } from './workbookLifecycleServiceCore';
import { buildWorkbookPart } from '../test/factories';

const samplePart: WorkbookPart = buildWorkbookPart({
    id: 'part-1',
    weekId: '2026-04-24',
    weekDisplay: '24/04/2026',
    date: '2026-04-24',
    section: 'Tesouros da Palavra de Deus',
    tipoParte: 'Joias Espirituais',
    modalidade: 'Discurso de Ensino',
    tituloParte: 'Tema teste',
    status: 'APROVADA',
    resolvedPublisherName: 'Carlos Dias',
}) as WorkbookPart;

test('approveProposal delegates to the workbook boundary', async () => {
    const calls: Array<{ partId: string; elderId: string }> = [];
    const service = createWorkbookLifecycleService({
        workbookClient: {
            approveProposal: async (partId, elderId) => {
                calls.push({ partId, elderId });
                return samplePart;
            },
            rejectProposal: async () => samplePart,
            markAsCompleted: async () => undefined,
            getPartById: async () => samplePart,
            undoCompletion: async () => samplePart,
        },
    });

    const result = await service.approveProposal('part-1', 'elder-1');

    assert.equal(result.id, 'part-1');
    assert.deepEqual(calls, [{ partId: 'part-1', elderId: 'elder-1' }]);
});

test('completePart marks completed and reloads the updated part', async () => {
    const completeCalls: string[][] = [];
    const loadCalls: string[] = [];
    const completedPart = { ...samplePart, status: 'CONCLUIDA', completedAt: '2026-04-24T10:00:00Z' } as WorkbookPart;
    const service = createWorkbookLifecycleService({
        workbookClient: {
            approveProposal: async () => samplePart,
            rejectProposal: async () => samplePart,
            markAsCompleted: async partIds => {
                completeCalls.push(partIds);
            },
            getPartById: async partId => {
                loadCalls.push(partId);
                return completedPart;
            },
            undoCompletion: async () => samplePart,
        },
    });

    const result = await service.completePart('part-1');

    assert.deepEqual(completeCalls, [['part-1']]);
    assert.deepEqual(loadCalls, ['part-1']);
    assert.equal(result?.status, 'CONCLUIDA');
});