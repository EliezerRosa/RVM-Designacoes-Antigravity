import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { createWhatsAppAutoServiceFromEnv } from '../../services/whatsappAutoService';
import type { Publisher } from '../../types';

interface CSClearanceModalProps {
  onClose: () => void;
}

export function CSClearanceModal({ onClose }: CSClearanceModalProps) {
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [csMembers, setCsMembers] = useState<string[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [observations, setObservations] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        // 1. Carregar publicadores (ativos)
        const { data: pubs } = await supabase
          .from('publishers')
          .select('*')
          .eq('is_active', true)
          .order('name');
        
        if (pubs) {
          setPublishers(pubs as Publisher[]);
          
          // Filtrar membros da CS (privilégios: coordenador, secretario, sup. de servico)
          const cs = pubs.filter(p => {
            const privs = (p.privileges || []).map((pr: string) => pr.toLowerCase());
            return privs.some((pr: string) => 
              pr.includes('coordenador') || 
              pr.includes('secretário') || 
              pr.includes('secretario') || 
              pr.includes('serviço') ||
              pr.includes('servico')
            );
          });
          setCsMembers(cs.map(p => p.name.split(' ')[0])); // Apenas o primeiro nome
        }

        // 2. Carregar grupos do Z-API via Edge Function
        const { data: res } = await supabase.functions.invoke('send-whatsapp', {
          body: { action: 'list-groups' }
        });
        
        if (res && res.groups) {
          setGroups(res.groups);
          // Tentar pre-selecionar o grupo da CS
          const csGroup = res.groups.find((g: any) => g.name.toLowerCase().includes('comissão de serviço') || g.name.toLowerCase().includes('comissao de servico') || g.name.toLowerCase() === 'cs');
          if (csGroup) setSelectedGroupId(csGroup.id);
        }

      } catch (err) {
        console.error('Erro ao carregar dados do modal CS:', err);
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, []);

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleSend = async () => {
    if (selectedIds.size === 0) return alert('Selecione ao menos um publicador.');
    if (!selectedGroupId) return alert('Selecione o Grupo/Lista de Transmissão da CS.');
    
    setSending(true);
    try {
      // 1. Obter um token válido da CS
      const { data: tokens } = await supabase
        .from('publisher_form_tokens')
        .select('token')
        .is('revoked_at', null)
        .or('expires_at.is.null,expires_at.gt.now()')
        .ilike('label', '%comiss%')
        .limit(1);

      let tokenValue = '';
      if (tokens && tokens.length > 0) {
        tokenValue = tokens[0].token;
      } else {
        // Fallback: Pega qualquer token ativo se não achar um específico da CS
        const { data: anyToken } = await supabase
          .from('publisher_form_tokens')
          .select('token')
          .is('revoked_at', null)
          .or('expires_at.is.null,expires_at.gt.now()')
          .limit(1);
        
        if (anyToken && anyToken.length > 0) {
          tokenValue = anyToken[0].token;
        } else {
          return alert('Nenhum token administrativo válido encontrado. Gere um token no Painel Admin primeiro.');
        }
      }

      const updateUrl = `${window.location.origin}/update-publishers?token=${tokenValue}`;

      // 2. Formatar Saudação
      const hour = new Date().getHours();
      let greetingTime = 'Bom dia';
      if (hour >= 12 && hour < 18) greetingTime = 'Boa tarde';
      else if (hour >= 18) greetingTime = 'Boa noite';

      const csNamesStr = csMembers.length > 0 ? csMembers.join(', ') : 'Irmãos';
      const greeting = `${greetingTime} irmãos ${csNamesStr} (Comissão de Serviço).`;

      // 3. Montar Mensagem
      const selectedPubs = publishers.filter(p => selectedIds.has(p.id));
      const pubNamesStr = selectedPubs.map(p => `• ${p.name}`).join('\n');

      let message = `${greeting}\n\nEstamos preparando a Reunião de Meio de Semana e precisamos confirmar se os seguintes publicadores estão liberados/aprovados para participação:\n\n${pubNamesStr}\n`;
      
      if (observations.trim()) {
        message += `\n*Observações adicionais:*\n${observations.trim()}\n`;
      }

      message += `\nPor favor, atualizem a condição ou restrições deles acessando o link abaixo:\n${updateUrl}\n\nAgradecemos a ajuda! 🙏`;

      // 4. Enviar via Z-API
      const wa = createWhatsAppAutoServiceFromEnv();
      const res = await wa.sendText(selectedGroupId, message);

      if (res.success) {
        alert('Mensagem enviada com sucesso para a CS!');
        onClose();
      } else {
        alert(`Erro ao enviar: ${res.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Erro inesperado ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, color: '#1e293b' }}>Solicitar Liberação à CS</h2>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {loading ? (
          <p>Carregando dados...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            <div style={sectionStyle}>
              <label style={labelStyle}>Membros da CS Detectados (Para Saudação):</label>
              <div style={{ fontSize: '0.875rem', color: '#475569' }}>
                {csMembers.length > 0 ? csMembers.join(', ') : 'Nenhum membro detectado. O cumprimento usará "Irmãos".'}
              </div>
            </div>

            <div style={sectionStyle}>
              <label style={labelStyle}>1. Selecionar Destino (Z-API)</label>
              {groups.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: '#ef4444' }}>Não foi possível carregar grupos do Z-API.</p>
              ) : (
                <select 
                  value={selectedGroupId} 
                  onChange={e => setSelectedGroupId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Selecione o Grupo / Lista...</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div style={sectionStyle}>
              <label style={labelStyle}>2. Publicadores a Confirmar ({selectedIds.size} selecionados)</label>
              <div style={listContainerStyle}>
                {publishers.map(p => (
                  <label key={p.id} style={listItemStyle}>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelection(p.id)}
                      style={{ marginRight: '0.5rem' }}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>

            <div style={sectionStyle}>
              <label style={labelStyle}>3. Observações (Opcional)</label>
              <textarea 
                value={observations}
                onChange={e => setObservations(e.target.value)}
                placeholder="Ex: O irmão X voltou de viagem?"
                style={{ ...inputStyle, minHeight: '60px' }}
              />
            </div>

            <button 
              onClick={handleSend} 
              disabled={sending || selectedIds.size === 0 || !selectedGroupId}
              style={{
                ...primaryBtnStyle,
                opacity: (sending || selectedIds.size === 0 || !selectedGroupId) ? 0.6 : 1
              }}
            >
              {sending ? 'Enviando via Z-API...' : 'Enviar Solicitação'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
  display: 'flex', alignItems: 'center', justifyContent: 'center'
};

const modalStyle: React.CSSProperties = {
  background: '#fff', borderRadius: '8px', padding: '1.5rem',
  width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto',
  boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
};

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748b'
};

const sectionStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.5rem'
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.875rem', fontWeight: 600, color: '#334155'
};

const inputStyle: React.CSSProperties = {
  padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.875rem', fontFamily: 'inherit'
};

const listContainerStyle: React.CSSProperties = {
  maxHeight: '200px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.5rem'
};

const listItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '0.25rem 0', cursor: 'pointer', fontSize: '0.875rem'
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.75rem', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#fff',
  fontSize: '1rem', fontWeight: 600, cursor: 'pointer', marginTop: '1rem'
};
