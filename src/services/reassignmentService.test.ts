import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkbookPart } from '../test/factories';
import type { Publisher } from '../types';
import { consultReassignmentSuggestion } from './reassignmentService';

function buildPublisher(overrides: Partial<Publisher> = {}): Publisher {
    return {
        id: 'pub-1',
        name: 'Carlos Dias',
        gender: 'brother',
        condition: 'Ancião',
        funcao: null,
        phone: '',
        isBaptized: true,
        isServing: true,
        ageGroup: 'Adulto',
        parentIds: [],
        isHelperOnly: false,
        canPairWithNonParent: true,
        privileges: { canPreside: true, canPray: true } as any,
        privilegesBySection: {} as any,
        availability: {
            mode: 'always',
            availableDates: [],
            exceptionDates: [],
        } as any,
        aliases: [],
        ...overrides,
    };
}

test('consultReassignmentSuggestion returns the top eligible candidate for the target part only', async () => {
    const targetPart = buildWorkbookPart({
        id: 'part-1',
        weekId: '2026-06-08',
        weekDisplay: '08/06/2026',
        date: '2026-06-08',
        section: 'Início da Reunião',
        tipoParte: 'Presidente',
        modalidade: 'Presidência',
        tituloParte: 'Presidente',
        status: 'PENDENTE',
    });

    const competitor = buildPublisher({
        id: 'pub-2',
        name: 'Competidor Bloqueado',
        privileges: { canPreside: false, canPray: true } as any,
    });

    const ranked = await consultReassignmentSuggestion(
        targetPart,
        [targetPart],
        [buildPublisher(), competitor],
        [],
    );

    assert.equal(ranked.targetPart.id, 'part-1');
    assert.equal(ranked.selectedPublisher?.id, 'pub-1');
    assert.equal(ranked.rankedCandidates[0].publisher.id, 'pub-1');
    assert.equal(ranked.rankedCandidates.some(candidate => candidate.publisher.id === 'pub-2'), false);
});