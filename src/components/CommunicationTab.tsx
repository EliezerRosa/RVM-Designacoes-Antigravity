import React, { useState, useEffect } from 'react';
import { communicationService, NotificationRecord } from '../services/communicationService';

export function CommunicationTab() {
    const [history, setHistory] = useState<NotificationRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        setLoading(true);
        try {
            const data = await communicationService.getHistory();
            setHistory(data);
        } catch (error) {
            console.error('Erro ao carregar histórico:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'PREPARED': return { background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' };
            case 'SENT': return { background: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7' };
            default: return { background: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB' };
        }
    };

    const getTypeEmoji = (type: string) => {
        switch (type) {
            case 'S140': return '📜';
            case 'S89': return '📇';
            case 'ANNOUNCEMENT': return '📢';
            case 'INDIVIDUAL': return '👤';
            default: return '✉️';
        }
    };

    return (
        <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, color: '#111827' }}>💬 Hub de Comunicação</h2>
                <button
                    onClick={loadHistory}
                    style={{
                        padding: '8px 16px', borderRadius: '8px', border: '1px solid #D1D5DB',
                        background: 'white', cursor: 'pointer', fontSize: '0.9em'
                    }}
                >
                    🔄 Atualizar
                </button>
            </div>

            {loading && <div style={{ textAlign: 'center', padding: '40px' }}>Carregando histórico...</div>}

            {!loading && history.length === 0 && (
                <div style={{ textAlign: 'center', padding: '80px', background: '#F9FAFB', borderRadius: '12px', color: '#6B7280' }}>
                    <div style={{ fontSize: '3em', marginBottom: '10px' }}>📩</div>
                    <p>Nenhuma comunicação foi gerada ainda.</p>
                    <p style={{ fontSize: '0.85em' }}>Peça ao Agente para enviar o S-140 ou avisar os estudantes.</p>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {history.map((item) => (
                    <div
                        key={item.id}
                        style={{
                            background: 'white', borderRadius: '12px', border: '1px solid #E5E7EB',
                            padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                            display: 'flex', flexDirection: 'column', gap: '8px'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '1.2em' }}>{getTypeEmoji(item.type)}</span>
                                <div>
                                    <div style={{ fontWeight: '600', color: '#111827' }}>{item.recipient_name}</div>
                                    <div style={{ fontSize: '0.8em', color: '#6B7280' }}>{item.title}</div>
                                </div>
                            </div>
                            <span style={{
                                padding: '2px 8px', borderRadius: '999px', fontSize: '0.75em', fontWeight: '600',
                                ...getStatusStyle(item.status || 'PREPARED')
                            }}>
                                {item.status === 'PREPARED' ? 'PENDENTE' : item.status}
                            </span>
                        </div>

                        <div style={{
                            background: '#F9FAFB', padding: '12px', borderRadius: '8px',
                            fontSize: '0.9em', color: '#374151', whiteSpace: 'pre-wrap',
                            border: '1px dashed #D1D5DB'
                        }}>
                            {item.content}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                            <span style={{ fontSize: '0.75em', color: '#9CA3AF' }}>
                                {item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : 'Agora'}
                            </span>

                            {item.action_url && (
                                <a
                                    href={item.action_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        padding: '8px 16px', background: '#25D366', color: 'white',
                                        borderRadius: '8px', textDecoration: 'none', fontWeight: '600',
                                        fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '6px'
                                    }}
                                >
                                    Enviar via WhatsApp ↗
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
