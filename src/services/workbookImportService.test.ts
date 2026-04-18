import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkbookBatch } from '../types';
import type { WorkbookExcelRow } from './workbookService';
import { createWorkbookImportService } from './workbookImportServiceCore';

test('importBatch delegates workbook batch creation with the received file name and rows', async () => {
    const rows = [{ weekDisplay: '1-7 de Maio' }] as WorkbookExcelRow[];
    const service = createWorkbookImportService({
        workbookClient: {
            createBatch: async (fileName, nextRows) => {
                assert.equal(fileName, 'jw.org — 1-7 de Maio');
                assert.equal(nextRows, rows);
                return { id: 'batch-1' } as WorkbookBatch;
            },
        },
    });

    const batch = await service.importBatch('jw.org — 1-7 de Maio', rows);

    assert.equal(batch.id, 'batch-1');
});