import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';

interface CanonicalLog {
    id: string;
    log_timestamp: string;
    channel: 'WHATSAPP' | 'WEB_PUSH';
    direction: 'INBOUND' | 'OUTBOUND';
    sender_name: string;
    recipient_name: string;
    publisher_id: string | null;
    part_id: string | null;
    interaction_type: string;
    status_or_action: string;
    phone: string | null;
    content: string | null;
}

export const CommunicationLogPanel: React.FC = () => {
    const [logs, setLogs] = useState<CanonicalLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLogs = async () => {
        try {
            const { data, error: fetchError } = await supabase
                .from('vw_canonical_communication_log')
                .select('*')
                .order('log_timestamp', { ascending: false })
                .limit(50);

            if (fetchError) throw fetchError;
            setLogs(data as CanonicalLog[]);
        } catch (err: any) {
            console.error('Erro ao buscar log canônico:', err);
            setError(err.message || 'Erro ao carregar o log.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();

        // Inscreve-se nas 3 tabelas base para dar refresh na view
        const channels = [
            supabase.channel('zapi_dispatch_log_changes')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'zapi_dispatch_log' }, () => {
                    fetchLogs();
                }),
            supabase.channel('push_dispatch_log_changes')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'push_dispatch_log' }, () => {
                    fetchLogs();
                }),
            supabase.channel('zapi_smart_interactions_changes')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'zapi_smart_interactions' }, () => {
                    fetchLogs();
                })
        ];

        channels.forEach(ch => ch.subscribe());

        return () => {
            channels.forEach(ch => supabase.removeChannel(ch));
        };
    }, []);

    const getChannelIcon = (channel: string) => {
        if (channel === 'WHATSAPP') return '💬';
        if (channel === 'WEB_PUSH') return '🔔';
        return '📬';
    };

    const getDirectionIcon = (direction: string) => {
        if (direction === 'INBOUND') return '⬅️';
        if (direction === 'OUTBOUND') return '➡️';
        return '↔️';
    };

    return (
        <div style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>
                    Linha do tempo canônica e em tempo real de todas as comunicações (Z-API e Push Notifications).
                </p>
                <button className="btn-secondary" onClick={fetchLogs} disabled={loading}>
                    {loading ? 'Atualizando...' : '🔄 Atualizar'}
                </button>
            </div>

            {error && (
                <div style={{ padding: '12px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '16px' }}>
                    {error}
                </div>
            )}

            <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <table className="styled-table" style={{ width: '100%' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                        <tr>
                            <th>Data/Hora</th>
                            <th>Canal</th>
                            <th>De ➡️ Para</th>
                            <th>Tipo de Interação</th>
                            <th>Status/Ação</th>
                            <th>Conteúdo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.length === 0 && !loading ? (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                                    Nenhuma comunicação registrada.
                                </td>
                            </tr>
                        ) : (
                            logs.map(log => (
                                <tr key={log.id}>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                        {format(new Date(log.log_timestamp), 'dd/MM/yyyy HH:mm:ss')}
                                    </td>
                                    <td>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            {getChannelIcon(log.channel)} {log.channel}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem' }}>
                                            <span style={{ fontWeight: log.direction === 'INBOUND' ? 'bold' : 'normal' }}>
                                                {getDirectionIcon(log.direction)} <strong>{log.sender_name}</strong>
                                            </span>
                                            <span style={{ color: 'var(--text-muted)' }}>
                                                para {log.recipient_name}
                                            </span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className="level-badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                                            {log.interaction_type}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`level-badge ${log.status_or_action === 'SUCCESS' || log.status_or_action === 'STATUS_DESIGNADA' ? 'success' : 'high'}`} 
                                              style={{ 
                                                backgroundColor: log.status_or_action === 'SUCCESS' ? '#dcfce7' : '#f3f4f6', 
                                                color: log.status_or_action === 'SUCCESS' ? '#166534' : '#374151' 
                                              }}>
                                            {log.status_or_action}
                                        </span>
                                    </td>
                                    <td style={{ maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={log.content || ''}>
                                        {log.content || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
