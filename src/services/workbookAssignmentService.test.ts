import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkbookPart } from '../types';
import { createWorkbookAssignmentService } from './workbookAssignmentServiceCore';
import { buildWorkbookPart } from '../test/factories';

const assignedPart = buildWorkbookPart({
    id: 'part-assignment-1',
    weekId: '2026-04-24',
    weekDisplay: '24/04/2026',
    date: '2026-04-24',
    section: 'Faça Seu Melhor no Ministério',
    tipoParte: 'Parte de Estudante',
    modalidade: 'Demonstração',
    tituloParte: 'Primeira conversa',
    seq: 2,
    status: 'PROPOSTA',
    rawPublisherName: 'Carlos Dias',
    resolvedPublisherName: 'Carlos Dias',
    resolvedPublisherId: 'publisher-1',
}) as WorkbookPart;

test('assignPublisher delegates to workbook proposePublisher with the received identifiers', async () => {
    const calls: Array<{ partId: string; publisherName: string; publisherId?: string }> = [];
    const service = createWorkbookAssignmentService({
        workbookClient: {
            proposePublisher: async (partId, publisherName, publisherId) => {
                calls.push({ partId, publisherName, publisherId });
                return assignedPart;
            },
        },
    });

    const result = await service.assignPublisher('part-assignment-1', 'Carlos Dias', 'publisher-1');

    assert.equal(result.id, 'part-assignment-1');
    assert.deepEqual(calls, [{ partId: 'part-assignment-1', publisherName: 'Carlos Dias', publisherId: 'publisher-1' }]);
});