import test from 'node:test';
import assert from 'node:assert/strict';
import { findAvAssignmentForPublisher, AvAssignment } from './avScheduleService';

test('findAvAssignmentForPublisher - matches by publisher_id and weekId', () => {
    const assignments: AvAssignment[] = [
        {
            id: 1,
            hg_id: 100,
            publisher_id: 'pub-1',
            publisher_name: 'Irmão Console',
            date: '2026-11-23',
            type: 'console',
            label: 'Áudio / Som',
            slot: 0
        },
        {
            id: 2,
            hg_id: 200,
            publisher_id: 'pub-2',
            publisher_name: 'Irmão Mics',
            date: '2026-11-23',
            type: 'mics',
            label: 'Microfones',
            slot: 0
        }
    ];

    const match1 = findAvAssignmentForPublisher(assignments, 'pub-1', 'Irmão Console', '2026-11-23');
    assert.ok(match1);
    assert.equal(match1.label, 'Áudio / Som');

    const match2 = findAvAssignmentForPublisher(assignments, 'pub-2', 'Irmão Mics', '2026-11-23');
    assert.ok(match2);
    assert.equal(match2.label, 'Microfones');

    // Outra semana não deve casar
    const matchWrongWeek = findAvAssignmentForPublisher(assignments, 'pub-1', 'Irmão Console', '2026-11-30');
    assert.equal(matchWrongWeek, undefined);

    // Outro publicador não deve casar
    const matchWrongPub = findAvAssignmentForPublisher(assignments, 'pub-999', 'Outro Irmão', '2026-11-23');
    assert.equal(matchWrongPub, undefined);
});
