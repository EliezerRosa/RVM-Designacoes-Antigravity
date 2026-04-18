export interface SlashCommandItem {
    id: string;
    command: string;
    description: string;
    onSelect: () => void;
}

interface SlashCommandMenuProps {
    commands: SlashCommandItem[];
}

export function SlashCommandMenu({ commands }: SlashCommandMenuProps) {
    if (commands.length === 0) return null;

    return (
        <div style={{
            position: 'absolute',
            left: '8px',
            right: '8px',
            bottom: '56px',
            background: '#FFFFFF',
            border: '1px solid #D1D5DB',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)',
            overflow: 'hidden',
            zIndex: 20,
            maxHeight: '240px',
            overflowY: 'auto'
        }}>
            <div style={{ padding: '8px 12px', background: '#F8FAFC', borderBottom: '1px solid #E5E7EB', fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Comandos disponíveis
            </div>
            {commands.map(command => (
                <button
                    key={command.id}
                    onClick={command.onSelect}
                    style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        background: '#FFFFFF',
                        border: 'none',
                        borderBottom: '1px solid #F1F5F9',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px'
                    }}
                >
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{command.command}</span>
                    <span style={{ fontSize: '11px', color: '#64748B' }}>{command.description}</span>
                </button>
            ))}
        </div>
    );
}