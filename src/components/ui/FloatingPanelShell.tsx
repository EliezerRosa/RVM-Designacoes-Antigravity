import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface FloatingPanelShellProps {
    id: string;
    title: string;
    subtitle?: string;
    badge?: string;
    accent?: string;
    width?: string;
    maxWidth?: string;
    maxHeight?: string;
    isOpen: boolean;
    onClose: () => void;
    resetKey?: string;
    children: ReactNode;
}

export function FloatingPanelShell({
    id,
    title,
    subtitle,
    badge,
    accent = '#4F46E5',
    width = 'min(560px, calc(100vw - 48px))',
    maxWidth = 'calc(100vw - 48px)',
    maxHeight = 'min(78vh, 720px)',
    isOpen,
    onClose,
    resetKey,
    children,
}: FloatingPanelShellProps) {
    const [isMinimized, setIsMinimized] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setIsMinimized(false);
        }
    }, [isOpen]);

    useEffect(() => {
        setIsMinimized(false);
    }, [resetKey]);

    if (!isOpen) return null;

    if (isMinimized) {
        return (
            <div style={{
                position: 'fixed',
                right: '16px',
                bottom: '16px',
                zIndex: 10020,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#FFFFFF',
                border: `1px solid ${accent}`,
                borderRadius: '999px',
                padding: '8px 12px',
                boxShadow: '0 12px 30px rgba(15, 23, 42, 0.18)'
            }}>
                <button
                    onClick={() => setIsMinimized(false)}
                    style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: '#0F172A',
                        padding: 0
                    }}
                    title="Exibir"
                >
                    <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: accent }} />
                    <span style={{ fontSize: '12px', fontWeight: 700 }}>{title}</span>
                    {badge && <span style={{ fontSize: '11px', color: '#64748B' }}>{badge}</span>}
                </button>
                <button
                    onClick={onClose}
                    style={{
                        border: 'none',
                        background: '#F8FAFC',
                        color: '#475569',
                        width: '26px',
                        height: '26px',
                        borderRadius: '999px',
                        cursor: 'pointer',
                        fontWeight: 700
                    }}
                    title="Fechar"
                >
                    ×
                </button>
            </div>
        );
    }

    return (
        <div style={{
            position: 'fixed',
            right: '16px',
            bottom: '16px',
            zIndex: 10020,
            width,
            maxWidth,
            maxHeight,
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(255,255,255,0.98)',
            backdropFilter: 'blur(10px)',
            borderRadius: '18px',
            border: `1px solid ${accent}`,
            boxShadow: '0 30px 60px rgba(15, 23, 42, 0.24)',
            overflow: 'hidden'
        }}>
            <div style={{
                padding: '12px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
                borderBottom: '1px solid #E2E8F0',
                background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)'
            }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: subtitle ? '4px' : 0 }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: accent, flexShrink: 0 }} />
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{title}</div>
                        {badge && <div style={{ fontSize: '11px', color: '#64748B' }}>{badge}</div>}
                    </div>
                    {subtitle && <div style={{ fontSize: '11px', color: '#64748B' }}>{subtitle}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <button
                        onClick={() => setIsMinimized(true)}
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
                        onClick={onClose}
                        style={{
                            border: '1px solid #E2E8F0',
                            background: '#FFFFFF',
                            color: '#475569',
                            width: '30px',
                            height: '30px',
                            borderRadius: '999px',
                            cursor: 'pointer',
                            fontWeight: 700
                        }}
                        title="Fechar"
                    >
                        ×
                    </button>
                </div>
            </div>
            <div id={id} style={{ overflowY: 'auto', paddingBottom: '4px' }}>
                {children}
            </div>
        </div>
    );
}