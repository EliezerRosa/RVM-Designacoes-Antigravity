interface WeekPartState {
    id?: string;
    status?: string;
    resolvedPublisherId?: string | null;
    resolvedPublisherName?: string | null;
    rawPublisherName?: string | null;
}

interface ResolveInitialAgentWeekParams {
    weekOrder: string[];
    weekParts: Record<string, WeekPartState[]>;
    todayWeekId: string;
    initialWeekId?: string;
    storedWeekId?: string | null;
}

const TERMINAL_WEEK_STATUSES = new Set(['CANCELADA', 'CONCLUIDA']);

function hasOperationalParts(parts: WeekPartState[] | undefined): boolean {
    return Boolean(parts?.some(part => !TERMINAL_WEEK_STATUSES.has(part.status || '')));
}

export function resolveInitialAgentWeekId({
    weekOrder,
    weekParts,
    todayWeekId,
    initialWeekId,
    storedWeekId,
}: ResolveInitialAgentWeekParams): string | null {
    if (weekOrder.length === 0) return null;

    const availableWeeks = new Set(weekOrder);
    if (initialWeekId && availableWeeks.has(initialWeekId)) return initialWeekId;

    if (
        storedWeekId &&
        availableWeeks.has(storedWeekId) &&
        storedWeekId >= todayWeekId &&
        hasOperationalParts(weekParts[storedWeekId])
    ) {
        return storedWeekId;
    }

    const currentOrNextOperational = weekOrder.find(weekId =>
        weekId >= todayWeekId && hasOperationalParts(weekParts[weekId])
    );
    if (currentOrNextOperational) return currentOrNextOperational;

    const currentOrNextImported = weekOrder.find(weekId => weekId >= todayWeekId);
    return currentOrNextImported || weekOrder[weekOrder.length - 1];
}

interface ResolveAgentActionStateParams {
    currentWeekId?: string;
    currentWeekParts: WeekPartState[];
    focusedPart?: WeekPartState | null;
    todayWeekId: string;
}

export function resolveAgentActionState({
    currentWeekId,
    currentWeekParts,
    focusedPart,
    todayWeekId,
}: ResolveAgentActionStateParams) {
    const isOperationalWeek = Boolean(currentWeekId && currentWeekId >= todayWeekId);
    const hasVacantParts = currentWeekParts.some(part =>
        part.status === 'PENDENTE' &&
        !part.resolvedPublisherId &&
        !part.resolvedPublisherName &&
        !part.rawPublisherName
    );
    const hasPublishableAssignments = currentWeekParts.some(part =>
        ['PROPOSTA', 'APROVADA', 'DESIGNADA'].includes(part.status || '') &&
        Boolean(part.resolvedPublisherId || part.resolvedPublisherName || part.rawPublisherName)
    );
    const canRankFocusedPart = Boolean(
        focusedPart && ['PENDENTE', 'PROPOSTA'].includes(focusedPart.status || '')
    );

    return {
        isOperationalWeek,
        hasVacantParts,
        hasPublishableAssignments,
        canRankFocusedPart,
    };
}