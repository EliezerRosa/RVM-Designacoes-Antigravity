import test from 'node:test';
import assert from 'node:assert/strict';
import type { Publisher } from '../types';
import {
    buildUpcomingAssignmentsSummary,
} from './publisherUpcomingAssignmentsService';

test('buildUpcomingAssignmentsSummary - returns null when publisher has less than 2 published parts', async () => {
    // Test with dummy publisher id that has no parts in DB
    const dummyPublisher: Publisher = {
        id: 'non-existent-pub-999',
        name: 'Publicador Teste Inexistente',
        gender: 'brother',
        condition: 'Publicador',
        funcao: null,
        phone: '5511999999999',
        isBaptized: true,
        isServing: true,
        ageGroup: 'Adulto',
        parentIds: [],
        isHelperOnly: false,
        canPairWithNonParent: true,
        privileges: {
            canGiveTalks: false,
            canConductCBS: false,
            canReadCBS: false,
            canPray: false,
            canPreside: false,
        },
        privilegesBySection: {
            canParticipateInTreasures: false,
            canParticipateInMinistry: true,
            canParticipateInLife: false,
        },
        availability: { mode: 'always', exceptionDates: [], availableDates: [] },
        aliases: [],
    };

    const result = await buildUpcomingAssignmentsSummary(dummyPublisher.id, [dummyPublisher]);
    assert.equal(result, null, 'Deve retornar null quando houver menos que 2 designações');
});
