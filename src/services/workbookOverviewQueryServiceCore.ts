import type { WorkbookPart, WorkbookStatus } from '../types';

interface WorkbookOverviewQueryDependencies {
    workbookClient: {
        getByStatus: (status: WorkbookStatus | WorkbookStatus[], minDate?: string) => Promise<WorkbookPart[]>;
        getAll: (filters?: Record<string, unknown>) => Promise<WorkbookPart[]>;
        getFutureStats: () => Promise<Record<string, number>>;
    };
}

export function createWorkbookOverviewQueryService(dependencies: WorkbookOverviewQueryDependencies) {
    return {
        getPartsByStatus(status: WorkbookStatus | WorkbookStatus[], minDate?: string) {
            return dependencies.workbookClient.getByStatus(status, minDate);
        },

        getAllParts(filters?: Record<string, unknown>) {
            return dependencies.workbookClient.getAll(filters);
        },

        getFutureStats() {
            return dependencies.workbookClient.getFutureStats();
        },
    };
}