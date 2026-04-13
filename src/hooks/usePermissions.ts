/**
 * usePermissions — React hook for the permission system.
 * 
 * Loads permissions once on mount (triggered by profile change).
 * Returns a memoized PermissionGate with O(1) checks.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Profile } from '../context/AuthContext';
import {
    loadPermissions,
    getPermissions,
    clearPermissions,
    createPermissionGate,
    type ResolvedPermissions,
    type PermissionGate,
} from '../services/permissionService';

interface UsePermissionsResult {
    permissions: PermissionGate;
    isLoading: boolean;
    refresh: () => Promise<void>;
}

const FALLBACK_GATE: PermissionGate = createPermissionGate(getPermissions());

export function usePermissions(profile: Profile | null): UsePermissionsResult {
    const [resolved, setResolved] = useState<ResolvedPermissions | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Load on profile change
    useEffect(() => {
        if (!profile) {
            clearPermissions();
            setResolved(null);
            setIsLoading(false);
            return;
        }

        let cancelled = false;
        setIsLoading(true);

        loadPermissions(profile.id, profile.role, profile.publisher_id)
            .then(perms => {
                if (!cancelled) {
                    setResolved(perms);
                    setIsLoading(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setResolved(getPermissions());
                    setIsLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, [profile?.id, profile?.role, profile?.publisher_id]);

    // Cleanup on unmount
    useEffect(() => {
        return () => clearPermissions();
    }, []);

    const refresh = useCallback(async () => {
        if (!profile) return;
        setIsLoading(true);
        const perms = await loadPermissions(profile.id, profile.role, profile.publisher_id);
        setResolved(perms);
        setIsLoading(false);
    }, [profile?.id, profile?.role, profile?.publisher_id]);

    const gate = useMemo<PermissionGate>(() => {
        if (!resolved) return FALLBACK_GATE;
        return createPermissionGate(resolved);
    }, [resolved]);

    return { permissions: gate, isLoading, refresh };
}
