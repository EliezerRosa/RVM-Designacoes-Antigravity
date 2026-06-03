import type { Publisher } from '../types';

/**
 * Author context para mudanças de perfil de publicador (PublisherStatusForm).
 *  - 'admin_app': admin autenticado dentro do AdminDashboard.
 *  - 'admin_agent': agente IA agindo no admin.
 *  - 'publisher_form_portal': portal anônimo com token (CCA/SEC/SRVM/AjSRVM/SS).
 *  - 'system': operações do motor / migrações.
 *
 * Mesmo padrão de availabilityAuthor; ficam separados porque o domínio é distinto
 * (perfil estrutural vs. disponibilidade temporal).
 */
export type ProfileSource =
    | 'admin_app'
    | 'admin_agent'
    | 'publisher_form_portal'
    | 'system';

export interface ProfileAuthor {
    source: ProfileSource;
    authorLabel: string;
    authorId?: string | null;
    token?: string | null;
}

let current: ProfileAuthor = {
    source: 'admin_app',
    authorLabel: 'Admin',
    authorId: null,
    token: null,
};

export function setProfileAuthor(author: ProfileAuthor) {
    current = { ...author };
}

export function getProfileAuthor(): ProfileAuthor {
    return { ...current };
}

export async function withProfileAuthor<T>(author: ProfileAuthor, fn: () => Promise<T>): Promise<T> {
    const previous = current;
    current = { ...author };
    try {
        return await fn();
    } finally {
        current = previous;
    }
}

/**
 * Campos do Publisher cuja mudança queremos auditar.
 * Tudo que não está nessa lista é ignorado (ex.: availability é tratado em
 * outro fluxo, profileMeta é stamping da própria RPC).
 */
const TRACKED_KEYS: (keyof Publisher)[] = [
    'name', 'gender', 'status', 'active',
    'privileges', 'privilegesBySection', 'restrictions',
    'partner', 'family', 'familyHead', 'congregation',
    'phone', 'email', 'address',
] as unknown as (keyof Publisher)[];

/**
 * True se algum campo rastreado mudou entre prev e next.
 */
export function profileChanged(
    prev: Publisher | undefined | null,
    next: Publisher | undefined | null,
): boolean {
    if (!prev || !next) return !!(prev || next);
    for (const k of TRACKED_KEYS) {
        const a = JSON.stringify((prev as unknown as Record<string, unknown>)[k as string] ?? null);
        const b = JSON.stringify((next as unknown as Record<string, unknown>)[k as string] ?? null);
        if (a !== b) return true;
    }
    return false;
}
