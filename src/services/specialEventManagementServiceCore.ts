import type { SpecialEvent, WorkbookPart } from '../types';

interface SpecialEventManagementDependencies {
    specialEventClient: {
        createEvent: (eventData: Omit<SpecialEvent, 'id'>) => Promise<SpecialEvent>;
        applyEventImpact: (event: SpecialEvent, partIds: string[]) => Promise<{ affected: number }>;
        getAllEvents: () => Promise<SpecialEvent[]>;
        revertEventImpact: (event: SpecialEvent) => Promise<unknown>;
        deleteEvent: (eventId: string) => Promise<void>;
    };
    workbookReader: {
        getWeekParts: (weekId: string) => Promise<WorkbookPart[]>;
    };
}

export function createSpecialEventManagementService(dependencies: SpecialEventManagementDependencies) {
    return {
        async createAndApply(eventData: Omit<SpecialEvent, 'id'>) {
            const week = String(eventData.week || '');
            const newEvent = await dependencies.specialEventClient.createEvent(eventData);
            const weekParts = week ? await dependencies.workbookReader.getWeekParts(week) : [];
            const partIds = weekParts.map(part => part.id);

            if (partIds.length === 0) {
                return {
                    event: newEvent,
                    affected: 0,
                };
            }

            const { affected } = await dependencies.specialEventClient.applyEventImpact(newEvent, partIds);
            return {
                event: newEvent,
                affected,
            };
        },

        async deleteWithRevert(eventId: string) {
            const allEvents = await dependencies.specialEventClient.getAllEvents();
            const eventToDelete = allEvents.find(event => event.id === eventId) || null;

            if (eventToDelete?.isApplied) {
                await dependencies.specialEventClient.revertEventImpact(eventToDelete);
            }

            await dependencies.specialEventClient.deleteEvent(eventId);

            return {
                event: eventToDelete,
                reverted: Boolean(eventToDelete?.isApplied),
            };
        },
    };
}