import type { WorkbookPart, WorkbookStatus } from '../types';

interface WorkbookManagementDependencies {
    workbookClient: {
        getPartById: (partId: string) => Promise<WorkbookPart | null>;
        updatePart: (partId: string, updates: Record<string, unknown>) => Promise<WorkbookPart>;
        deletePart: (partId: string) => Promise<void>;
        getPartsByWeekId: (weekId: string) => Promise<WorkbookPart[]>;
        updateWeekStatus: (weekId: string, status: WorkbookStatus, clearPublisher?: boolean) => Promise<void>;
    };
    importWeek?: (weekDate: Date) => Promise<{ success: boolean; error?: string; totalParts: number }>;
}

export function createWorkbookManagementService(dependencies: WorkbookManagementDependencies) {
    return {
        getPart(partId: string) {
            return dependencies.workbookClient.getPartById(partId);
        },

        updatePart(partId: string, updates: Record<string, unknown>) {
            return dependencies.workbookClient.updatePart(partId, updates);
        },

        async cancelPart(partId: string, reason: string) {
            return dependencies.workbookClient.updatePart(partId, {
                status: 'CANCELADA',
                cancelReason: reason,
            });
        },

        deletePart(partId: string) {
            return dependencies.workbookClient.deletePart(partId);
        },

        listWeekParts(weekId: string) {
            return dependencies.workbookClient.getPartsByWeekId(weekId);
        },

        async clearWeek(weekParts: WorkbookPart[]) {
            let clearedCount = 0;

            for (const part of weekParts) {
                if (part.resolvedPublisherName) {
                    await dependencies.workbookClient.updatePart(part.id, {
                        resolvedPublisherName: '',
                        status: 'PENDENTE',
                    });
                    clearedCount++;
                }
            }

            return { clearedCount };
        },

        async deleteWeek(weekId: string) {
            const weekParts = await dependencies.workbookClient.getPartsByWeekId(weekId);
            for (const part of weekParts) {
                await dependencies.workbookClient.deletePart(part.id);
            }
            return { deletedCount: weekParts.length, parts: weekParts };
        },

        cancelWeek(weekId: string) {
            return dependencies.workbookClient.updateWeekStatus(weekId, 'CANCELADA', true);
        },

        resetWeek(weekId: string) {
            return dependencies.workbookClient.updateWeekStatus(weekId, 'PENDENTE', true);
        },

        async reimportWeek(weekId: string) {
            const existingParts = await dependencies.workbookClient.getPartsByWeekId(weekId);
            for (const part of existingParts) {
                await dependencies.workbookClient.deletePart(part.id);
            }

            if (!dependencies.importWeek) {
                throw new Error('Importador de semanas não configurado para reimportação.');
            }

            const result = await dependencies.importWeek(new Date(`${weekId}T12:00:00`));
            return {
                deletedCount: existingParts.length,
                importResult: result,
            };
        },
    };
}