import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { CustomPushModal } from './CustomPushModal';

interface DispatchLog {
  id: string;
  part_id: string;
  dispatch_type: string;
  recipient_phone: string;
  status: string;
  dispatched_at: string;
}

export function ZApiAuditPanel() {
  const [logs, setLogs] = useState<DispatchLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetesting, setIsRetesting] = useState<string | null>(null);
  const [showCustomModal, setShowCustomModal] = useState(false);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('zapi_dispatch_log')
        .select('*')
        .order('dispatched_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Erro ao carregar logs do Z-API:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetestPush = async (logId: string) => {
    try {
      setIsRetesting(logId);
      
      // 1. Apaga da tabela push_dispatch_log via RPC
      const { error: rpcErr } = await supabase.rpc('reset_push_dispatch_log', { p_zapi_log_id: logId });
      if (rpcErr) throw rpcErr;

      // 2. Chama o cron-web-push para re-processar
      const { error: invokeErr } = await supabase.functions.invoke('cron-web-push');
      if (invokeErr) throw invokeErr;

      alert('Sinal enviado ao Cron Web Push com sucesso!');
    } catch (err: any) {
      console.error('Erro ao retestar push:', err);
      alert('Erro: ' + err.message);
    } finally {
      setIsRetesting(null);
    }
  };

  if (isLoading) return <div>Carregando auditoria...</div>;

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
        <button onClick={loadLogs} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Atualizar Agora
        </button>
        
        <button onClick={() => setShowCustomModal(true)} style={{ padding: '8px 16px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          📣 Novo Aviso Web Push (Megafone)
        </button>
      </div>

      {showCustomModal && (
        <CustomPushModal onClose={() => setShowCustomModal(false)} />
      )}

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
                <td>{new Date(log.dispatched_at).toLocaleString()}</td>
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
                <td style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ color: log.status === 'SUCCESS' ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                    {log.status}
                  </span>
                  {log.status === 'SUCCESS' && (
                    <button 
                      onClick={() => handleRetestPush(log.id)}
                      disabled={isRetesting === log.id}
                      style={{
                        padding: '4px 8px', fontSize: '0.8rem', background: '#475569', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer',
                        opacity: isRetesting === log.id ? 0.5 : 1
                      }}
                      title="Apaga o log de PWA e chama o cron novamente para forçar o reenvio"
                    >
                      {isRetesting === log.id ? 'Testando...' : 'Retestar PWA (Barreira)'}
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
