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

import { isFieldActuallyChanged } from './publisherHistoryService';

/**
 * True se algum campo rastreado mudou realmente de valor semântico entre prev e next.
 * Usa verificação semântica rigorosa para evitar falsos positivos (null vs false, null vs "").
 */
export function profileChanged(
    prev: Publisher | undefined | null,
    next: Publisher | undefined | null,
): boolean {
    if (!prev || !next) return !!(prev || next);
    const prevObj = prev as unknown as Record<string, unknown>;
    const nextObj = next as unknown as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(prevObj), ...Object.keys(nextObj)]);

    for (const k of allKeys) {
        if (
            k === 'availability' ||
            k === 'availabilityMeta' ||
            k === 'profileMeta' ||
            k === 'updatedAt' ||
            k === 'updatedBy' ||
            k === 'id'
        ) {
            continue;
        }
        if (isFieldActuallyChanged(k, prevObj[k], nextObj[k])) {
            return true;
        }
    }
    return false;
}
