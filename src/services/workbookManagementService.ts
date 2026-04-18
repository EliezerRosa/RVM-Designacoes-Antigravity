import { importWorkbookFromJwOrg } from './jwOrgService';
import { workbookService } from './workbookService';
import { createWorkbookManagementService } from './workbookManagementServiceCore';

export const workbookManagementService = createWorkbookManagementService({
    workbookClient: workbookService,
    importWeek: importWorkbookFromJwOrg,
});