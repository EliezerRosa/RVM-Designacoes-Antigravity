import test from 'node:test';
import assert from 'node:assert/strict';
import type { Publisher } from '../types';
import { createPublisherMutationService } from './publisherMutationServiceCore';

const basePublisher: Publisher = {
    id: 'publisher-1',
    name: 'João Silva',
    gender: 'brother',
    condition: 'Publicador',
    funcao: null,
    phone: '11999999999',
    isBaptized: true,
    isServing: true,
    ageGroup: 'Adulto',
    parentIds: [],
    isHelperOnly: false,
    canPairWithNonParent: true,
    privileges: {
        canGiveTalks: false,
        canGiveStudentTalks: true,
        canConductCBS: false,
        canReadCBS: false,
        canPray: true,
        canPreside: false,
    },
    privilegesBySection: {
        canParticipateInTreasures: true,
        canParticipateInMinistry: true,
        canParticipateInLife: true,
    },
    availability: {
        mode: 'always',
        exceptionDates: [],
        availableDates: [],
    },
    aliases: [],
};

test('previewSavePublisher returns deterministic rename impact counts', async () => {
    const service = createPublisherMutationService({
        apiClient: {
            createPublisher: async publisher => publisher,
            updatePublisher: async publisher => publisher,
        },
        workbookClient: {
            propagateNameChange: async () => 0,
        },
        countPublisherNameImpacts: async oldName => {
            assert.equal(oldName, 'João Silva');
            return { resolvedParts: 2, rawParts: 3 };
        },
    });

    const preview = await service.previewSavePublisher(
        { ...basePublisher, name: 'João Pereira', phone: '11888888888' },
        basePublisher
    );

    assert.equal(preview.operation, 'update');
    assert.equal(preview.renamed, true);
    assert.deepEqual(preview.renameImpact, {
        resolvedParts: 2,
        rawParts: 3,
        totalParts: 5,
    });
    assert.ok(preview.changedFields.includes('name'));
    assert.ok(preview.changedFields.includes('phone'));
});

test('savePublisherWithPropagation updates publisher and propagates rename once', async () => {
    const calls: Array<{ oldName: string; newName: string }> = [];
    const service = createPublisherMutationService({
        apiClient: {
            createPublisher: async publisher => publisher,
            updatePublisher: async publisher => ({ ...publisher, phone: '11777777777' }),
        },
        workbookClient: {
            propagateNameChange: async (oldName, newName) => {
                calls.push({ oldName, newName });
                return 4;
            },
        },
        countPublisherNameImpacts: async () => ({ resolvedParts: 0, rawParts: 0 }),
    });

    const result = await service.savePublisherWithPropagation(
        { ...basePublisher, name: 'João Pereira' },
        basePublisher
    );

    assert.equal(result.operation, 'update');
    assert.equal(result.renamed, true);
    assert.equal(result.propagatedParts, 4);
    assert.equal(result.publisher.phone, '11777777777');
    assert.deepEqual(calls, [{ oldName: 'João Silva', newName: 'João Pereira' }]);
});