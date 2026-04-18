import test from 'node:test';
import assert from 'node:assert/strict';
import type { SpecialEvent } from '../types';
import { createSpecialEventQueryService } from './specialEventQueryServiceCore';

test('getAppliedWeekEvents filters the raw week events down to applied ones', async () => {
    const service = createSpecialEventQueryService({
        specialEventClient: {
            getEventsByWeek: async weekId => {
                assert.equal(weekId, '2026-05-08');
                return [
                    { id: 'event-1', week: weekId, templateId: 'anuncio', isApplied: true } as SpecialEvent,
                    { id: 'event-2', week: weekId, templateId: 'notificacao', isApplied: false } as SpecialEvent,
                ];
            },
        },
    });

    const events = await service.getAppliedWeekEvents('2026-05-08');

    assert.deepEqual(events.map(event => event.id), ['event-1']);
});