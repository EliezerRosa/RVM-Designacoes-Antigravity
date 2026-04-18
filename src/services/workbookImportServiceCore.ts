import type { WorkbookBatch } from '../types';
import type { WorkbookExcelRow } from './workbookService';

interface WorkbookImportDependencies {
    workbookClient: {
        createBatch: (fileName: string, parts: WorkbookExcelRow[]) => Promise<WorkbookBatch>;
    };
}

export function createWorkbookImportService(dependencies: WorkbookImportDependencies) {
    return {
        importBatch(fileName: string, parts: WorkbookExcelRow[]) {
            return dependencies.workbookClient.createBatch(fileName, parts);
        },
    };
}