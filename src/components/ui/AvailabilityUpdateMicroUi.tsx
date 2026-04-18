import { useEffect, useMemo, useState } from 'react';
import type { Publisher } from '../../types';

interface Props {
    publishers: Publisher[];
    defaultPublisherId?: string | null;
    defaultDate: string;
    busy: boolean;
    onConfirm: (publisherId: string, date: string) => Promise<void>;
}

export function AvailabilityUpdateMicroUi({
    publishers,
    defaultPublisherId = null,
    defaultDate,
    busy,
    onConfirm
}: Props) {
    const [selectedPublisherId, setSelectedPublisherId] = useState(defaultPublisherId || publishers[0]?.id || '');
    const [selectedDate, setSelectedDate] = useState(defaultDate);
    const [isPreviewing, setIsPreviewing] = useState(false);

    useEffect(() => {
        if (defaultPublisherId) {
            setSelectedPublisherId(defaultPublisherId);
        }
    }, [defaultPublisherId]);

    useEffect(() => {
        setSelectedDate(defaultDate);
    }, [defaultDate]);

    const selectedPublisher = useMemo(
        () => publishers.find(publisher => publisher.id === selectedPublisherId) || null,
        [publishers, selectedPublisherId]
    );

    if (publishers.length === 0) {
        return null;
    }

    return (
        <div style={{
            margin: '0 10px 10px 10px',
            padding: '12px',
            borderRadius: '12px',
            background: 'linear-gradient(180deg, #ECFEFF 0%, #FFFFFF 100%)',
            border: '1px solid #A5F3FC',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#155E75', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Micro-UI de disponibilidade
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#164E63' }}>
                        Bloquear uma data para um publicador
                    </div>
                </div>
                <div style={{ fontSize: '12px', color: '#0F766E' }}>
                    Fase {isPreviewing ? '2' : '1'}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                    Publicador
                    <select
                        value={selectedPublisherId}
                        onChange={(event) => {
                            setSelectedPublisherId(event.target.value);
                            setIsPreviewing(false);
                        }}
                        style={{
                            borderRadius: '8px',
                            border: '1px solid #BFDBFE',
                            padding: '8px 10px',
                            fontSize: '12px'
                        }}
                    >
                        {publishers.map(publisher => (
                            <option key={publisher.id} value={publisher.id}>{publisher.name}</option>
                        ))}
                    </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#334155' }}>
                    Data
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(event) => {
                            setSelectedDate(event.target.value);
                            setIsPreviewing(false);
                        }}
                        style={{
                            borderRadius: '8px',
                            border: '1px solid #BFDBFE',
                            padding: '8px 10px',
                            fontSize: '12px'
                        }}
                    />
                </label>

                <button
                    onClick={() => setIsPreviewing(true)}
                    disabled={!selectedPublisherId || !selectedDate || busy}
                    style={{
                        border: 'none',
                        borderRadius: '8px',
                        padding: '9px 12px',
                        cursor: !selectedPublisherId || !selectedDate || busy ? 'not-allowed' : 'pointer',
                        background: '#0F766E',
                        color: '#ECFEFF',
                        fontSize: '12px',
                        fontWeight: 600,
                        opacity: !selectedPublisherId || !selectedDate || busy ? 0.6 : 1
                    }}
                >
                    Preparar
                </button>
            </div>

            {isPreviewing && selectedPublisher && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #CFFAFE' }}>
                    <div style={{ fontSize: '12px', color: '#155E75', marginBottom: '6px' }}>
                        Preview: a data <strong>{selectedDate}</strong> será adicionada às indisponibilidades de <strong>{selectedPublisher.name}</strong>.
                    </div>
                    <div style={{ fontSize: '11px', color: '#0F766E', marginBottom: '8px' }}>
                        Commit via executor tipado de `UPDATE_AVAILABILITY`, com revalidação de permissão no momento da escrita.
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={() => void onConfirm(selectedPublisher.id, selectedDate)}
                            disabled={busy}
                            style={{
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                cursor: busy ? 'wait' : 'pointer',
                                background: '#164E63',
                                color: '#ECFEFF',
                                fontSize: '12px',
                                fontWeight: 600,
                                opacity: busy ? 0.7 : 1
                            }}
                        >
                            Confirmar bloqueio
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}