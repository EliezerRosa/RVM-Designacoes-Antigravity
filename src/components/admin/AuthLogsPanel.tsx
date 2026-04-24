import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { ProfileLinksPanel } from './ProfileLinksPanel';

interface AuthLog {
  id: string;
  profile_id: string | null;
  email: string;
  event_type: string;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface TransactionLog {
  id: string;
  profile_id: string | null;
  email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  old_data: unknown;
  new_data: unknown;
  created_at: string;
}

interface AuthRequest {
  id: string;
  profile_id: string;
  profile_email: string | null;
  profile_full_name: string | null;
  phone: string;
  code: string | null;
  status: string;
  created_at: string;
  expires_at: string | null;
}

type TabType = 'auth_logs' | 'transactions' | '2fa_requests' | 'links';

export function AuthLogsPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('auth_logs');
  const [authLogs, setAuthLogs] = useState<AuthLog[]>([]);
  const [transactions, setTransactions] = useState<TransactionLog[]>([]);
  const [authRequests, setAuthRequests] = useState<AuthRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (activeTab === 'links') return;
    setIsLoading(true);
    try {
      if (activeTab === 'auth_logs') {
        const { data, error } = await supabase.rpc('admin_list_auth_logs', { p_limit: 200 });
        if (error) console.error('[AuthLogsPanel] auth_logs:', error);
        setAuthLogs((data as AuthLog[]) || []);
      } else if (activeTab === 'transactions') {
        const { data, error } = await supabase.rpc('admin_list_transaction_logs', { p_limit: 200 });
        if (error) console.error('[AuthLogsPanel] transactions:', error);
        setTransactions((data as TransactionLog[]) || []);
      } else {
        const { data, error } = await supabase.rpc('admin_list_auth_requests', { p_limit: 100 });
        if (error) console.error('[AuthLogsPanel] auth_requests:', error);
        setAuthRequests((data as AuthRequest[]) || []);
      }
    } catch (e) {
      console.error('[AuthLogsPanel] Error:', e);
    }
    setIsLoading(false);
  }, [activeTab]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const eventEmoji: Record<string, string> = {
    login: '🟢',
    logout: '🔴',
    '2fa_request': '📱',
    '2fa_verified': '✅',
    '2fa_failed': '❌',
  };

  const statusColor: Record<string, string> = {
    pending: '#f59e0b',
    verified: '#10b981',
    expired: '#6b7280',
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h3 style={{ color: '#1e293b', marginBottom: '1rem' }}>🔐 Histórico de Autenticação & Transações</h3>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {([
          { key: 'auth_logs', label: '🔐 Logins/Logouts' },
          { key: 'transactions', label: '📋 Transações' },
          { key: '2fa_requests', label: '📱 Solicitações 2FA' },
          { key: 'links', label: '🔗 Vínculos' },
        ] as { key: TabType; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: activeTab === t.key ? 'none' : '1px solid #cbd5e1',
              background: activeTab === t.key ? '#3b82f6' : 'transparent',
              color: activeTab === t.key ? '#fff' : '#475569',
              cursor: 'pointer',
              fontSize: '0.825rem',
              fontWeight: 600,
            }}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={fetchData}
          style={{
            marginLeft: 'auto', padding: '0.5rem 1rem', borderRadius: '0.5rem',
            border: '1px solid #cbd5e1', background: 'transparent', color: '#475569',
            cursor: 'pointer', fontSize: '0.825rem',
          }}
        >
          🔄 Atualizar
        </button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', color: '#475569', padding: '2rem' }}>Carregando...</div>
      ) : activeTab === 'links' ? (
        <ProfileLinksPanel />
      ) : activeTab === 'auth_logs' ? (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Data</th>
              <th style={thStyle}>Evento</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {authLogs.length === 0 ? (
              <tr><td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: '#64748b' }}>Nenhum registro encontrado</td></tr>
            ) : authLogs.map(log => (
              <tr key={log.id}>
                <td style={tdStyle}>{formatDate(log.created_at)}</td>
                <td style={tdStyle}>
                  {eventEmoji[log.event_type] || '❓'} {log.event_type}
                </td>
                <td style={tdStyle}>{log.email}</td>
                <td style={{ ...tdStyle, fontSize: '0.725rem', color: '#64748b' }}>
                  {log.metadata && Object.keys(log.metadata).length > 0
                    ? JSON.stringify(log.metadata)
                    : log.user_agent?.substring(0, 50) || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : activeTab === 'transactions' ? (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Data</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Ação</th>
              <th style={thStyle}>Entidade</th>
              <th style={thStyle}>Descrição</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#64748b' }}>Nenhuma transação registrada</td></tr>
            ) : transactions.map(tx => (
              <tr key={tx.id}>
                <td style={tdStyle}>{formatDate(tx.created_at)}</td>
                <td style={tdStyle}>{tx.email || '—'}</td>
                <td style={tdStyle}><strong>{tx.action}</strong></td>
                <td style={tdStyle}>{tx.entity_type} {tx.entity_id ? `#${tx.entity_id.slice(0, 8)}` : ''}</td>
                <td style={{ ...tdStyle, fontSize: '0.725rem' }}>{tx.description || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Data</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Telefone</th>
              <th style={thStyle}>Código</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {authRequests.length === 0 ? (
              <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#64748b' }}>Nenhuma solicitação</td></tr>
            ) : authRequests.map(req => (
              <tr key={req.id}>
                <td style={tdStyle}>{formatDate(req.created_at)}</td>
                <td style={tdStyle}>{req.profile_email || '—'}</td>
                <td style={tdStyle}>{req.phone}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', letterSpacing: '0.15em' }}>{req.code || '—'}</td>
                <td style={tdStyle}>
                  <span style={{
                    background: statusColor[req.status] || '#6b7280',
                    color: '#fff',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.725rem',
                    fontWeight: 700,
                  }}>
                    {req.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.825rem',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.6rem 0.75rem',
  color: '#475569',
  borderBottom: '1px solid #cbd5e1',
  fontWeight: 700,
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem',
  color: '#1e293b',
  borderBottom: '1px solid #e2e8f0',
};
