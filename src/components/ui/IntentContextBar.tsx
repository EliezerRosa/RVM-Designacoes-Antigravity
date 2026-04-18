interface IntentContextBarProps {
    currentWeekId?: string;
    accessLevel: 'elder' | 'publisher';
    activeTopic: string;
    stage: string;
}

function ContextPill({ label, value }: { label: string; value: string }) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            padding: '8px 10px',
            borderRadius: '10px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            minWidth: '120px'
        }}>
            <span style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
                {label}
            </span>
            <span style={{ fontSize: '12px', color: '#0F172A', fontWeight: 600 }}>
                {value}
            </span>
        </div>
    );
}

export function IntentContextBar({ currentWeekId, accessLevel, activeTopic, stage }: IntentContextBarProps) {
    return (
        <div style={{
            padding: '10px',
            borderBottom: '1px solid #E5E7EB',
            background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px'
        }}>
            <ContextPill label="Semana em foco" value={currentWeekId || 'Não definida'} />
            <ContextPill label="Perfil" value={accessLevel === 'elder' ? 'Ancião / gestão' : 'Publicador'} />
            <ContextPill label="Tópico ativo" value={activeTopic} />
            <ContextPill label="Estágio" value={stage} />
        </div>
    );
}