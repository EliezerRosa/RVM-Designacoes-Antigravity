import { useState } from 'react';
import type { BaseChangeNotification } from '../../hooks/useChangeNotifications';

const SEVERITY_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
    critical: { bg: 'rgba(239, 68, 68, 0.12)', border: '#ef4444', icon: '🚨' },
    warning: { bg: 'rgba(245, 158, 11, 0.12)', border: '#f59e0b', icon: '⚠️' },
    info: { bg: 'rgba(59, 130, 246, 0.12)', border: '#3b82f6', icon: 'ℹ️' },
};

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return iso;
    }
}

export interface ChangeNotificationsBannerProps<T extends BaseChangeNotification> {
    notifications: T[];
    pendingCount: number;
    criticalCount: number;
    dismiss: (id: number) => Promise<void>;
    /** Quando definido, exibe botão "Reatribuir agora" para notificações com partes afetadas. */
    onReassign?: (n: T) => Promise<void>;
    /** Indica qual notificação está em processo de reatribuição (UI loading). */
    reassigningId?: number | null;
    /** Título do header (modo expandido / modal). */
    title?: string;
    /** Modo compacto: pílula com contador, expande modal flutuante ao clicar. */
    compact?: boolean;
    /** Esconde se não há nenhuma notificação (default true). */
    hideWhenEmpty?: boolean;
}

/**
 * Banner genérico que exibe notificações *_change_notifications com:
 * - severidade (info/warning/critical) com ícone+cor.
 * - origem + autor + timestamp.
 * - opcional: botão "Reatribuir agora" (delegado via onReassign).
 * - botão "Dispensar" sempre presente.
 *
 * Usado por AvailabilityChangesBanner e ConfirmationRefusalsBanner.
 */
export function ChangeNotificationsBanner<T extends BaseChangeNotification>({
    notifications,
    pendingCount,
    criticalCount,
    dismiss,
    onReassign,
    reassigningId = null,
    title = 'Mudanças pendentes',
    compact = false,
    hideWhenEmpty = true,
}: ChangeNotificationsBannerProps<T>) {
    const [expanded, setExpanded] = useState(!compact);

    if (hideWhenEmpty && pendingCount === 0) return null;

    if (compact) {
        return (
            <button
                type="button"
                onClick={() => setExpanded(true)}
                title={`${pendingCount} pendência(s) (${criticalCount} crítica(s))`}
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
                        title={title}
                        notifications={notifications}
                        onClose={() => setExpanded(false)}
                        onReassign={onReassign}
                        onDismiss={dismiss}
                        reassigningId={reassigningId}
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
                            {onReassign && n.affected_part_count > 0 && (
                                <button
                                    type="button"
                                    onClick={() => { void onReassign(n); }}
                                    disabled={reassigningId === n.id}
                                    style={{
                                        background: '#10b981',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        padding: '6px 12px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: reassigningId === n.id ? 'wait' : 'pointer',
                                        opacity: reassigningId === n.id ? 0.6 : 1,
                                    }}
                                >
                                    {reassigningId === n.id ? 'Reatribuindo...' : '🔄 Reatribuir agora'}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => { void dismiss(n.id); }}
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

function ExpandedModal<T extends BaseChangeNotification>({
    title,
    notifications,
    onClose,
    onReassign,
    onDismiss,
    reassigningId,
}: {
    title: string;
    notifications: T[];
    onClose: () => void;
    onReassign?: (n: T) => Promise<void>;
    onDismiss: (id: number) => Promise<void>;
    reassigningId: number | null;
}) {
    return (
        <div
            onClick={(e) => { e.stopPropagation(); }}
            style={{
                position: 'fixed', top: '60px', right: '20px', width: '420px',
                maxHeight: '70vh', overflowY: 'auto', background: '#1e293b',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px',
                padding: '16px', boxShadow: '0 12px 32px rgba(0,0,0,0.5)', zIndex: 9999,
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <strong style={{ color: '#e2e8f0' }}>{title}</strong>
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
                            {onReassign && n.affected_part_count > 0 && (
                                <button onClick={() => { void onReassign(n); }} disabled={reassigningId === n.id}
                                    style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}>
                                    {reassigningId === n.id ? '...' : 'Reatribuir'}
                                </button>
                            )}
                            <button onClick={() => { void onDismiss(n.id); }}
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
