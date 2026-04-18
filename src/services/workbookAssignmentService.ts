import { workbookService } from './workbookService';
import { createWorkbookAssignmentService } from './workbookAssignmentServiceCore';

export const workbookAssignmentService = createWorkbookAssignmentService({
    workbookClient: workbookService,
});