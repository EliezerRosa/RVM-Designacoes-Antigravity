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
    if (chips.length === 0) return null;

    return (
        <div style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            padding: '8px 10px',
            borderTop: '1px solid #E5E7EB',
            borderBottom: '1px solid #E5E7EB',
            background: '#F8FAFC',
            scrollbarWidth: 'thin'
        }}>
            {chips.map(chip => (
                <button
                    key={chip.id}
                    onClick={chip.onClick}
                    style={{
                        flex: '0 0 auto',
                        padding: '8px 12px',
                        borderRadius: '999px',
                        border: chip.tone === 'accent' ? '1px solid #C7D2FE' : '1px solid #D1D5DB',
                        background: chip.tone === 'accent' ? '#EEF2FF' : '#FFFFFF',
                        color: chip.tone === 'accent' ? '#3730A3' : '#374151',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                    }}
                >
                    {chip.label}
                </button>
            ))}
        </div>
    );
}