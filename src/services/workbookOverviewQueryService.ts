import { workbookService } from './workbookService';
import { createWorkbookOverviewQueryService } from './workbookOverviewQueryServiceCore';

export const workbookOverviewQueryService = createWorkbookOverviewQueryService({
    workbookClient: workbookService,
});