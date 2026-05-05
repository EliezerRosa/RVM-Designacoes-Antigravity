import { useChangeNotifications, type BaseChangeNotification } from './useChangeNotifications';

export interface ConfirmationChangeNotification extends BaseChangeNotification {
    part_id: string;
    publisher_id: string | null;
    publisher_name: string | null;
    response: 'confirmed' | 'refused';
    reason: string | null;
    author_email: string | null;
}

/**
 * Subscribe a notificações de confirmação/recusa via Confirmation Portal.
 * Recusas viram entradas críticas — workbook_parts já marcadas needs_reassignment
 * pela RPC submit_confirmation_portal_response.
 */
export function useConfirmationNotifications() {
    return useChangeNotifications<ConfirmationChangeNotification>({
        table: 'confirmation_change_notifications',
        dismissRpc: 'dismiss_confirmation_notification',
        channel: 'confirmation-change-notifications',
    });
}
