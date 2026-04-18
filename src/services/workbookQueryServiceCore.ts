import type { WorkbookPart } from '../types';

interface WorkbookQueryDependencies {
    workbookClient: {
        getAll: (filters?: Record<string, unknown>, options?: { forceRefresh?: boolean }) => Promise<WorkbookPart[]>;
        getPartById: (partId: string) => Promise<WorkbookPart | null>;
        getPartsByWeekId: (weekId: string) => Promise<WorkbookPart[]>;
    };
}

export function createWorkbookQueryService(dependencies: WorkbookQueryDependencies) {
    return {
        getAllParts(filters?: Record<string, unknown>, options?: { forceRefresh?: boolean }) {
            return dependencies.workbookClient.getAll(filters, options);
        },

        getPart(partId: string) {
            return dependencies.workbookClient.getPartById(partId);
        },

        getWeekParts(weekId: string) {
            return dependencies.workbookClient.getPartsByWeekId(weekId);
        },
    };
}