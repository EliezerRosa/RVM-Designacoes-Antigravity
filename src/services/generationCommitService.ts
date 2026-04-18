import { localNeedsService } from './localNeedsService';
import { workbookAssignmentService } from './workbookAssignmentService';
import { workbookManagementService } from './workbookManagementService';
import { createGenerationCommitService } from './generationCommitServiceCore';

export const generationCommitService = createGenerationCommitService({
    localNeedsClient: localNeedsService,
    workbookMutations: workbookManagementService,
    workbookAssignments: workbookAssignmentService,
});