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
            const { replacementOrchestratorService } = await import('../../services/replacementOrchestratorService');
            const { generateS89PngBase64 } = await import('../../services/s89Generator');
            
            const s89LocalProvider = async (
                _part: WorkbookPart,
                _pubs: Publisher[],
                isStudent: boolean,
                titularPartForPdf: WorkbookPart,
                assistantNameForPdf?: string
            ) => {
                return generateS89PngBase64(titularPartForPdf, assistantNameForPdf, undefined, isStudent);
            };

            let successes = 0;
            let failures = 0;

            for (const pId of n.affected_part_ids) {
                const res = await replacementOrchestratorService.executeAutoReassignment(
                    pId,
                    publishers,
                    workbookParts,
                    s89LocalProvider
                );
                if (res.success) successes++;
                else failures++;
            }

            if (onPartsRefresh) await onPartsRefresh();

            const msg = successes > 0 
                ? `Reatribuição concluída: ${successes} parte(s) reatribuída(s) com sucesso.${failures > 0 ? ` ${failures} falharam e a liderança foi notificada.` : ''}`
                : `Reatribuição falhou. A liderança foi notificada para ajustar manualmente no painel.`;

            if (successes === n.affected_part_ids.length && successes > 0) {
                await dismiss(n.id);
            }

            alert(msg);
        } catch (err) {
            console.error('[AvailabilityChangesBanner] reassign error:', err);
            alert('Falha crítica na orquestração automática. Acesse o painel para ajuste manual.');
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
