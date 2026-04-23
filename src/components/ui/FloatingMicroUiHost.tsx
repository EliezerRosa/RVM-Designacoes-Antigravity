import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
    requestedOpenId?: string | null;
    requestNonce?: number;
}

export function FloatingMicroUiHost({ items, requestedOpenId = null, requestNonce = 0 }: FloatingMicroUiHostProps) {
    const [modeById, setModeById] = useState<Record<string, 'open' | 'minimized' | 'closed'>>({});
    const previousIdsRef = useRef<string[]>([]);
    const itemIds = useMemo(() => items.map(item => item.id), [items]);
    const anchorRef = useRef<HTMLDivElement>(null);
    const [anchorRect, setAnchorRect] = useState<{ right: number; bottom: number; width: number } | null>(null);
    const [isAnchorVisible, setIsAnchorVisible] = useState(true);

    const updateRect = useCallback(() => {
        const el = anchorRef.current?.parentElement;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        setAnchorRect({
            right: Math.max(12, window.innerWidth - rect.right + 12),
            bottom: Math.max(60, window.innerHeight - rect.bottom + 60),
            width: rect.width - 24,
        });
    }, []);

    useLayoutEffect(() => {
        updateRect();
        const el = anchorRef.current?.parentElement;
        if (!el) return;
        const ro = new ResizeObserver(updateRect);
        ro.observe(el);
        window.addEventListener('resize', updateRect);
        return () => { ro.disconnect(); window.removeEventListener('resize', updateRect); };
    }, [updateRect]);

    // Esconde os painéis quando a coluna do chat-agente não está visível (snap-scroll mobile entre colunas).
    // Reexibe automaticamente ao voltar.
    useEffect(() => {
        const el = anchorRef.current?.parentElement;
        if (!el || typeof IntersectionObserver === 'undefined') return;
        const io = new IntersectionObserver(
            entries => {
                const entry = entries[0];
                if (!entry) return;
                // Considera visível se ao menos 35% da coluna do chat está dentro do viewport.
                setIsAnchorVisible(entry.isIntersecting && entry.intersectionRatio >= 0.35);
            },
            { threshold: [0, 0.35, 0.6, 1] }
        );
        io.observe(el);
        // Também monitora scroll horizontal do container pai (snap-scroll do agent-tab-container).
        const scrollParent = el.closest('.agent-tab-container');
        const onScroll = () => {
            const rect = el.getBoundingClientRect();
            const visibleW = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
            const ratio = visibleW > 0 ? visibleW / Math.max(1, rect.width) : 0;
            setIsAnchorVisible(ratio >= 0.35);
        };
        scrollParent?.addEventListener('scroll', onScroll, { passive: true });
        return () => { io.disconnect(); scrollParent?.removeEventListener('scroll', onScroll); };
    }, []);

    useEffect(() => {
        const previousIds = previousIdsRef.current;
        const newIds = itemIds.filter(id => !previousIds.includes(id));

        setModeById(current => {
            const next: Record<string, 'open' | 'minimized' | 'closed'> = {};

            itemIds.forEach(id => {
                next[id] = current[id] ?? 'minimized';
            });

            if (itemIds.length === 1 && previousIds.length === 0) {
                next[itemIds[0]] = 'open';
            }

            if (newIds.length > 0) {
                const focusId = newIds[newIds.length - 1];
                itemIds.forEach(id => {
                    next[id] = id === focusId ? 'open' : (next[id] === 'closed' ? 'closed' : 'minimized');
                });
            }

            return next;
        });

        previousIdsRef.current = itemIds;
    }, [itemIds]);

    useEffect(() => {
        if (!requestedOpenId || !itemIds.includes(requestedOpenId)) {
            return;
        }

        setModeById(current => {
            const next: Record<string, 'open' | 'minimized' | 'closed'> = {};

            itemIds.forEach(id => {
                next[id] = id === requestedOpenId ? 'open' : (current[id] === 'closed' ? 'closed' : 'minimized');
            });

            return { ...current, ...next };
        });
    }, [itemIds, requestNonce, requestedOpenId]);

    const openPanel = (targetId: string) => {
        setModeById(current => {
            const next: Record<string, 'open' | 'minimized' | 'closed'> = {};
            items.forEach(item => {
                next[item.id] = item.id === targetId ? 'open' : (current[item.id] === 'closed' ? 'closed' : 'minimized');
            });
            return { ...current, ...next };
        });
    };

    const minimizePanel = (targetId: string) => {
        setModeById(current => ({ ...current, [targetId]: 'minimized' }));
    };

    const closePanel = (targetId: string) => {
        setModeById(current => ({ ...current, [targetId]: 'closed' }));
    };

    const hasVisibleItems = items.some(item => (modeById[item.id] ?? 'minimized') !== 'closed');

    const panels = anchorRect && hasVisibleItems ? (
        <div style={{
            position: 'fixed',
            right: `${anchorRect.right}px`,
            bottom: `${anchorRect.bottom}px`,
            zIndex: 10000,
            display: isAnchorVisible ? 'flex' : 'none',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '10px',
            pointerEvents: 'none',
            maxWidth: `min(380px, ${anchorRect.width}px)`
        }}>
            {items.map(item => {
                const mode = modeById[item.id] ?? 'minimized';

                if (mode === 'closed') {
                    return null;
                }

                if (mode === 'minimized') {
                    return (
                        <div
                            key={item.id}
                            style={{
                                pointerEvents: 'auto',
                                background: '#FFFFFF',
                                border: `1px solid ${item.accent}`,
                                borderRadius: '999px',
                                padding: '8px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 10px 25px rgba(15, 23, 42, 0.12)',
                                maxWidth: '100%'
                            }}
                        >
                            <button
                                onClick={() => openPanel(item.id)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#0F172A',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: 0,
                                    minWidth: 0
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
                            <button
                                onClick={() => closePanel(item.id)}
                                style={{
                                    border: 'none',
                                    background: '#F8FAFC',
                                    color: '#475569',
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '999px',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                    flexShrink: 0,
                                    marginLeft: '4px'
                                }}
                                title="Fechar"
                            >
                                ×
                            </button>
                        </div>
                    );
                }

                return (
                    <div
                        key={item.id}
                        style={{
                            pointerEvents: 'auto',
                            width: 'min(380px, calc(100vw - 48px))',
                            maxWidth: '100%',
                            maxHeight: 'min(55vh, 480px)',
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
                            background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
                            flexShrink: 0
                        }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: item.subtitle ? '4px' : 0 }}>
                                    <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: item.accent, flexShrink: 0 }} />
                                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                                </div>
                                {item.badge && <div style={{ fontSize: '11px', color: '#475569', marginLeft: '18px' }}>{item.badge}</div>}
                                {item.subtitle && (
                                    <div style={{ fontSize: '11px', color: '#64748B', marginLeft: '18px' }}>{item.subtitle}</div>
                                )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
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
                                        fontWeight: 700
                                    }}
                                    title="Recolher"
                                >
                                    Recolher
                                </button>
                                <button
                                    onClick={() => closePanel(item.id)}
                                    style={{
                                        border: '1px solid #E2E8F0',
                                        background: '#FFFFFF',
                                        color: '#475569',
                                        width: '30px',
                                        height: '30px',
                                        borderRadius: '999px',
                                        cursor: 'pointer',
                                        fontWeight: 700,
                                        fontSize: '16px'
                                    }}
                                    title="Fechar"
                                >
                                    ×
                                </button>
                            </div>
                        </div>

                        <div style={{ overflowY: 'auto', overflowX: 'hidden', paddingBottom: '4px', maxWidth: '100%', wordBreak: 'break-word' }}>
                            {item.content}
                        </div>
                    </div>
                );
            })}
        </div>
    ) : null;

    return (
        <>
            <div ref={anchorRef} style={{ position: 'absolute', bottom: 0, right: 0, pointerEvents: 'none', width: 0, height: 0 }} />
            {panels && createPortal(panels, document.body)}
        </>
    );
}