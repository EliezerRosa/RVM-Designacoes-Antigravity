/**
 * AnnouncementBanner — banner agregado de notificações de aprovação CS.
 *
 * Renderiza somente para CS members (gating client-side; a tabela tem RLS
 * que já filtra). Usa `useAnnouncementNotifications` (realtime).
 */

import { useState } from 'react';
import { useAnnouncementNotifications } from '../hooks/useAnnouncementNotifications';
import { announcementPermissions, type AnnouncementUser } from '../lib/announcementPermissions';
import type { AnnouncementChangeNotification } from '../services/announcementService';

interface Props {
    /** Identidade efetiva (resolvida pelo caller via AuthContext + publishers). */
    user: AnnouncementUser;
    /** Identidade textual usada na auditoria do dismiss. Default: funcao || 'Usuário'. */
    actorLabel?: string;
    /** Click em uma notificação — caller decide o que fazer (abrir modal, navegar). */
    onNotificationClick?: (n: AnnouncementChangeNotification) => void;
    /** Permite ocultar manualmente (ex.: já dentro do modal de Eventos). */
    hidden?: boolean;
}

const SEVERITY_STYLES: Record<AnnouncementChangeNotification['severity'], { bg: string; border: string; color: string; icon: string }> = {
    info:     { bg: '#EFF6FF', border: '#BFDBFE', color: '#1D4ED8', icon: 'ℹ️' },
    warning:  { bg: '#FEF3C7', border: '#FCD34D', color: '#92400E', icon: '⚠️' },
    critical: { bg: '#FEE2E2', border: '#FCA5A5', color: '#B91C1C', icon: '🚨' },
};

export function AnnouncementBanner({ user, actorLabel, onNotificationClick, hidden }: Props) {
    const isCs = announcementPermissions.isCsMember(user);
    const enabled = isCs && !hidden;
    const effectiveActor = actorLabel || user.funcao || 'Usuário';

    const { notifications, pendingCount, criticalCount, warningCount, isLoading, dismiss } =
        useAnnouncementNotifications({ actorLabel: effectiveActor, enabled });

    const [collapsed, setCollapsed] = useState(false);

    if (!enabled || isLoading || pendingCount === 0) return null;

    const headerSeverity: AnnouncementChangeNotification['severity'] =
        criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'info';
    const headCfg = SEVERITY_STYLES[headerSeverity];

    return (
        <div
            role="region"
            aria-label="Notificações de aprovação de anúncios"
            style={{
                margin: '8px 0',
                background: headCfg.bg,
                border: `1px solid ${headCfg.border}`,
                borderRadius: '10px',
                padding: '10px 12px',
                fontSize: '13px',
                color: headCfg.color,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    fontWeight: 600,
                }}
                onClick={() => setCollapsed(c => !c)}
            >
                <span>
                    {headCfg.icon} <strong>{pendingCount}</strong> notificação{pendingCount > 1 ? 'ões' : ''} pendente{pendingCount > 1 ? 's' : ''} de aprovação
                    {criticalCount > 0 && <> · <span style={{ color: '#B91C1C' }}>{criticalCount} crítica{criticalCount > 1 ? 's' : ''}</span></>}
                </span>
                <span style={{ fontSize: '11px' }}>{collapsed ? '▾ Expandir' : '▴ Recolher'}</span>
            </div>

            {!collapsed && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {notifications.slice(0, 8).map(n => {
                        const cfg = SEVERITY_STYLES[n.severity];
                        const when = n.createdAt ? new Date(n.createdAt).toLocaleString('pt-BR') : '';
                        return (
                            <div
                                key={n.id}
                                style={{
                                    background: '#FFFFFF',
                                    border: `1px solid ${cfg.border}`,
                                    borderLeft: `4px solid ${cfg.color}`,
                                    borderRadius: '6px',
                                    padding: '8px 10px',
                                    display: 'flex',
                                    gap: '8px',
                                    alignItems: 'flex-start',
                                }}
                            >
                                <div style={{ fontSize: '14px' }}>{cfg.icon}</div>
                                <div style={{ flex: 1, color: '#1F2937' }}>
                                    <div
                                        onClick={() => onNotificationClick?.(n)}
                                        style={{
                                            fontWeight: 600,
                                            cursor: onNotificationClick ? 'pointer' : 'default',
                                        }}
                                    >
                                        {n.summary}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
                                        {n.source} · {n.authorLabel}{when && ` · ${when}`}
                                    </div>
                                </div>
                                <button
                                    onClick={() => dismiss(n.id)}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: '#6B7280',
                                        fontSize: '14px',
                                        cursor: 'pointer',
                                        padding: '0 4px',
                                    }}
                                    title="Dispensar"
                                    aria-label="Dispensar notificação"
                                >
                                    ✕
                                </button>
                            </div>
                        );
                    })}
                    {notifications.length > 8 && (
                        <div style={{ fontSize: '11px', color: '#6B7280', textAlign: 'center' }}>
                            … e mais {notifications.length - 8}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
