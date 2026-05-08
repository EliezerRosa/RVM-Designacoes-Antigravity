/**
 * useAnnouncementNotifications — banner realtime para o workflow de aprovação CS.
 *
 * Subscreve `announcement_change_notifications` (RLS: somente CS lê). Não usa o
 * hook genérico `useChangeNotifications` porque:
 *   • o RPC `dismiss_announcement_notification(p_id, p_actor_label)` exige
 *     identidade textual do ator (auditoria);
 *   • o shape da tabela difere de `BaseChangeNotification` (sem
 *     `affected_part_*`).
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
    announcementService,
    type AnnouncementChangeNotification,
} from '../services/announcementService';

interface UseAnnouncementNotificationsOptions {
    /** Identidade textual usada na auditoria do dismiss. */
    actorLabel: string;
    /** Quando false, não subscreve nem carrega. Default true. */
    enabled?: boolean;
}

interface UseAnnouncementNotificationsResult {
    notifications: AnnouncementChangeNotification[];
    pendingCount: number;
    criticalCount: number;
    warningCount: number;
    isLoading: boolean;
    dismiss: (id: number) => Promise<void>;
    refresh: () => Promise<void>;
}

export function useAnnouncementNotifications(
    opts: UseAnnouncementNotificationsOptions,
): UseAnnouncementNotificationsResult {
    const { actorLabel, enabled = true } = opts;
    const [notifications, setNotifications] = useState<AnnouncementChangeNotification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const mountedRef = useRef(true);

    const refresh = useCallback(async () => {
        try {
            const list = await announcementService.getPendingNotifications();
            if (mountedRef.current) {
                setNotifications(list);
                setIsLoading(false);
            }
        } catch (err) {
            console.warn('[useAnnouncementNotifications] load error:', err);
            if (mountedRef.current) setIsLoading(false);
        }
    }, []);

    const dismiss = useCallback(async (id: number) => {
        // Optimistic remove
        setNotifications(prev => prev.filter(n => n.id !== id));
        try {
            await announcementService.dismissNotification(id, actorLabel);
        } catch (err) {
            console.warn('[useAnnouncementNotifications] dismiss error:', err);
            void refresh();
        }
    }, [actorLabel, refresh]);

    useEffect(() => {
        mountedRef.current = true;
        if (!enabled) {
            setIsLoading(false);
            return () => { mountedRef.current = false; };
        }

        void refresh();

        const ch = supabase
            .channel('announcement_change_notifications:realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'announcement_change_notifications' },
                () => { void refresh(); },
            )
            .subscribe();

        return () => {
            mountedRef.current = false;
            supabase.removeChannel(ch);
        };
    }, [enabled, refresh]);

    const pendingCount = notifications.length;
    const criticalCount = notifications.filter(n => n.severity === 'critical').length;
    const warningCount = notifications.filter(n => n.severity === 'warning').length;

    return { notifications, pendingCount, criticalCount, warningCount, isLoading, dismiss, refresh };
}
