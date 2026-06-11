import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface DispatchLog {
  id: string;
  part_id: string;
  dispatch_type: string;
  recipient_phone: string;
  status: string;
  created_at: string;
}

export function ZApiAuditPanel() {
  const [logs, setLogs] = useState<DispatchLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('zapi_dispatch_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Erro ao carregar logs do Z-API:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <div>Carregando auditoria...</div>;

  return (
    <div style={{ padding: '20px' }}>
      <button onClick={loadLogs} style={{ marginBottom: '15px', padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
        Atualizar Agora
      </button>

      <table className="modern-table">
        <thead>
          <tr>
            <th>Data / Hora</th>
            <th>Tipo de Disparo</th>
            <th>Telefone Destino</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr><td colSpan={4} style={{ textAlign: 'center' }}>Nenhum disparo registrado ainda.</td></tr>
          ) : (
            logs.map(log => (
              <tr key={log.id}>
                <td>{new Date(log.created_at).toLocaleString()}</td>
                <td>
                  <span style={{ 
                    padding: '4px 8px', 
                    borderRadius: '4px', 
                    fontSize: '0.85em',
                    background: log.dispatch_type.includes('ERROR') ? '#7f1d1d' : '#1e3a8a',
                    color: '#fff'
                  }}>
                    {log.dispatch_type}
                  </span>
                </td>
                <td>{log.recipient_phone}</td>
                <td>
                  <span style={{ color: log.status === 'SUCCESS' ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                    {log.status}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
