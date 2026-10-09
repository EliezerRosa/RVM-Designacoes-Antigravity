/**
 * permissionFilterCore.ts — Núcleo puro (sem Supabase) de filtragem de publicadores
 * por escopo de permissão (`dataAccessLevel` + `publisherFilters`).
 *
 * Usado pelo agente para que qualquer leitura de publicadores (FETCH_DATA,
 * QUERY_PUBLISHER_LIST, QUERY_PUBLISHER_PROFILE) respeite a policy resolvida,
 * mesmo quando o RLS já permite SELECT (editores não-admin com nível 'filtered').
 */

import type { DataAccessLevel, PublisherFilterCriteria } from './permissionService';

export interface PublisherAccessScope {
    isAdmin: boolean;
    accessLevel: DataAccessLevel;
    selfPublisherId: string | null;
    canSeeSensitiveData: boolean;
    filters: PublisherFilterCriteria;
}

/** Campos mínimos que um publicador precisa expor para ser filtrado. */
export interface PublisherLike {
    id: string;
    name: string;
    condition?: string | null;
    isServing?: boolean;
    isNotQualified?: boolean;
    isIndefinitelyPaused?: boolean;
}

/** Campos pastorais que só `canSeeSensitiveData` pode ler. */
export const SENSITIVE_PUBLISHER_FIELDS = [
    'notQualifiedReason',
    'noParticipationReason',
    'indefinitePauseReason',
] as const;

const normalize = (value: unknown): string =>
    String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const STATUS_ALIASES: Record<string, (p: PublisherLike) => boolean> = {
    active: p => p.isServing !== false,
    ativo: p => p.isServing !== false,
    ativos: p => p.isServing !== false,
    inactive: p => p.isServing === false,
    inativo: p => p.isServing === false,
    inativos: p => p.isServing === false,
    qualified: p => !p.isNotQualified && !p.isIndefinitelyPaused,
    apto: p => !p.isNotQualified && !p.isIndefinitelyPaused,
    aptos: p => !p.isNotQualified && !p.isIndefinitelyPaused,
    unqualified: p => Boolean(p.isNotQualified || p.isIndefinitelyPaused),
    inapto: p => Boolean(p.isNotQualified || p.isIndefinitelyPaused),
    inaptos: p => Boolean(p.isNotQualified || p.isIndefinitelyPaused),
};

function matchesStatuses(publisher: PublisherLike, statuses: string[]): boolean {
    const predicates = statuses.map(s => STATUS_ALIASES[normalize(s)]).filter(Boolean);
    // Status desconhecido não é critério válido → não restringe por si só
    if (predicates.length === 0) return true;
    return predicates.some(pred => pred!(publisher));
}

/**
 * Decide se um publicador é visível no escopo.
 * - admin ou 'all' → tudo
 * - 'self' → apenas o próprio registro
 * - 'filtered' → aplica conditions / statuses / excludeNames quando definidos
 */
export function isPublisherVisibleInScope(publisher: PublisherLike, scope: PublisherAccessScope): boolean {
    if (scope.isAdmin || scope.accessLevel === 'all') return true;

    if (scope.accessLevel === 'self') {
        return scope.selfPublisherId !== null && publisher.id === scope.selfPublisherId;
    }

    const { conditions, statuses, excludeNames } = scope.filters;

    if (conditions && conditions.length > 0) {
        const wanted = new Set(conditions.map(normalize));
        if (!wanted.has(normalize(publisher.condition))) return false;
    }

    if (statuses && statuses.length > 0 && !matchesStatuses(publisher, statuses)) {
        return false;
    }

    if (excludeNames && excludeNames.length > 0) {
        const excluded = new Set(excludeNames.map(normalize));
        if (excluded.has(normalize(publisher.name))) return false;
    }

    return true;
}

export function filterPublishersByScope<T extends PublisherLike>(publishers: T[], scope: PublisherAccessScope): T[] {
    return publishers.filter(p => isPublisherVisibleInScope(p, scope));
}

/** Remove campos pastorais quando o escopo não autoriza dados sensíveis. */
export function redactSensitivePublisherFields<T extends object>(publisher: T, scope: PublisherAccessScope): T {
    if (scope.isAdmin || scope.canSeeSensitiveData) return publisher;
    const copy: Record<string, unknown> = { ...(publisher as Record<string, unknown>) };
    for (const field of SENSITIVE_PUBLISHER_FIELDS) {
        if (field in copy) delete copy[field];
    }
    return copy as T;
}

export function filterAndRedactPublishers<T extends PublisherLike>(publishers: T[], scope: PublisherAccessScope): T[] {
    return filterPublishersByScope(publishers, scope).map(p => redactSensitivePublisherFields(p, scope));
}

/**
 * Linhas cruas da tabela `publishers` (shape `{ id, data: {...} }`) retornadas
 * por FETCH_DATA. O filtro lê os campos dentro de `data`.
 */
export interface PublisherRowLike {
    id: string;
    data?: Record<string, unknown> | null;
}

export function filterPublisherRowsByScope<T extends PublisherRowLike>(rows: T[], scope: PublisherAccessScope): T[] {
    return rows
        .filter(row => {
            const d = row.data ?? {};
            return isPublisherVisibleInScope({
                id: String(row.id),
                name: String(d.name ?? ''),
                condition: (d.condition as string | undefined) ?? null,
                isServing: d.isServing as boolean | undefined,
                isNotQualified: d.isNotQualified as boolean | undefined,
                isIndefinitelyPaused: d.isIndefinitelyPaused as boolean | undefined,
            }, scope);
        })
        .map(row => {
            if (!row.data || scope.isAdmin || scope.canSeeSensitiveData) return row;
            return { ...row, data: redactSensitivePublisherFields(row.data, scope) };
        });
}
