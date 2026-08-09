import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAgentActionState, resolveInitialAgentWeekId } from './agentFocus';
import { getMeetingDateForWeek, hasMeetingOccurred } from './dateUtils';

const weekOrder = ['2026-01-05', '2026-08-03', '2026-08-10', '2026-08-17'];
const weekParts = {
    '2026-01-05': [{ status: 'CONCLUIDA' }],
    '2026-08-03': [{ status: 'CANCELADA' }],
    '2026-08-10': [{ status: 'DESIGNADA' }],
    '2026-08-17': [{ status: 'PENDENTE' }],
};

test('honors an explicit valid week even when it is historical', () => {
    assert.equal(resolveInitialAgentWeekId({
        weekOrder,
        weekParts,
        todayWeekId: '2026-08-03',
        initialWeekId: '2026-01-05',
    }), '2026-01-05');
});

test('keeps a stored current or future operational week', () => {
    assert.equal(resolveInitialAgentWeekId({
        weekOrder,
        weekParts,
        todayWeekId: '2026-08-03',
        storedWeekId: '2026-08-17',
    }), '2026-08-17');
});

test('ignores a stale historical preference and skips a terminal current week', () => {
    assert.equal(resolveInitialAgentWeekId({
        weekOrder,
        weekParts,
        todayWeekId: '2026-08-03',
        storedWeekId: '2026-01-05',
    }), '2026-08-10');
});

test('falls back to the newest imported week when no current or future week exists', () => {
    assert.equal(resolveInitialAgentWeekId({
        weekOrder: ['2026-01-05', '2026-01-12'],
        weekParts: {
            '2026-01-05': [{ status: 'CONCLUIDA' }],
            '2026-01-12': [{ status: 'CONCLUIDA' }],
        },
        todayWeekId: '2026-08-03',
    }), '2026-01-12');
});

test('resolves the configured meeting day from the week Monday', () => {
    assert.equal(getMeetingDateForWeek('2026-08-10', 5)?.toISOString().slice(0, 10), '2026-08-14');
});

test('only considers a meeting completed on a later calendar day', () => {
    assert.equal(hasMeetingOccurred('2026-08-10', 5, new Date(2026, 7, 14, 23, 0)), false);
    assert.equal(hasMeetingOccurred('2026-08-10', 5, new Date(2026, 7, 15, 0, 1)), true);
});

test('offers generation and publishing only from real week state', () => {
    const state = resolveAgentActionState({
        currentWeekId: '2026-08-10',
        todayWeekId: '2026-08-03',
        currentWeekParts: [
            { id: 'vacant', status: 'PENDENTE' },
            { id: 'assigned', status: 'PROPOSTA', resolvedPublisherId: 'publisher-1' },
        ],
        focusedPart: { id: 'vacant', status: 'PENDENTE' },
    });

    assert.deepEqual(state, {
        isOperationalWeek: true,
        hasVacantParts: true,
        hasPublishableAssignments: true,
        canRankFocusedPart: true,
    });
});

test('does not offer operational actions for terminal history', () => {
    const state = resolveAgentActionState({
        currentWeekId: '2026-01-05',
        todayWeekId: '2026-08-03',
        currentWeekParts: [{ id: 'done', status: 'CONCLUIDA', resolvedPublisherId: 'publisher-1' }],
        focusedPart: { id: 'done', status: 'CONCLUIDA' },
    });

    assert.deepEqual(state, {
        isOperationalWeek: false,
        hasVacantParts: false,
        hasPublishableAssignments: false,
        canRankFocusedPart: false,
    });
});