import { api } from './api';
import { createPublisherAvailabilityService } from './publisherAvailabilityServiceCore';

export type { UpdateAvailabilityResult } from './publisherAvailabilityServiceCore';

export const publisherAvailabilityService = createPublisherAvailabilityService({
    apiClient: api,
});