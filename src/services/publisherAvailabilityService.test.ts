import test from 'node:test';
import assert from 'node:assert/strict';
import type { Publisher } from '../types';
import { createPublisherAvailabilityService } from './publisherAvailabilityServiceCore';

const basePublisher: Publisher = {
    id: 'publisher-availability-1',
    name: 'Carlos Dias',
    gender: 'brother',
    condition: 'Publicador',
    funcao: null,
    phone: '11911111111',
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
        exceptionDates: ['2026-04-24'],
        availableDates: [],
    },
    aliases: [],
};

test('updateAvailability merges dates without duplicating and persists the new publisher state', async () => {
    let persistedPublisher: Publisher | null = null;
    const service = createPublisherAvailabilityService({
        apiClient: {
            updatePublisher: async publisher => {
                persistedPublisher = publisher;
                return publisher;
            },
        },
    });

    const result = await service.updateAvailability(basePublisher, ['2026-04-24', '2026-05-01']);

    assert.deepEqual(result.addedDates, ['2026-05-01']);
    assert.equal(result.totalBlockedDates, 2);
    assert.notEqual(persistedPublisher, null);
    if (!persistedPublisher) {
        throw new Error('Expected publisher to be persisted.');
    }
    const persisted = persistedPublisher as Publisher;
    assert.deepEqual(persisted.availability.exceptionDates, ['2026-04-24', '2026-05-01']);
    assert.deepEqual(result.publisher.availability.exceptionDates, ['2026-04-24', '2026-05-01']);
});

test('replaceExceptionDates persists the exact blocked dates list', async () => {
    const service = createPublisherAvailabilityService({
        apiClient: {
            updatePublisher: async publisher => publisher,
        },
    });

    const result = await service.replaceExceptionDates(basePublisher, ['2026-06-01']);

    assert.deepEqual(result.publisher.availability.exceptionDates, ['2026-06-01']);
    assert.equal(result.totalBlockedDates, 1);
});