/**
 * permissionService.ts — Camada desacoplada de permissões
 * 
 * Single-fetch no login → cache em memória → consultas O(1)
 * Fallback seguro: se falhar, assume mínimo (agent only, READ only)
 */

import { supabase } from '../lib/supabase';
import type { AgentActionType } from './agentActionService';

// ===== Types =====

export type DataAccessLevel = 'all' | 'filtered' | 'self';
export type ActiveTab = 'workbook' | 'approvals' | 'publishers' | 'territories' | 'backup' | 'agent' | 'admin' | 'communication';

export interface PublisherFilterCriteria {
    conditions?: string[];
    statuses?: string[];
    excludeNames?: string[];
    accessLevel: DataAccessLevel;
}

export interface ResolvedPermissions {
    tabs: Set<ActiveTab>;
    agentActions: Set<string>;
    blockedActions: Set<string>;
    dataAccessLevel: DataAccessLevel;
    canSeeSensitiveData: boolean;
    canSeeAgentControlPanel: boolean;
    canSendZap: boolean;
    publisherFilters: PublisherFilterCriteria;
    isAdmin: boolean;
    resolvedAt: number;
}

export interface PermissionGate {
    canViewTab(tab: ActiveTab): boolean;
    canAgentAction(action: AgentActionType): boolean;
    canSeeSensitiveData(): boolean;
    canSeeAgentControlPanel(): boolean;
    canSendZap(): boolean;
    getAccessLevel(): 'elder' | 'publisher';
    getPublisherFilters(): PublisherFilterCriteria;
    getAllowedAgentActions(): AgentActionType[];
    isFullAdmin(): boolean;
    isLoaded(): boolean;
}

interface PermissionPolicy {
    id: string;
    target_condition: string | null;
    target_funcao: string | null;
    allowed_tabs: string[];
    allowed_agent_actions: string[];
    blocked_agent_actions: string[];
    data_access_level: DataAccessLevel;
    can_see_sensitive_data: boolean;
    publisher_filter_conditions: string[] | null;
    publisher_filter_statuses: string[] | null;
    publisher_filter_exclude_names: string[] | null;
    priority: number;
    is_active: boolean;
}

interface PermissionOverride {
    allowed_tabs: string[] | null;
    allowed_agent_actions: string[] | null;
    blocked_agent_actions: string[] | null;
    data_access_level: DataAccessLevel | null;
    can_see_sensitive_data: boolean | null;
    publisher_filter_conditions: string[] | null;
    publisher_filter_statuses: string[] | null;
    publisher_filter_exclude_names: string[] | null;
    is_active: boolean;
}

// ===== Constants =====

const ALL_TABS: ActiveTab[] = ['workbook', 'approvals', 'publishers', 'territories', 'backup', 'agent', 'admin', 'communication'];

/**
 * Ações do agent-chat que correspondem a funcionalidades exclusivas da aba Admin.
 * Mesmo que apareçam em allowed_agent_actions de uma policy/override (por engano),
 * não-admins jamais conseguem executá-las (`canAgentAction` retorna false).
 * Mantenha sincronizado com a aba Admin (`AdminDashboard`) e seus sub-painéis.
 */
export const ADMIN_ONLY_ACTIONS: ReadonlySet<AgentActionType> = new Set<AgentActionType>([
    'MANAGE_PERMISSIONS',
]);

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const FALLBACK_PERMISSIONS: ResolvedPermissions = {
    tabs: new Set<ActiveTab>(['agent']),
    agentActions: new Set(['CHECK_SCORE', 'EXPLAIN_PART', 'FETCH_DATA', 'GET_ANALYTICS', 'NAVIGATE_WEEK', 'VIEW_S140', 'SHOW_MODAL']),
    blockedActions: new Set(),
    dataAccessLevel: 'self',
    canSeeSensitiveData: false,
    canSeeAgentControlPanel: false,
    canSendZap: false,
    publisherFilters: { accessLevel: 'self' },
    isAdmin: false,
    resolvedAt: 0,
};

const FULL_ADMIN_PERMISSIONS: ResolvedPermissions = {
    tabs: new Set<ActiveTab>(ALL_TABS),
    agentActions: new Set<string>([
        'GENERATE_WEEK', 'ASSIGN_PART', 'APPROVE_PROPOSAL', 'REJECT_PROPOSAL', 'COMPLETE_PART', 'UNDO_COMPLETE_PART', 'UNDO_LAST', 'NAVIGATE_WEEK', 'VIEW_S140',
        'SHARE_S140_WHATSAPP', 'CHECK_SCORE', 'EXPLAIN_PART', 'CLEAR_WEEK', 'UPDATE_PUBLISHER',
        'UPDATE_AVAILABILITY', 'UPDATE_ENGINE_RULES', 'MANAGE_SPECIAL_EVENT',
        'SEND_S140', 'SEND_S89', 'FETCH_DATA', 'SIMULATE_ASSIGNMENT',
        'NOTIFY_REFUSAL', 'SHOW_MODAL', 'MANAGE_LOCAL_NEEDS', 'GET_ANALYTICS',
        'IMPORT_WORKBOOK', 'MANAGE_WORKBOOK_PART', 'MANAGE_WORKBOOK_WEEK',
        'MANAGE_PERMISSIONS',
    ]),
    blockedActions: new Set(),
    dataAccessLevel: 'all',
    canSeeSensitiveData: true,
    canSeeAgentControlPanel: true,
    canSendZap: true,
    publisherFilters: { accessLevel: 'all' },
    isAdmin: true,
    resolvedAt: 0,
};

// ===== State =====

let _cachedPermissions: ResolvedPermissions | null = null;
let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

// ===== Core Functions =====

/**
 * Match a policy against publisher condition + funcao.
 * NULL in policy means "any" (wildcard).
 */
function policyMatches(policy: PermissionPolicy, condition: string | null, funcao: string | null): boolean {
    const conditionMatch = policy.target_condition === null || policy.target_condition === condition;
    const funcaoMatch = policy.target_funcao === null || policy.target_funcao === funcao;
    return conditionMatch && funcaoMatch;
}

/**
 * Find the best matching policy for a given condition + funcao.
 * Returns the highest-priority match.
 */
function findBestPolicy(policies: PermissionPolicy[], condition: string | null, funcao: string | null): PermissionPolicy | null {
    const matching = policies
        .filter(p => p.is_active && policyMatches(p, condition, funcao))
        .sort((a, b) => b.priority - a.priority);
    return matching[0] || null;
}

/**
 * Merge a policy with an optional override.
 * Override fields that are non-null replace the policy values.
 */
function mergeWithOverride(policy: PermissionPolicy, override: PermissionOverride | null): ResolvedPermissions {
    const tabs = new Set<ActiveTab>(
        (override?.allowed_tabs ?? policy.allowed_tabs) as ActiveTab[]
    );

    const agentActions = new Set<string>(
        override?.allowed_agent_actions ?? policy.allowed_agent_actions
    );

    const blockedActions = new Set<string>([
        ...policy.blocked_agent_actions,
        ...(override?.blocked_agent_actions ?? []),
    ]);

    const dataAccessLevel: DataAccessLevel = override?.data_access_level ?? policy.data_access_level;
    const canSeeSensitive = override?.can_see_sensitive_data ?? policy.can_see_sensitive_data;

    const publisherFilters: PublisherFilterCriteria = {
        conditions: override?.publisher_filter_conditions ?? policy.publisher_filter_conditions ?? undefined,
        statuses: override?.publisher_filter_statuses ?? policy.publisher_filter_statuses ?? undefined,
        excludeNames: override?.publisher_filter_exclude_names ?? policy.publisher_filter_exclude_names ?? undefined,
        accessLevel: dataAccessLevel,
    };

    return {
        tabs,
        agentActions,
        blockedActions,
        dataAccessLevel,
        canSeeSensitiveData: canSeeSensitive,
        canSeeAgentControlPanel: false, // Set by loadPermissions based on condition+funcao
        canSendZap: false, // Set by loadPermissions based on condition+funcao
        publisherFilters,
        isAdmin: false,
        resolvedAt: Date.now(),
    };
}

// ===== Public API =====

/**
 * Load permissions for a user. Call once after login.
 * - Admin → returns full access (no DB query)
 * - Non-admin → fetches publisher condition+funcao, matches policy, applies override
 */
export async function loadPermissions(
    profileId: string,
    profileRole: 'admin' | 'publicador',
    publisherId: string | null
): Promise<ResolvedPermissions> {
    // Admin = full access, no query needed
    if (profileRole === 'admin') {
        const perms = { ...FULL_ADMIN_PERMISSIONS, resolvedAt: Date.now() };
        _cachedPermissions = perms;
        _scheduleRefresh(profileId, profileRole, publisherId);
        return perms;
    }

    try {
        // 1. Get publisher condition + funcao
        let condition: string | null = null;
        let funcao: string | null = null;

        if (publisherId) {
            const { data: pub } = await supabase
                .from('publishers')
                .select('data')
                .eq('id', publisherId)
                .maybeSingle();
            
            if (pub?.data) {
                const pubData = pub.data as Record<string, unknown>;
                condition = (pubData.condition as string) || null;
                funcao = (pubData.funcao as string) || null;
            }
        }

        // 2. Fetch all active policies
        const { data: policies } = await supabase
            .from('permission_policies')
            .select('*')
            .eq('is_active', true);

        // 3. Find best matching policy
        const bestPolicy = findBestPolicy(policies || [], condition, funcao);

        if (!bestPolicy) {
            console.warn('[Permissions] No matching policy for:', { condition, funcao });
            _cachedPermissions = { ...FALLBACK_PERMISSIONS, resolvedAt: Date.now() };
            _scheduleRefresh(profileId, profileRole, publisherId);
            return _cachedPermissions;
        }

        // 4. Fetch user-specific override
        const { data: overrides } = await supabase
            .from('user_permission_overrides')
            .select('*')
            .eq('profile_id', profileId)
            .eq('is_active', true)
            .maybeSingle();

        // 5. Merge and cache
        const resolved = mergeWithOverride(bestPolicy, overrides || null);

        // 6. Compute column-level visibility for Agent control panel (Column 3)
        resolved.canSeeAgentControlPanel =
            condition === 'Ancião' ||
            (condition === 'Servo Ministerial' &&
             funcao === 'Ajudante do Superintendente da Reunião Vida e Ministério');

        // 7. Compute Zap button visibility (only SRVM-related roles)
        resolved.canSendZap =
            (condition === 'Ancião' &&
             funcao === 'Superintendente da Reunião Vida e Ministério') ||
            (condition === 'Servo Ministerial' &&
             funcao === 'Ajudante do Superintendente da Reunião Vida e Ministério');

        _cachedPermissions = resolved;
        _scheduleRefresh(profileId, profileRole, publisherId);
        
        console.log('[Permissions] Loaded:', {
            condition, funcao,
            tabs: [...resolved.tabs],
            actions: resolved.agentActions.size,
            dataAccess: resolved.dataAccessLevel,
            sensitive: resolved.canSeeSensitiveData,
        });

        return resolved;
    } catch (err) {
        console.error('[Permissions] Failed to load, using fallback:', err);
        _cachedPermissions = { ...FALLBACK_PERMISSIONS, resolvedAt: Date.now() };
        _scheduleRefresh(profileId, profileRole, publisherId);
        return _cachedPermissions;
    }
}

/**
 * Get cached permissions. Returns fallback if not loaded.
 */
export function getPermissions(): ResolvedPermissions {
    return _cachedPermissions || { ...FALLBACK_PERMISSIONS, resolvedAt: 0 };
}

/**
 * Clear cached permissions (call on logout).
 */
export function clearPermissions(): void {
    _cachedPermissions = null;
    if (_refreshTimer) {
        clearTimeout(_refreshTimer);
        _refreshTimer = null;
    }
}

/**
 * Create a PermissionGate from resolved permissions.
 * All methods are O(1) — Set.has().
 */
export function createPermissionGate(perms: ResolvedPermissions): PermissionGate {
    return {
        canViewTab(tab: ActiveTab): boolean {
            if (perms.isAdmin) return true;
            return perms.tabs.has(tab);
        },

        canAgentAction(action: AgentActionType): boolean {
            if (perms.isAdmin) return true;
            // Hard-gate: ações da aba Admin nunca são concedidas a não-admins,
            // mesmo que listadas em policy/override.
            if (ADMIN_ONLY_ACTIONS.has(action)) return false;
            if (perms.blockedActions.has(action)) return false;
            return perms.agentActions.has(action);
        },

        canSeeSensitiveData(): boolean {
            return perms.canSeeSensitiveData;
        },

        getAccessLevel(): 'elder' | 'publisher' {
            if (perms.isAdmin || perms.canSeeSensitiveData) return 'elder';
            return 'publisher';
        },

        getPublisherFilters(): PublisherFilterCriteria {
            return perms.publisherFilters;
        },

        getAllowedAgentActions(): AgentActionType[] {
            if (perms.isAdmin) {
                return [...perms.agentActions] as AgentActionType[];
            }
            return [...perms.agentActions]
                .filter(a => !perms.blockedActions.has(a))
                .filter(a => !ADMIN_ONLY_ACTIONS.has(a as AgentActionType)) as AgentActionType[];
        },

        isFullAdmin(): boolean {
            return perms.isAdmin;
        },

        canSeeAgentControlPanel(): boolean {
            if (perms.isAdmin) return true;
            return perms.canSeeAgentControlPanel;
        },

        canSendZap(): boolean {
            if (perms.isAdmin) return true;
            return perms.canSendZap;
        },

        isLoaded(): boolean {
            return perms.resolvedAt > 0;
        },
    };
}

// ===== Internal =====

function _scheduleRefresh(
    profileId: string,
    profileRole: 'admin' | 'publicador',
    publisherId: string | null
): void {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(async () => {
        try {
            await loadPermissions(profileId, profileRole, publisherId);
        } catch {
            // Silent — keep existing cache
        }
    }, CACHE_TTL_MS);
}
