import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface FloatingMicroUiItem {
    id: string;
    title: string;
    subtitle?: string;
    badge?: string;
    accent: string;
    content: ReactNode;
}

interface FloatingMicroUiHostProps {
    items: FloatingMicroUiItem[];
}

export function FloatingMicroUiHost({ items }: FloatingMicroUiHostProps) {
    const [minimized, setMinimized] = useState<Record<string, boolean>>({});
    const previousIdsRef = useRef<string[]>([]);
    const itemIds = useMemo(() => items.map(item => item.id), [items]);

    useEffect(() => {
        const previousIds = previousIdsRef.current;
        const newIds = itemIds.filter(id => !previousIds.includes(id));

        setMinimized(current => {
            const next: Record<string, boolean> = {};

            itemIds.forEach(id => {
                next[id] = current[id] ?? true;
            });

            if (itemIds.length === 1 && previousIds.length === 0) {
                next[itemIds[0]] = false;
            }

            if (newIds.length > 0) {
                const focusId = newIds[newIds.length - 1];
                itemIds.forEach(id => {
                    next[id] = id !== focusId;
                });
            }

            return next;
        });

        previousIdsRef.current = itemIds;
    }, [itemIds]);

    if (items.length === 0) return null;

    const openPanel = (targetId: string) => {
        setMinimized(current => {
            const next: Record<string, boolean> = {};
            items.forEach(item => {
                next[item.id] = item.id !== targetId;
            });
            return { ...current, ...next };
        });
    };

    const minimizePanel = (targetId: string) => {
        setMinimized(current => ({ ...current, [targetId]: true }));
    };

    return (
        <div style={{
            position: 'absolute',
            right: '12px',
            bottom: '116px',
            zIndex: 25,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '10px',
            pointerEvents: 'none',
            maxWidth: 'min(380px, calc(100% - 24px))'
        }}>
            {items.map(item => {
                const isMinimized = minimized[item.id] ?? true;

                if (isMinimized) {
                    return (
                        <button
                            key={item.id}
                            onClick={() => openPanel(item.id)}
                            style={{
                                pointerEvents: 'auto',
                                border: `1px solid ${item.accent}`,
                                background: '#FFFFFF',
                                color: '#0F172A',
                                borderRadius: '999px',
                                padding: '8px 12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 10px 25px rgba(15, 23, 42, 0.12)',
                                maxWidth: '100%'
                            }}
                            title={item.subtitle || item.title}
                        >
                            <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: item.accent, flexShrink: 0 }} />
                            <span style={{ fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.title}
                            </span>
                            {item.badge && (
                                <span style={{ fontSize: '11px', color: '#475569', whiteSpace: 'nowrap' }}>
                                    {item.badge}
                                </span>
                            )}
                        </button>
                    );
                }

                return (
                    <div
                        key={item.id}
                        style={{
                            pointerEvents: 'auto',
                            width: 'min(380px, calc(100vw - 48px))',
                            maxWidth: '100%',
                            maxHeight: 'min(65vh, 560px)',
                            background: 'rgba(255, 255, 255, 0.98)',
                            backdropFilter: 'blur(10px)',
                            borderRadius: '18px',
                            border: `1px solid ${item.accent}`,
                            boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                    >
                        <div style={{
                            padding: '12px 14px',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '12px',
                            background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)'
                        }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: item.subtitle ? '4px' : 0 }}>
                                    <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: item.accent, flexShrink: 0 }} />
                                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>{item.title}</div>
                                    {item.badge && <div style={{ fontSize: '11px', color: '#475569' }}>{item.badge}</div>}
                                </div>
                                {item.subtitle && (
                                    <div style={{ fontSize: '11px', color: '#64748B' }}>{item.subtitle}</div>
                                )}
                            </div>
                            <button
                                onClick={() => minimizePanel(item.id)}
                                style={{
                                    border: '1px solid #CBD5E1',
                                    background: '#FFFFFF',
                                    color: '#334155',
                                    borderRadius: '999px',
                                    padding: '6px 10px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    flexShrink: 0
                                }}
                                title="Minimizar"
                            >
                                Minimizar
                            </button>
                        </div>

                        <div style={{ overflowY: 'auto', paddingBottom: '4px' }}>
                            {item.content}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}