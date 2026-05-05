import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Linha mínima comum entre tabelas *_change_notifications.
 * Cada domínio (availability, confirmation, etc.) pode estender este shape
 * com colunas adicionais via parâmetro genérico T.
 */
export interface BaseChangeNotification {
    id: number;
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

interface UseChangeNotificationsOptions {
    /** Nome da tabela com a lista de notificações pendentes. */
    table: string;
    /** RPC chamada para dispensar uma notificação (recebe `{ p_id }`). */
    dismissRpc: string;
    /** Nome do canal realtime (deve ser único por tabela). */
    channel: string;
    /** Limite de notificações carregadas. Default 50. */
    limit?: number;
}

export interface UseChangeNotificationsResult<T extends BaseChangeNotification> {
    notifications: T[];
    pendingCount: number;
    criticalCount: number;
    isLoading: boolean;
    dismiss: (id: number) => Promise<void>;
    refresh: () => Promise<void>;
}

/**
 * Hook genérico para subscribir notificações derivadas de auditoria.
 * Reaproveitado por Disponibilidade, Confirmação, Perfil etc.
 */
export function useChangeNotifications<T extends BaseChangeNotification>(
    opts: UseChangeNotificationsOptions,
): UseChangeNotificationsResult<T> {
    const { table, dismissRpc, channel, limit = 50 } = opts;
    const [notifications, setNotifications] = useState<T[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const mountedRef = useRef(true);

    const refresh = useCallback(async () => {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .is('dismissed_at', null)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) {
            console.warn(`[useChangeNotifications:${table}] load error:`, error);
            if (mountedRef.current) setIsLoading(false);
            return;
        }
        if (mountedRef.current) {
            setNotifications((data || []) as T[]);
            setIsLoading(false);
        }
    }, [table, limit]);

    const dismiss = useCallback(async (id: number) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
        const { error } = await supabase.rpc(dismissRpc, { p_id: id });
        if (error) {
            console.warn(`[useChangeNotifications:${table}] dismiss error:`, error);
            void refresh();
        }
    }, [dismissRpc, table, refresh]);

    useEffect(() => {
        mountedRef.current = true;
        void refresh();

        const ch = supabase
            .channel(channel)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table },
                () => { void refresh(); },
            )
            .subscribe();

        return () => {
            mountedRef.current = false;
            supabase.removeChannel(ch);
        };
    }, [refresh, channel, table]);

    const pendingCount = notifications.length;
    const criticalCount = notifications.filter(n => n.severity === 'critical').length;

    return { notifications, pendingCount, criticalCount, isLoading, dismiss, refresh };
}
