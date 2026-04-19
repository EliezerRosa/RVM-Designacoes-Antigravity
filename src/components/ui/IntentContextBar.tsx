import { useMemo, useState } from 'react';

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
    const [showDetails, setShowDetails] = useState(false);
    const profileLabel = accessLevel === 'elder' ? 'Ancião / gestão' : 'Publicador';
    const compactSummary = useMemo(() => {
        const details: string[] = [profileLabel];
        if (activeTopic && activeTopic !== 'Exploração geral') details.push(activeTopic);
        return details.join(' • ');
    }, [activeTopic, profileLabel]);

    return (
        <div style={{
            padding: '10px',
            borderBottom: '1px solid #E5E7EB',
            background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div style={{
                        padding: '8px 12px',
                        borderRadius: '999px',
                        background: '#EEF2FF',
                        border: '1px solid #C7D2FE',
                        color: '#3730A3',
                        fontSize: '12px',
                        fontWeight: 700,
                        whiteSpace: 'nowrap'
                    }}>
                        Semana {currentWeekId || 'não definida'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '12px', color: '#0F172A', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Contexto pronto para ação
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {compactSummary}
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => setShowDetails(current => !current)}
                    style={{
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        color: '#334155',
                        borderRadius: '999px',
                        padding: '7px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    {showDetails ? 'Ocultar detalhes' : 'Ver detalhes'}
                </button>
            </div>

            {showDetails && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <ContextPill label="Perfil" value={profileLabel} />
                    <ContextPill label="Tópico ativo" value={activeTopic} />
                    <ContextPill label="Estágio" value={stage} />
                </div>
            )}
        </div>
    );
}