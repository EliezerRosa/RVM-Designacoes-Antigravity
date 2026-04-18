import type { Publisher } from '../types';

export interface UpdateAvailabilityResult {
    publisher: Publisher;
    addedDates: string[];
    totalBlockedDates: number;
}

interface PublisherAvailabilityDependencies {
    apiClient: {
        updatePublisher: (publisher: Publisher) => Promise<Publisher>;
    };
}

export function createPublisherAvailabilityService(dependencies: PublisherAvailabilityDependencies) {
    return {
        async updateAvailability(publisher: Publisher, unavailableDates: string[]): Promise<UpdateAvailabilityResult> {
            const existingDates = publisher.availability.exceptionDates || [];
            const mergedDates = [...new Set([...existingDates, ...unavailableDates])];
            const addedDates = unavailableDates.filter(date => !existingDates.includes(date));

            const updatedPublisher = {
                ...publisher,
                availability: {
                    ...publisher.availability,
                    exceptionDates: mergedDates,
                },
            };

            const persistedPublisher = await dependencies.apiClient.updatePublisher(updatedPublisher);

            return {
                publisher: persistedPublisher,
                addedDates,
                totalBlockedDates: mergedDates.length,
            };
        },

        async replaceExceptionDates(publisher: Publisher, exceptionDates: string[]): Promise<UpdateAvailabilityResult> {
            const updatedPublisher = {
                ...publisher,
                availability: {
                    ...publisher.availability,
                    exceptionDates: [...exceptionDates],
                },
            };

            const persistedPublisher = await dependencies.apiClient.updatePublisher(updatedPublisher);

            return {
                publisher: persistedPublisher,
                addedDates: [...exceptionDates],
                totalBlockedDates: exceptionDates.length,
            };
        }
    };
}