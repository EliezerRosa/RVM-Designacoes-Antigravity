import type { WorkbookPart } from '../../types';

interface IntentContextBarProps {
    currentWeekId?: string;
    accessLevel: 'elder' | 'publisher';
    actorLabel?: string;
    activeTopic: string;
    stage: string | null;
    focusedPart?: WorkbookPart | null;
}

export function IntentContextBar({ currentWeekId, accessLevel, actorLabel, activeTopic, stage, focusedPart }: IntentContextBarProps) {
    const profileLabel = actorLabel || (accessLevel === 'elder' ? 'Gestão' : 'Publicador');
    const focusedPartLabel = focusedPart
        ? `${focusedPart.tituloParte || focusedPart.tipoParte} · ${focusedPart.status}`
        : 'Nenhuma parte selecionada';
    const showActivity = stage && stage !== 'Consulta';
    const showTopic = activeTopic && activeTopic !== 'Exploração geral';

    return (
        <div style={{
            padding: '8px 10px',
            borderBottom: '1px solid #E5E7EB',
            background: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            minWidth: 0,
        }}>
            <span style={{
                padding: '5px 8px',
                borderRadius: '6px',
                background: '#EEF2FF',
                color: '#3730A3',
                fontSize: '11px',
                fontWeight: 700,
                whiteSpace: 'nowrap',
            }}>
                {currentWeekId || 'Semana não definida'}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '12px', color: '#0F172A', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {focusedPartLabel}
                </div>
                {(showTopic || showActivity) && (
                    <div style={{ fontSize: '10px', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {[showTopic ? activeTopic : null, showActivity ? stage : null].filter(Boolean).join(' · ')}
                    </div>
                )}
            </div>
            <span style={{ fontSize: '10px', color: '#475569', whiteSpace: 'nowrap' }}>{profileLabel}</span>
        </div>
    );
}