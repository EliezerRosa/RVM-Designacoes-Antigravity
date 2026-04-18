import { api } from './api';
import { createPublisherDirectoryService } from './publisherDirectoryServiceCore';

export const publisherDirectoryService = createPublisherDirectoryService({
    apiClient: api,
});