import { workbookService } from './workbookService';
import { createWorkbookLifecycleService } from './workbookLifecycleServiceCore';

export const workbookLifecycleService = createWorkbookLifecycleService({
    workbookClient: workbookService,
});