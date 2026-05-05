import type { Publisher } from '../types';

/**
 * Author context for availability changes.
 * - 'admin_app': edição via formulário admin
 * - 'admin_agent': edição via agente IA
 * - 'publisher_portal': portal anônimo (NUNCA passa por aqui — usa RPC dedicada)
 * - 'system': operação do motor / migração
 */
export type AvailabilitySource = 'admin_app' | 'admin_agent' | 'system';

export interface AvailabilityAuthor {
    source: AvailabilitySource;
    authorLabel: string;
    authorId?: string | null;
}

let current: AvailabilityAuthor = {
    source: 'admin_app',
    authorLabel: 'Admin',
    authorId: null,
};

export function setAvailabilityAuthor(author: AvailabilityAuthor) {
    current = { ...author };
}

export function getAvailabilityAuthor(): AvailabilityAuthor {
    return { ...current };
}

/**
 * Executa fn substituindo temporariamente o author. Garante restauração mesmo
 * em caso de exceção. Use para wrapping curto (ex.: agente, motor).
 */
export async function withAvailabilityAuthor<T>(author: AvailabilityAuthor, fn: () => Promise<T>): Promise<T> {
    const previous = current;
    current = { ...author };
    try {
        return await fn();
    } finally {
        current = previous;
    }
}

/**
 * True se as duas availability são equivalentes em conteúdo (mode + datas).
 */
export function availabilityChanged(
    oldAvail: Publisher['availability'] | undefined | null,
    newAvail: Publisher['availability'] | undefined | null,
): boolean {
    const norm = (a: Publisher['availability'] | undefined | null) => ({
        mode: a?.mode ?? 'always',
        ex: [...(a?.exceptionDates ?? [])].sort().join(','),
        av: [...(a?.availableDates ?? [])].sort().join(','),
    });
    const a = norm(oldAvail);
    const b = norm(newAvail);
    return a.mode !== b.mode || a.ex !== b.ex || a.av !== b.av;
}
