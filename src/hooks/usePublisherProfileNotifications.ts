import { useChangeNotifications, type BaseChangeNotification } from './useChangeNotifications';

export interface PublisherProfileChangeNotification extends BaseChangeNotification {
    history_id: number | null;
    publisher_id: string;
    publisher_name: string | null;
    changed_fields: string[];
}

/**
 * Subscribe a notificações de mudança de perfil de publicador via
 * PublisherStatusForm (admin/CCA/SEC/SRVM/etc.).
 */
export function usePublisherProfileNotifications() {
    return useChangeNotifications<PublisherProfileChangeNotification>({
        table: 'publisher_profile_change_notifications',
        dismissRpc: 'dismiss_publisher_profile_notification',
        channel: 'publisher-profile-change-notifications',
    });
}
