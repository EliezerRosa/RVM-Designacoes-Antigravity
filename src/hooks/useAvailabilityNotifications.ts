import { useChangeNotifications, type BaseChangeNotification } from './useChangeNotifications';

export interface AvailabilityChangeNotification extends BaseChangeNotification {
    history_id: number | null;
    publisher_id: string;
    publisher_name: string | null;
}

/**
 * Subscribe a notificações de mudança de availability — destaque ao Admin
 * quando publicador (portal) ou agente alteram disponibilidade.
 * Wrapper sobre `useChangeNotifications` (camada genérica).
 */
export function useAvailabilityNotifications() {
    return useChangeNotifications<AvailabilityChangeNotification>({
        table: 'availability_change_notifications',
        dismissRpc: 'dismiss_availability_notification',
        channel: 'availability-change-notifications',
    });
}
