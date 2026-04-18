import type { Publisher } from '../types';

interface PublisherDirectoryDependencies {
    apiClient: {
        loadPublishers: () => Promise<Publisher[]>;
    };
}

export function createPublisherDirectoryService(dependencies: PublisherDirectoryDependencies) {
    return {
        loadAllPublishers() {
            return dependencies.apiClient.loadPublishers();
        },
    };
}