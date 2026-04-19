import { useMemo, useState } from 'react';

export interface ChatActionChipItem {
    id: string;
    label: string;
    onClick: () => void;
    tone?: 'default' | 'accent';
}

interface ChatActionChipsProps {
    chips: ChatActionChipItem[];
}

export function ChatActionChips({ chips }: ChatActionChipsProps) {
    const [expanded, setExpanded] = useState(false);
    const compactSummary = useMemo(() => {
        if (chips.length === 0) return '';
        const preview = chips.slice(0, 2).map(chip => chip.label).join(' • ');
        return chips.length > 2 ? `${preview} • +${chips.length - 2}` : preview;
    }, [chips]);

    if (chips.length === 0) return null;

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            padding: '10px',
            borderTop: '1px solid #E5E7EB',
            background: '#F8FAFC',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Ações da conversa
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {compactSummary}
                    </div>
                </div>
                <button
                    onClick={() => setExpanded(current => !current)}
                    style={{
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        color: '#334155',
                        borderRadius: '999px',
                        padding: '7px 12px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                    }}
                >
                    {expanded ? 'Recolher' : `Abrir (${chips.length})`}
                </button>
            </div>

            {expanded && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {chips.map(chip => (
                        <button
                            key={chip.id}
                            onClick={chip.onClick}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '999px',
                                border: chip.tone === 'accent' ? '1px solid #C7D2FE' : '1px solid #D1D5DB',
                                background: chip.tone === 'accent' ? '#EEF2FF' : '#FFFFFF',
                                color: chip.tone === 'accent' ? '#3730A3' : '#374151',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            {chip.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}