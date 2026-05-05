import { useState } from 'react';
import { useAvailabilityNotifications, type AvailabilityChangeNotification } from '../../hooks/useAvailabilityNotifications';
import { supabase } from '../../lib/supabase';
import { generationService } from '../../services/generationService';
import { workbookService } from '../../services/workbookService';
import type { Publisher, WorkbookPart } from '../../types';

interface AvailabilityChangesBannerProps {
    publishers: Publisher[];
    workbookParts: WorkbookPart[];
    onPartsRefresh?: () => Promise<void> | void;
    /** Quando true, renderiza só ícone+contador (modo compacto p/ chat/header). */
    compact?: boolean;
    /** Esconde se não há nenhuma notificação (default true). */
    hideWhenEmpty?: boolean;
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
    critical: { bg: 'rgba(239, 68, 68, 0.12)', border: '#ef4444', icon: '🚨' },
    warning: { bg: 'rgba(245, 158, 11, 0.12)', border: '#f59e0b', icon: '⚠️' },
    info: { bg: 'rgba(59, 130, 246, 0.12)', border: '#3b82f6', icon: 'ℹ️' },
};

function formatDate(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return iso;
    }
}

/**
 * Banner persistente que mostra mudanças de availability não-dispensadas.
 * - Origem (Agente / Portal / Admin) com timestamp.
 * - Severidade (critical = há designações afetadas).
 * - Botão "Reatribuir agora" → re-roda motor para parts conflitantes.
 * - Botão "Dispensar" → marca dismissed_at.
 */
export function AvailabilityChangesBanner({
    publishers,
    workbookParts,
    onPartsRefresh,
    compact = false,
    hideWhenEmpty = true,
}: AvailabilityChangesBannerProps) {
    const { notifications, pendingCount, criticalCount, dismiss } = useAvailabilityNotifications();
    const [reassigning, setReassigning] = useState<number | null>(null);
    const [expanded, setExpanded] = useState(!compact);

    if (hideWhenEmpty && pendingCount === 0) return null;

    const handleReassign = async (n: AvailabilityChangeNotification) => {
        if (n.affected_part_ids.length === 0) return;
        setReassigning(n.id);
        try {
            // 1) Limpa parts conflitantes (set status PENDENTE + null assignee).
            const idsSet = new Set(n.affected_part_ids);
            const toClear = workbookParts.filter(p => idsSet.has(p.id));
            for (const part of toClear) {
                await workbookService.updatePart(part.id, {
                    resolvedPublisherId: null as any,
                    resolvedPublisherName: null as any,
                    rawPublisherName: '',
                    status: 'PENDENTE' as any,
                    matchConfidence: 0,
                });
            }
            const cleared: WorkbookPart[] = toClear.map(p => ({
                ...p,
                resolvedPublisherId: null as any,
                resolvedPublisherName: null as any,
                rawPublisherName: '',
                status: 'PENDENTE' as any,
                matchConfidence: 0,
            }));

            // 2) Roda motor restrito às semanas afetadas, forçando regeneração.
            const weekIds = Array.from(new Set(toClear.map(p => p.weekId).filter(Boolean)));
            const refreshedParts = (workbookParts || []).map(p =>
                idsSet.has(p.id) ? cleared.find(c => c.id === p.id)! : p
            );
            const result = await generationService.generateDesignations(refreshedParts, publishers, {
                isDryRun: false,
                generationWeeks: weekIds,
                forceAllPartsInPeriod: true,
            });

            // 3) Limpa flags needs_reassignment para parts agora resolvidas.
            for (const partId of n.affected_part_ids) {
                try { await supabase.rpc('clear_part_reassignment_flag', { p_part_id: partId }); }
                catch (e) { console.warn('[Banner] clear flag err:', e); }
            }

            // 4) Refresca workbook e dispensa notificação.
            if (onPartsRefresh) await onPartsRefresh();
            await dismiss(n.id);

            const msg = result.success
                ? `Reatribuição concluída: ${result.partsGenerated} parte(s) processada(s).`
                : `Reatribuição parcial — verifique avisos: ${result.warnings.join('; ')}`;
            alert(msg);
        } catch (err) {
            console.error('[Banner] reassign error:', err);
            alert('Falha na reatribuição automática. Acesse o S-140 para ajuste manual.');
        } finally {
            setReassigning(null);
        }
    };

    if (compact) {
        return (
            <button
                type="button"
                onClick={() => setExpanded(true)}
                title={`${pendingCount} mudança(s) de disponibilidade (${criticalCount} crítica(s))`}
                style={{
                    background: criticalCount > 0 ? '#ef4444' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '999px',
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    gap: '6px',
                    alignItems: 'center',
                }}
            >
                {criticalCount > 0 ? '🚨' : 'ℹ️'} {pendingCount}
                {expanded && (
                    <ExpandedModal
                        notifications={notifications}
                        onClose={() => setExpanded(false)}
                        onReassign={handleReassign}
                        onDismiss={dismiss}
                        reassigning={reassigning}
                    />
                )}
            </button>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
            {notifications.map(n => {
                const style = SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.info;
                return (
                    <div
                        key={n.id}
                        style={{
                            background: style.bg,
                            borderLeft: `4px solid ${style.border}`,
                            borderRadius: '8px',
                            padding: '12px 16px',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                        }}
                    >
                        <span style={{ fontSize: '20px' }}>{style.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: '4px' }}>
                                {n.summary}
                            </div>
                            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                                Origem: <strong>{n.author_label}</strong> · {formatDate(n.created_at)}
                                {n.affected_part_count > 0 && ` · ${n.affected_part_count} designação(ões) marcada(s) como needs_reassignment`}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                            {n.affected_part_count > 0 && (
                                <button
                                    type="button"
                                    onClick={() => handleReassign(n)}
                                    disabled={reassigning === n.id}
                                    style={{
                                        background: '#10b981',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        padding: '6px 12px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: reassigning === n.id ? 'wait' : 'pointer',
                                        opacity: reassigning === n.id ? 0.6 : 1,
                                    }}
                                >
                                    {reassigning === n.id ? 'Reatribuindo...' : '🔄 Reatribuir agora'}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => dismiss(n.id)}
                                style={{
                                    background: 'rgba(255,255,255,0.08)',
                                    color: '#cbd5e1',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    borderRadius: '6px',
                                    padding: '6px 12px',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                }}
                            >
                                ✕ Dispensar
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function ExpandedModal({
    notifications,
    onClose,
    onReassign,
    onDismiss,
    reassigning,
}: {
    notifications: AvailabilityChangeNotification[];
    onClose: () => void;
    onReassign: (n: AvailabilityChangeNotification) => Promise<void>;
    onDismiss: (id: number) => Promise<void>;
    reassigning: number | null;
}) {
    return (
        <div
            onClick={(e) => { e.stopPropagation(); }}
            style={{
                position: 'fixed',
                top: '60px',
                right: '20px',
                width: '420px',
                maxHeight: '70vh',
                overflowY: 'auto',
                background: '#1e293b',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '12px',
                padding: '16px',
                boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                zIndex: 9999,
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <strong style={{ color: '#e2e8f0' }}>Mudanças de disponibilidade</strong>
                <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>
            {notifications.length === 0 && <div style={{ color: '#94a3b8', fontSize: '13px' }}>Nenhuma pendente.</div>}
            {notifications.map(n => {
                const style = SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.info;
                return (
                    <div key={n.id} style={{ background: style.bg, borderLeft: `3px solid ${style.border}`, padding: '10px', borderRadius: '6px', marginBottom: '8px' }}>
                        <div style={{ color: '#e2e8f0', fontSize: '13px', marginBottom: '4px' }}>{n.summary}</div>
                        <div style={{ color: '#94a3b8', fontSize: '11px' }}>{n.author_label} · {formatDate(n.created_at)}</div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                            {n.affected_part_count > 0 && (
                                <button onClick={() => onReassign(n)} disabled={reassigning === n.id}
                                    style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}>
                                    {reassigning === n.id ? '...' : 'Reatribuir'}
                                </button>
                            )}
                            <button onClick={() => onDismiss(n.id)}
                                style={{ background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}>
                                Dispensar
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
