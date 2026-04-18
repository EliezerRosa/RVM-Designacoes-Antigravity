import type { WorkbookPart } from '../types';

interface WorkbookAssignmentDependencies {
    workbookClient: {
        proposePublisher: (partId: string, publisherName: string, publisherId?: string) => Promise<WorkbookPart>;
    };
}

export function createWorkbookAssignmentService(dependencies: WorkbookAssignmentDependencies) {
    return {
        assignPublisher(partId: string, publisherName: string, publisherId?: string) {
            return dependencies.workbookClient.proposePublisher(partId, publisherName, publisherId);
        }
    };
}