import { specialEventService } from './specialEventService';
import { workbookQueryService } from './workbookQueryService';
import { createSpecialEventManagementService } from './specialEventManagementServiceCore';

export const specialEventManagementService = createSpecialEventManagementService({
    specialEventClient: specialEventService,
    workbookReader: {
        getWeekParts: workbookQueryService.getWeekParts,
    },
});