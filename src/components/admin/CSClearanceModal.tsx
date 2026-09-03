import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';
import { createWhatsAppAutoServiceFromEnv } from '../../services/whatsappAutoService';
import type { Publisher, WorkbookPart } from '../../types';

interface CSClearanceModalProps {
  onClose: () => void;
  publishers?: Publisher[];
  weekParts?: WorkbookPart[];
  currentWeek?: string;
}

export function CSClearanceModal({ onClose, publishers: initialPublishers, weekParts = [], currentWeek }: CSClearanceModalProps) {
  const [publishers, setPublishers] = useState<Publisher[]>(initialPublishers || []);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [observations, setObservations] = useState('');
  const [loading, setLoading] = useState(!initialPublishers || initialPublishers.length === 0);
  const [sending, setSending] = useState(false);

  // 1. Carregar publicadores caso não tenham sido passados via props
  useEffect(() => {
    async function loadPublishersData() {
      if (initialPublishers && initialPublishers.length > 0) {
        setPublishers(initialPublishers);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const pubs = await api.loadPublishers();
        if (pubs && pubs.length > 0) {
          setPublishers(pubs);
        }
      } catch (err) {
        console.error('Erro ao carregar publicadores no modal CS:', err);
      } finally {
        setLoading(false);
      }
    }

    loadPublishersData();
  }, [initialPublishers]);

  // 2. Detectar Membros da Comissão de Serviço (Coordenador, Secretário, Sup. Serviço)
  const csMembersDetected = useMemo(() => {
    return publishers.filter(p => {
      const f = (p.funcao || '').toLowerCase();
      return (
        f.includes('coordenador') ||
        f.includes('secretário') ||
        f.includes('secretario') ||
        f.includes('superintendente de serviço') ||
        f.includes('serviço') ||
        f.includes('servico')
      );
    });
  }, [publishers]);

  // 3. Detectar quem são os publicadores escalados na semana atual
  const weekAssignedPubs = useMemo(() => {
    if (!weekParts || weekParts.length === 0) return [];
    
    // Normalizar nomes das partes
    const assignedNames = new Set(
      weekParts
        .map(p => p.rawPublisherName?.trim().toLowerCase())
        .filter(Boolean)
    );

    return publishers.filter(p => {
      const pName = p.name.trim().toLowerCase();
      if (assignedNames.has(pName)) return true;
      if (p.aliases && p.aliases.some(a => assignedNames.has(a.trim().toLowerCase()))) return true;
      return false;
    });
  }, [weekParts, publishers]);

  // 4. Carregar Grupos do Z-API
  useEffect(() => {
    async function loadGroups() {
      try {
        const { data: res } = await supabase.functions.invoke('send-whatsapp', {
          body: { action: 'list-groups' }
        });

        if (res && res.groups && Array.isArray(res.groups)) {
          setGroups(res.groups);
          // Tentar pré-selecionar o grupo da CS
          const csGroup = res.groups.find((g: any) => {
            const name = (g.name || '').toLowerCase();
            return name.includes('comissão de serviço') || name.includes('comissao de servico') || name === 'cs';
          });
          if (csGroup) {
            setSelectedGroupId(csGroup.id);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar grupos Z-API:', err);
      }
    }

    loadGroups();
  }, []);

  // Filtragem de publicadores pelo campo de busca
  const filteredPublishers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return publishers;
    return publishers.filter(p => 
      p.name.toLowerCase().includes(term) ||
      (p.funcao && p.funcao.toLowerCase().includes(term)) ||
      (p.condition && p.condition.toLowerCase().includes(term))
    );
  }, [publishers, searchTerm]);

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleSelectWeekDesignated = () => {
    const newSet = new Set(selectedIds);
    weekAssignedPubs.forEach(p => newSet.add(p.id));
    setSelectedIds(newSet);
  };

  const handleSelectAllFiltered = () => {
    const newSet = new Set(selectedIds);
    filteredPublishers.forEach(p => newSet.add(p.id));
    setSelectedIds(newSet);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleSend = async () => {
    if (selectedIds.size === 0) return alert('Selecione ao menos um publicador para confirmação.');
    if (!selectedGroupId) return alert('Selecione o Grupo ou Destino da CS via Z-API.');

    setSending(true);
    try {
      // 1. Obter Token Ativo para o link seguro
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
        const { data: anyToken } = await supabase
          .from('publisher_form_tokens')
          .select('token')
          .is('revoked_at', null)
          .or('expires_at.is.null,expires_at.gt.now()')
          .limit(1);

        if (anyToken && anyToken.length > 0) {
          tokenValue = anyToken[0].token;
        } else {
          return alert('Nenhum token administrativo ativo encontrado. Gere um token no Painel Admin.');
        }
      }

      const updateUrl = `${window.location.origin}/update-publishers?token=${tokenValue}`;

      // 2. Saudação baseada na hora do dia e nomes da CS
      const hour = new Date().getHours();
      let greetingTime = 'Bom dia';
      if (hour >= 12 && hour < 18) greetingTime = 'Boa tarde';
      else if (hour >= 18) greetingTime = 'Boa noite';

      const csFirstNames = csMembersDetected.map(p => p.name.split(' ')[0]);
      const csNamesStr = csFirstNames.length > 0 ? csFirstNames.join(', ') : 'Irmãos';
      const greeting = `${greetingTime} irmãos ${csNamesStr} (Comissão de Serviço).`;

      // 3. Montar Mensagem
      const selectedPubs = publishers.filter(p => selectedIds.has(p.id));
      const pubNamesStr = selectedPubs.map(p => `• *${p.name}*`).join('\n');

      const weekLabel = currentWeek ? ` da semana *${currentWeek}*` : '';
      let message = `${greeting}\n\nEstamos preparando o planejamento da Reunião de Meio de Semana${weekLabel} e precisamos confirmar se os seguintes publicadores possuem liberação/aprovação para designações:\n\n${pubNamesStr}\n`;

      if (observations.trim()) {
        message += `\n*Observações adicionais:*\n${observations.trim()}\n`;
      }

      message += `\nPor favor, confirmem ou atualizem eventuais restrições acessando o link seguro abaixo:\n${updateUrl}\n\nAgradecemos pela colaboração! 🙏`;

      // 4. Enviar Mensagem via Z-API
      const wa = createWhatsAppAutoServiceFromEnv();
      const res = await wa.sendText(selectedGroupId, message);

      if (res.success) {
        alert('✅ Mensagem enviada com sucesso para a Comissão de Serviço via WhatsApp!');
        onClose();
      } else {
        alert(`❌ Erro ao enviar mensagem via Z-API: ${res.error}`);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Erro inesperado ao disparar solicitação: ${err?.message || err}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📋</span> Solicitar Liberação à Comissão de Serviço
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
              Dispara uma mensagem formatada via Z-API para consulta direta aos anciãos da CS.
            </p>
          </div>
          <button onClick={onClose} style={closeBtnStyle} title="Fechar modal">✕</button>
        </div>

        {loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>⏳</div>
            Carregando publicadores e dados do sistema...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* 1. Membros da CS Detectados */}
            <div style={{ backgroundColor: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                  👥 Membros da CS Detectados (Para Saudação)
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{csMembersDetected.length} identificados</span>
              </div>
              {csMembersDetected.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {csMembersDetected.map(m => (
                    <span 
                      key={m.id} 
                      style={{ 
                        backgroundColor: '#e0f2fe', color: '#0369a1', fontSize: '0.75rem', fontWeight: 600, 
                        padding: '3px 8px', borderRadius: '6px', border: '1px solid #bae6fd', display: 'flex', alignItems: 'center', gap: '4px' 
                      }}
                    >
                      <span>👤</span> {m.name} <span style={{ opacity: 0.75, fontWeight: 400 }}>({m.funcao?.split(' ')[0] || 'CS'})</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '0.8125rem', color: '#b45309' }}>
                  ⚠️ Nenhum membro da CS com função cadastrada foi encontrado. A saudação usará genericamente "Irmãos".
                </p>
              )}
            </div>

            {/* 2. Seleção de Destino Z-API */}
            <div style={sectionStyle}>
              <label style={labelStyle}>1. Selecionar Destino (Z-API)</label>
              <select 
                value={selectedGroupId} 
                onChange={e => setSelectedGroupId(e.target.value)}
                style={inputStyle}
              >
                <option value="">-- Selecione o Grupo da Comissão de Serviço --</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              {groups.length === 0 && (
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  Nenhum grupo do Z-API retornado automaticamente ou aguardando resposta.
                </span>
              )}
            </div>

            {/* 3. Publicadores a Confirmar */}
            <div style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={labelStyle}>
                  2. Publicadores a Confirmar ({selectedIds.size} selecionados)
                </label>
                {selectedIds.size > 0 && (
                  <button 
                    type="button" 
                    onClick={handleClearSelection}
                    style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Desmarcar Todos
                  </button>
                )}
              </div>

              {/* Botões de Ação Rápida */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {weekAssignedPubs.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectWeekDesignated}
                    style={{
                      padding: '5px 10px', fontSize: '0.75rem', fontWeight: 600, background: '#f0fdf4',
                      color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '6px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '4px'
                    }}
                  >
                    ⚡ Selecionar designados da semana ({weekAssignedPubs.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  style={{
                    padding: '5px 10px', fontSize: '0.75rem', fontWeight: 500, background: '#f8fafc',
                    color: '#475569', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer'
                  }}
                >
                  Marcar todos filtrados ({filteredPublishers.length})
                </button>
              </div>

              {/* Campo de Busca Rápida */}
              <input 
                type="text"
                placeholder="🔍 Buscar publicador por nome ou função..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ ...inputStyle, padding: '6px 10px', fontSize: '0.8125rem' }}
              />

              {/* Lista com Rolagem */}
              <div style={listContainerStyle}>
                {filteredPublishers.length === 0 ? (
                  <p style={{ margin: 0, padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>
                    Nenhum publicador encontrado com o filtro aplicado.
                  </p>
                ) : (
                  filteredPublishers.map(p => {
                    const isSelected = selectedIds.has(p.id);
                    const isAssignedThisWeek = weekAssignedPubs.some(wp => wp.id === p.id);

                    return (
                      <label 
                        key={p.id} 
                        style={{
                          ...listItemStyle,
                          backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                          borderBottom: '1px solid #f1f5f9'
                        }}
                      >
                        <input 
                          type="checkbox" 
                          checked={isSelected}
                          onChange={() => toggleSelection(p.id)}
                          style={{ marginRight: '8px', cursor: 'pointer' }}
                        />
                        <span style={{ fontWeight: isSelected ? 600 : 400, color: '#1e293b', flex: 1 }}>
                          {p.name}
                        </span>
                        {isAssignedThisWeek && (
                          <span style={{ fontSize: '0.6875rem', backgroundColor: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px', marginRight: '6px' }}>
                            Semana Atual
                          </span>
                        )}
                        {p.condition && (
                          <span style={{ fontSize: '0.6875rem', backgroundColor: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: '4px' }}>
                            {p.condition}
                          </span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* 4. Observações */}
            <div style={sectionStyle}>
              <label style={labelStyle}>3. Observações (Opcional)</label>
              <textarea 
                value={observations}
                onChange={e => setObservations(e.target.value)}
                placeholder="Ex: O irmão já retornou de viagem e pode ser designado?"
                style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
              />
            </div>

            {/* Botão de Envio */}
            <button 
              onClick={handleSend} 
              disabled={sending || selectedIds.size === 0 || !selectedGroupId}
              style={{
                ...primaryBtnStyle,
                opacity: (sending || selectedIds.size === 0 || !selectedGroupId) ? 0.6 : 1,
                cursor: (sending || selectedIds.size === 0 || !selectedGroupId) ? 'not-allowed' : 'pointer'
              }}
            >
              {sending ? 'Enviando via Z-API...' : `Enviar Solicitação (${selectedIds.size} selecionado${selectedIds.size === 1 ? '' : 's'})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', 
  top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.75)', 
  backdropFilter: 'blur(6px)',
  zIndex: 100000,
  display: 'flex', 
  alignItems: 'center', 
  justifyContent: 'center',
  padding: '16px'
};

const modalStyle: React.CSSProperties = {
  background: '#ffffff', 
  borderRadius: '12px', 
  padding: '1.5rem',
  width: '100%', 
  maxWidth: '540px', 
  maxHeight: '92vh', 
  overflowY: 'auto',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)'
};

const closeBtnStyle: React.CSSProperties = {
  background: '#f1f5f9', 
  border: 'none', 
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  fontSize: '1rem', 
  cursor: 'pointer', 
  color: '#64748b',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const sectionStyle: React.CSSProperties = {
  display: 'flex', 
  flexDirection: 'column', 
  gap: '0.375rem'
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.875rem', 
  fontWeight: 600, 
  color: '#1e293b'
};

const inputStyle: React.CSSProperties = {
  padding: '0.625rem', 
  borderRadius: '6px', 
  border: '1px solid #cbd5e1', 
  fontSize: '0.875rem', 
  fontFamily: 'inherit',
  outline: 'none'
};

const listContainerStyle: React.CSSProperties = {
  maxHeight: '220px', 
  overflowY: 'auto', 
  border: '1px solid #cbd5e1', 
  borderRadius: '6px', 
  padding: '0.25rem',
  backgroundColor: '#ffffff'
};

const listItemStyle: React.CSSProperties = {
  display: 'flex', 
  alignItems: 'center', 
  padding: '0.375rem 0.5rem', 
  cursor: 'pointer', 
  fontSize: '0.875rem',
  borderRadius: '4px',
  userSelect: 'none'
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.75rem', 
  borderRadius: '8px', 
  border: 'none', 
  background: '#0284c7', 
  color: '#ffffff',
  fontSize: '0.9375rem', 
  fontWeight: 600, 
  marginTop: '0.5rem',
  transition: 'background-color 0.2s'
};
