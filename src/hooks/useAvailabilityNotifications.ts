import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export interface AvailabilityChangeNotification {
    id: number;
    history_id: number | null;
    publisher_id: string;
    publisher_name: string | null;
    severity: 'info' | 'warning' | 'critical';
    summary: string;
    affected_part_ids: string[];
    affected_part_count: number;
    source: string;
    author_label: string;
    dismissed_at: string | null;
    dismissed_by: string | null;
    created_at: string;
}

interface UseAvailabilityNotificationsResult {
    notifications: AvailabilityChangeNotification[];
    pendingCount: number;
    criticalCount: number;
    isLoading: boolean;
    dismiss: (id: number) => Promise<void>;
    refresh: () => Promise<void>;
}

/**
 * Subscribe a notifications de mudança de availability — destaque ao Admin
 * quando publicador (portal) ou agente alteram disponibilidade.
 * Inclui realtime via Supabase Postgres Changes.
 */
export function useAvailabilityNotifications(): UseAvailabilityNotificationsResult {
    const [notifications, setNotifications] = useState<AvailabilityChangeNotification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const mountedRef = useRef(true);

    const refresh = useCallback(async () => {
        const { data, error } = await supabase
            .from('availability_change_notifications')
            .select('*')
            .is('dismissed_at', null)
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) {
            console.warn('[useAvailabilityNotifications] load error:', error);
            if (mountedRef.current) setIsLoading(false);
            return;
        }
        if (mountedRef.current) {
            setNotifications((data || []) as AvailabilityChangeNotification[]);
            setIsLoading(false);
        }
    }, []);

    const dismiss = useCallback(async (id: number) => {
        // Optimistic remove
        setNotifications(prev => prev.filter(n => n.id !== id));
        const { error } = await supabase.rpc('dismiss_availability_notification', { p_id: id });
        if (error) {
            console.warn('[useAvailabilityNotifications] dismiss error:', error);
            void refresh();
        }
    }, [refresh]);

    useEffect(() => {
        mountedRef.current = true;
        void refresh();

        const channel = supabase
            .channel('availability-change-notifications')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'availability_change_notifications' },
                () => { void refresh(); },
            )
            .subscribe();

        return () => {
            mountedRef.current = false;
            supabase.removeChannel(channel);
        };
    }, [refresh]);

    const pendingCount = notifications.length;
    const criticalCount = notifications.filter(n => n.severity === 'critical').length;

    return { notifications, pendingCount, criticalCount, isLoading, dismiss, refresh };
}
