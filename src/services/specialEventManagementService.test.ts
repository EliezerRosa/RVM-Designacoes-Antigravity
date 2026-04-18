import test from 'node:test';
import assert from 'node:assert/strict';
import type { SpecialEvent, WorkbookPart } from '../types';
import { createSpecialEventManagementService } from './specialEventManagementServiceCore';
import { buildWorkbookPart } from '../test/factories';

const eventBase = {
    id: 'event-1',
    week: '2026-05-08',
    templateId: 'visit',
    isApplied: true,
} as SpecialEvent;

const weekPart = buildWorkbookPart({
    section: 'Vida Cristã',
    tipoParte: 'Necessidades Locais',
    modalidade: 'Necessidades Locais',
    tituloParte: 'Tema',
}) as WorkbookPart;

test('createAndApply applies impact using week parts from the workbook reader', async () => {
    const service = createSpecialEventManagementService({
        specialEventClient: {
            createEvent: async () => eventBase,
            applyEventImpact: async (_event, partIds) => {
                assert.deepEqual(partIds, ['part-1']);
                return { affected: 1 };
            },
            getAllEvents: async () => [],
            revertEventImpact: async () => undefined,
            deleteEvent: async () => undefined,
        },
        workbookReader: {
            getWeekParts: async weekId => {
                assert.equal(weekId, '2026-05-08');
                return [weekPart];
            },
        },
    });

    const result = await service.createAndApply({ week: '2026-05-08', templateId: 'visit' } as Omit<SpecialEvent, 'id'>);

    assert.equal(result.event.id, 'event-1');
    assert.equal(result.affected, 1);
});

test('deleteWithRevert reverts applied events before deleting them', async () => {
    const calls: string[] = [];
    const service = createSpecialEventManagementService({
        specialEventClient: {
            createEvent: async () => eventBase,
            applyEventImpact: async () => ({ affected: 0 }),
            getAllEvents: async () => [eventBase],
            revertEventImpact: async event => {
                calls.push(`revert:${event.id}`);
            },
            deleteEvent: async eventId => {
                calls.push(`delete:${eventId}`);
            },
        },
        workbookReader: {
            getWeekParts: async () => [],
        },
    });

    const result = await service.deleteWithRevert('event-1');

    assert.equal(result.reverted, true);
    assert.deepEqual(calls, ['revert:event-1', 'delete:event-1']);
});