import type { WorkbookPart, WorkbookStatus } from '../types';

interface WorkbookManagementDependencies {
    workbookClient: {
        getPartById: (partId: string) => Promise<WorkbookPart | null>;
        updatePart: (partId: string, updates: Record<string, unknown>) => Promise<WorkbookPart>;
        deletePart: (partId: string) => Promise<void>;
        getPartsByWeekId: (weekId: string) => Promise<WorkbookPart[]>;
        updateWeekStatus: (weekId: string, status: WorkbookStatus, clearPublisher?: boolean) => Promise<void>;
        batchClearParts?: (partIds: string[]) => Promise<number>;
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
            const assignedParts = weekParts.filter(p => p.resolvedPublisherName || p.resolvedPublisherId || p.rawPublisherName);
            if (assignedParts.length === 0) return { clearedCount: 0 };

            // Batch update: single DB call instead of N sequential calls
            if (dependencies.workbookClient.batchClearParts) {
                const clearedCount = await dependencies.workbookClient.batchClearParts(
                    assignedParts.map(p => p.id)
                );
                return { clearedCount };
            }

            // Fallback: sequential (for tests or clients without batch)
            for (const part of assignedParts) {
                await dependencies.workbookClient.updatePart(part.id, {
                    resolvedPublisherName: '',
                    resolvedPublisherId: '',
                    rawPublisherName: '',
                    status: 'PENDENTE',
                });
            }
            return { clearedCount: assignedParts.length };
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