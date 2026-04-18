import type { SpecialEvent } from '../types';

interface SpecialEventQueryDependencies {
    specialEventClient: {
        getEventsByWeek: (weekId: string) => Promise<SpecialEvent[]>;
    };
}

export function createSpecialEventQueryService(dependencies: SpecialEventQueryDependencies) {
    return {
        getWeekEvents(weekId: string) {
            return dependencies.specialEventClient.getEventsByWeek(weekId);
        },

        async getAppliedWeekEvents(weekId: string) {
            const events = await dependencies.specialEventClient.getEventsByWeek(weekId);
            return events.filter(event => event.isApplied);
        },
    };
}