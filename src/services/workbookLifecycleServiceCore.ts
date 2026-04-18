import type { WorkbookPart } from '../types';

interface WorkbookLifecycleDependencies {
    workbookClient: {
        approveProposal: (partId: string, elderId: string) => Promise<WorkbookPart>;
        rejectProposal: (partId: string, reason: string) => Promise<WorkbookPart>;
        markAsCompleted: (partIds: string[]) => Promise<void>;
        getPartById: (partId: string) => Promise<WorkbookPart | null>;
        undoCompletion: (partId: string) => Promise<WorkbookPart>;
    };
}

export function createWorkbookLifecycleService(dependencies: WorkbookLifecycleDependencies) {
    return {
        approveProposal(partId: string, elderId: string) {
            return dependencies.workbookClient.approveProposal(partId, elderId);
        },

        rejectProposal(partId: string, reason: string) {
            return dependencies.workbookClient.rejectProposal(partId, reason);
        },

        async completePart(partId: string) {
            await dependencies.workbookClient.markAsCompleted([partId]);
            return dependencies.workbookClient.getPartById(partId);
        },

        completeParts(partIds: string[]) {
            return dependencies.workbookClient.markAsCompleted(partIds);
        },

        undoCompletePart(partId: string) {
            return dependencies.workbookClient.undoCompletion(partId);
        },
    };
}