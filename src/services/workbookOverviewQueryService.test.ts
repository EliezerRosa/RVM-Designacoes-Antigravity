import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkbookPart } from '../types';
import { createWorkbookOverviewQueryService } from './workbookOverviewQueryServiceCore';

test('getPartsByStatus delegates status queries to the workbook client', async () => {
    const sample = [{ id: 'part-1' }] as WorkbookPart[];
    const service = createWorkbookOverviewQueryService({
        workbookClient: {
            getByStatus: async (status, minDate) => {
                assert.deepEqual(status, ['PROPOSTA', 'APROVADA']);
                assert.equal(minDate, '2026-05-05');
                return sample;
            },
            getAll: async () => [],
            getFutureStats: async () => ({}),
        },
    });

    const parts = await service.getPartsByStatus(['PROPOSTA', 'APROVADA'], '2026-05-05');

    assert.equal(parts, sample);
});