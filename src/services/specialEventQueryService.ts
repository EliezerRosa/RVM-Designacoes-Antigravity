import { specialEventService } from './specialEventService';
import { createSpecialEventQueryService } from './specialEventQueryServiceCore';

export const specialEventQueryService = createSpecialEventQueryService({
    specialEventClient: specialEventService,
});