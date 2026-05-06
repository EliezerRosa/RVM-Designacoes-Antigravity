import { useState } from 'react';
import {
    useAvailabilityNotifications,
    type AvailabilityChangeNotification,
} from '../../hooks/useAvailabilityNotifications';
import { reassignParts } from '../../services/reassignmentService';
import { ChangeNotificationsBanner } from './ChangeNotificationsBanner';
import type { Publisher, WorkbookPart } from '../../types';

interface AvailabilityChangesBannerProps {
    publishers: Publisher[];
    workbookParts: WorkbookPart[];
    onPartsRefresh?: () => Promise<void> | void;
    /** Compacto: pílula com contador (header/chat). */
    compact?: boolean;
    /** Esconde se vazio (default true). */
    hideWhenEmpty?: boolean;
    /** Tom visual do banner para contraste em fundo escuro/claro. */
    tone?: 'dark' | 'light';
}

/**
 * Wrapper especializado: une useAvailabilityNotifications + reassignParts +
 * ChangeNotificationsBanner. Mantém retrocompat com chamadas existentes.
 */
export function AvailabilityChangesBanner({
    publishers,
    workbookParts,
    onPartsRefresh,
    compact = false,
    hideWhenEmpty = true,
    tone = 'dark',
}: AvailabilityChangesBannerProps) {
    const { notifications, pendingCount, criticalCount, dismiss } = useAvailabilityNotifications();
    const [reassigningId, setReassigningId] = useState<number | null>(null);

    const handleReassign = async (n: AvailabilityChangeNotification) => {
        if (n.affected_part_ids.length === 0) return;
        setReassigningId(n.id);
        try {
            const result = await reassignParts(n.affected_part_ids, publishers, workbookParts, onPartsRefresh);
            await dismiss(n.id);
            const msg = result.success
                ? `Reatribuição concluída: ${result.partsGenerated} parte(s) processada(s).`
                : `Reatribuição parcial — verifique avisos: ${result.warnings.join('; ')}`;
            alert(msg);
        } catch (err) {
            console.error('[AvailabilityChangesBanner] reassign error:', err);
            alert('Falha na reatribuição automática. Acesse o S-140 para ajuste manual.');
        } finally {
            setReassigningId(null);
        }
    };

    return (
        <ChangeNotificationsBanner
            notifications={notifications}
            pendingCount={pendingCount}
            criticalCount={criticalCount}
            dismiss={dismiss}
            onReassign={handleReassign}
            reassigningId={reassigningId}
            title="Mudanças de disponibilidade"
            compact={compact}
            hideWhenEmpty={hideWhenEmpty}
            tone={tone}
        />
    );
}
