import {
    usePublisherProfileNotifications,
} from '../../hooks/usePublisherProfileNotifications';
import { ChangeNotificationsBanner } from './ChangeNotificationsBanner';

interface PublisherProfileChangesBannerProps {
    compact?: boolean;
    hideWhenEmpty?: boolean;
}

/**
 * Banner que exibe mudanças de perfil de publicadores feitas via PublisherStatusForm
 * (admin direto OU portal com token de CCA/SEC/SRVM/AjSRVM).
 *
 * v1: sem reflexão automática em workbook_parts. Quando privilégios/seções mudam,
 * a severidade é "warning" e o admin deve revisar manualmente designações futuras.
 * v2 (backlog): chamar reassignParts para parts incompatíveis com o novo perfil.
 */
export function PublisherProfileChangesBanner({
    compact = false,
    hideWhenEmpty = true,
}: PublisherProfileChangesBannerProps) {
    const { notifications, pendingCount, criticalCount, dismiss } =
        usePublisherProfileNotifications();

    return (
        <ChangeNotificationsBanner
            notifications={notifications}
            pendingCount={pendingCount}
            criticalCount={criticalCount}
            dismiss={dismiss}
            title="Mudanças de perfil de publicador"
            compact={compact}
            hideWhenEmpty={hideWhenEmpty}
        />
    );
}
