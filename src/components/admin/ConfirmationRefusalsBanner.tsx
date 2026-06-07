import { useState } from 'react';
import {
    useConfirmationNotifications,
    type ConfirmationChangeNotification,
} from '../../hooks/useConfirmationNotifications';
import { reassignParts } from '../../services/reassignmentService';
import { ChangeNotificationsBanner } from './ChangeNotificationsBanner';
import type { Publisher, WorkbookPart } from '../../types';

interface ConfirmationRefusalsBannerProps {
    publishers: Publisher[];
    workbookParts: WorkbookPart[];
    onPartsRefresh?: () => Promise<void> | void;
    compact?: boolean;
    hideWhenEmpty?: boolean;
    tone?: 'dark' | 'light';
}

/**
 * Banner que exibe confirmações/recusas vindas do Confirmation Portal.
 * - Recusa: severidade crítica; part já foi marcada needs_reassignment + status PENDENTE pela RPC.
 * - Botão "Reatribuir agora" roda o motor para a part afetada (mesmo helper de availability).
 */
export function ConfirmationRefusalsBanner({
    publishers,
    workbookParts,
    onPartsRefresh,
    compact = false,
    hideWhenEmpty = true,
    tone = 'dark',
}: ConfirmationRefusalsBannerProps) {
    const { notifications, pendingCount, criticalCount, dismiss } = useConfirmationNotifications();
    const [reassigningId, setReassigningId] = useState<number | null>(null);

    const handleReassign = async (n: ConfirmationChangeNotification) => {
        if (n.affected_part_ids.length === 0) return;
        setReassigningId(n.id);
        try {
            const result = await reassignParts(n.affected_part_ids, publishers, workbookParts, onPartsRefresh);
            const msg = result.partsGenerated > 0
                ? `Reatribuição concluída: ${result.partsGenerated} parte(s) processada(s).`
                : `Reatribuição parcial — verifique avisos: ${result.warnings.join('; ') || 'nenhum candidato elegível encontrado.'}`;

            if (result.partsGenerated > 0) {
                await dismiss(n.id);
            }

            alert(msg);
        } catch (err) {
            console.error('[ConfirmationRefusalsBanner] reassign error:', err);
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
            title="Confirmações / Recusas via portal"
            compact={compact}
            hideWhenEmpty={hideWhenEmpty}
            tone={tone}
        />
    );
}
