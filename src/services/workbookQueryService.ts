import { workbookService } from './workbookService';
import { createWorkbookQueryService } from './workbookQueryServiceCore';

export const workbookQueryService = createWorkbookQueryService({
    workbookClient: workbookService,
});