import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';
import { createWhatsAppAutoServiceFromEnv } from '../../services/whatsappAutoService';
import { zapiOrchestrator } from '../../services/zapiOrchestrator';
import type { Publisher, WorkbookPart } from '../../types';

interface CSClearanceModalProps {
  onClose: () => void;
  publishers?: Publisher[];
  weekParts?: WorkbookPart[];
  currentWeek?: string;
}

type DestinationMode = 'direct_cs' | 'group' | 'manual';
type PublisherStatusFilter = 'all' | 'paused' | 'inactive' | 'not_qualified' | 'this_week';

/** Retorna o texto formatado do status e motivo do publicador */
export function getPublisherStatusText(p: Publisher): string {
  const parts: string[] = [];

  if (p.isIndefinitelyPaused) {
    parts.push(p.indefinitePauseReason ? `Pausado: ${p.indefinitePauseReason}` : 'Pausado');
  } else if (p.availability?.mode === 'never') {
    parts.push('Pausado');
  }

  if (p.isNotQualified) {
    parts.push(p.notQualifiedReason ? `Não Apto: ${p.notQualifiedReason}` : 'Não Apto (Restrito)');
  } else if (p.requestedNoParticipation) {
    parts.push(p.noParticipationReason ? `Restrito: ${p.noParticipationReason}` : 'Restrito');
  }

  if (p.isServing === false) {
    parts.push('Inativo');
  }

  if (parts.length === 0) {
    return 'Ativo';
  }

  return parts.join(', ');
}

export function CSClearanceModal({ onClose, publishers: initialPublishers, weekParts = [], currentWeek }: CSClearanceModalProps) {
  const [publishers, setPublishers] = useState<Publisher[]>(initialPublishers || []);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<PublisherStatusFilter>('all');
  
  // Modos de Destino
  const [destMode, setDestMode] = useState<DestinationMode>('direct_cs');
  const [groups, setGroups] = useState<{ id: string; name: string; type?: string }[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [manualDestinationId, setManualDestinationId] = useState('');
  const [loadingGroups, setLoadingGroups] = useState(false);
  
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

  // 4. Contagens para o dropdown de filtros
  const statusCounts = useMemo(() => {
    let paused = 0;
    let inactive = 0;
    let notQualified = 0;

    publishers.forEach(p => {
      if (p.isIndefinitelyPaused || p.availability?.mode === 'never') paused++;
      if (p.isServing === false) inactive++;
      if (p.isNotQualified || p.requestedNoParticipation) notQualified++;
    });

    return {
      all: publishers.length,
      paused,
      inactive,
      notQualified,
      thisWeek: weekAssignedPubs.length
    };
  }, [publishers, weekAssignedPubs]);

  // 5. Carregar Grupos e Listas de Transmissão do Z-API
  const loadGroups = async () => {
    try {
      setLoadingGroups(true);
      const { data: res } = await supabase.functions.invoke('send-whatsapp', {
        body: { action: 'list-groups' }
      });

      if (res && res.groups && Array.isArray(res.groups)) {
        setGroups(res.groups);
        const csDestination = res.groups.find((g: any) => {
          const name = (g.name || '').toLowerCase();
          return name.includes('comissão de serviço') || 
                 name.includes('comissao de servico') || 
                 name.includes('comissão') ||
                 name.includes('comissao') ||
                 name.includes('cs');
        });
        if (csDestination && !selectedGroupId) {
          setSelectedGroupId(csDestination.id);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar grupos e listas Z-API:', err);
    } finally {
      setLoadingGroups(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  // 6. Filtragem de publicadores pelo dropdown de status e busca textual
  const filteredPublishers = useMemo(() => {
    let list = publishers;

    // Filtro pelo Dropdown de Status
    if (statusFilter === 'paused') {
      list = list.filter(p => p.isIndefinitelyPaused || p.availability?.mode === 'never');
    } else if (statusFilter === 'inactive') {
      list = list.filter(p => p.isServing === false);
    } else if (statusFilter === 'not_qualified') {
      list = list.filter(p => p.isNotQualified || p.requestedNoParticipation);
    } else if (statusFilter === 'this_week') {
      list = list.filter(p => weekAssignedPubs.some(wp => wp.id === p.id));
    }

    // Filtro por texto
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      list = list.filter(p => 
        p.name.toLowerCase().includes(term) ||
        (p.funcao && p.funcao.toLowerCase().includes(term)) ||
        (p.condition && p.condition.toLowerCase().includes(term)) ||
        (p.indefinitePauseReason && p.indefinitePauseReason.toLowerCase().includes(term)) ||
        (p.notQualifiedReason && p.notQualifiedReason.toLowerCase().includes(term))
      );
    }

    return list;
  }, [publishers, statusFilter, searchTerm, weekAssignedPubs]);

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
    if (selectedIds.size === 0) {
      return alert('Selecione ao menos um publicador para confirmação.');
    }

    if (destMode === 'group' && !selectedGroupId) {
      return alert('Selecione o Grupo do WhatsApp no menu.');
    }

    if (destMode === 'manual' && !manualDestinationId.trim()) {
      return alert('Informe o ID de destino (Grupo ou Lista de Transmissão).');
    }

    if (destMode === 'direct_cs' && csMembersDetected.length === 0) {
      return alert('Nenhum membro da Comissão de Serviço foi identificado no cadastro.');
    }

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
          return alert('Nenhum token administrativo ativo encontrado. Gere um token no Painel Admin primeiro.');
        }
      }

      const base = window.location.origin + window.location.pathname;
      const cleanBase = base.replace(/\/+$/, '');
      const updateUrl = `${cleanBase}?portal=publisher-form&token=${tokenValue}`;

      // 2. Saudação baseada na hora do dia e nomes da CS
      const hour = new Date().getHours();
      let greetingTime = 'Bom dia';
      if (hour >= 12 && hour < 18) greetingTime = 'Boa tarde';
      else if (hour >= 18) greetingTime = 'Boa noite';

      const csFirstNames = csMembersDetected.map(p => p.name.split(' ')[0]);
      const csNamesStr = csFirstNames.length > 0 ? csFirstNames.join(', ') : 'Irmãos';
      const greeting = `${greetingTime} irmãos ${csNamesStr} (Comissão de Serviço).`;

      // 3. Montar Mensagem incluindo entre parênteses o status de cada selecionado
      const selectedPubs = publishers.filter(p => selectedIds.has(p.id));
      const pubNamesStr = selectedPubs
        .map(p => `• *${p.name}* (${getPublisherStatusText(p)})`)
        .join('\n');

      const weekLabel = currentWeek ? ` da semana *${currentWeek}*` : '';
      let message = `${greeting}\n\nEstamos preparando o planejamento da Reunião de Meio de Semana${weekLabel} e precisamos confirmar se os seguintes publicadores possuem liberação/aprovação para designações:\n\n${pubNamesStr}\n`;

      if (observations.trim()) {
        message += `\n*Observações adicionais:*\n${observations.trim()}\n`;
      }

      message += `\nPor favor, confirmem ou atualizem eventuais restrições acessando o link seguro abaixo:\n${updateUrl}\n\nAgradecemos pela colaboração! 🙏`;

      // 4. Executar Disparo Conforme o Modo Escolhido
      if (destMode === 'direct_cs') {
        const validMembers = csMembersDetected.filter(m => m.phone && m.phone.trim().length >= 8);
        if (validMembers.length === 0) {
          return alert('Nenhum dos membros da Comissão de Serviço possui número de telefone cadastrado.');
        }

        let sentCount = 0;
        let errors: string[] = [];

        for (const m of validMembers) {
          let res: { success: boolean; error?: string } = await zapiOrchestrator.sendTextDirect(m.phone, message);
          if (!res.success) {
            const wa = createWhatsAppAutoServiceFromEnv();
            const waRes = await wa.sendText(m.phone, message);
            res = { success: waRes.success, error: waRes.error };
          }

          if (res.success) {
            sentCount++;
          } else {
            errors.push(`${m.name}: ${res.error}`);
          }
        }

        if (sentCount > 0) {
          alert(`✅ Solicitação enviada com sucesso diretamente para ${sentCount} membro(s) da CS:\n${validMembers.map(m => `• ${m.name}`).join('\n')}`);
          onClose();
        } else {
          alert(`❌ Falha ao enviar para os membros da CS:\n${errors.join('\n')}`);
        }
      } else {
        const effectiveTarget = destMode === 'manual' ? manualDestinationId.trim() : selectedGroupId;
        
        let res: { success: boolean; error?: string } = await zapiOrchestrator.sendTextDirect(effectiveTarget, message);
        if (!res.success) {
          console.warn('[CSClearanceModal] Tentando via waService direto:', res.error);
          const wa = createWhatsAppAutoServiceFromEnv();
          const waRes = await wa.sendText(effectiveTarget, message);
          res = { success: waRes.success, error: waRes.error };
        }

        if (res.success) {
          alert('✅ Mensagem enviada com sucesso para o destino WhatsApp!');
          onClose();
        } else {
          alert(`❌ Erro ao enviar mensagem via Z-API: ${res.error}`);
        }
      }

    } catch (err: any) {
      console.error(err);
      alert(`Erro inesperado ao disparar solicitação: ${err?.message || err}`);
    } finally {
      setSending(false);
    }
  };

  const isSubmitDisabled = 
    sending || 
    selectedIds.size === 0 || 
    (destMode === 'group' && !selectedGroupId) || 
    (destMode === 'manual' && !manualDestinationId.trim()) ||
    (destMode === 'direct_cs' && csMembersDetected.length === 0);

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
              Envia os nomes pendentes e link de validação direta para os anciãos da CS.
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

            {/* 2. Seleção do Destino do Envio */}
            <div style={sectionStyle}>
              <label style={labelStyle}>1. Destino do Envio (Como deseja enviar?)</label>
              
              {/* Botões de Seleção de Modo */}
              <div style={{ display: 'flex', gap: '6px', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                <button
                  type="button"
                  onClick={() => setDestMode('direct_cs')}
                  style={{
                    flex: 1, padding: '7px 10px', fontSize: '0.75rem', fontWeight: destMode === 'direct_cs' ? 700 : 500,
                    borderRadius: '6px', border: 'none', cursor: 'pointer',
                    backgroundColor: destMode === 'direct_cs' ? '#0284c7' : 'transparent',
                    color: destMode === 'direct_cs' ? '#ffffff' : '#475569',
                    transition: 'all 0.15s'
                  }}
                >
                  🎯 3 Anciãos CS (Direto)
                </button>
                <button
                  type="button"
                  onClick={() => setDestMode('group')}
                  style={{
                    flex: 1, padding: '7px 10px', fontSize: '0.75rem', fontWeight: destMode === 'group' ? 700 : 500,
                    borderRadius: '6px', border: 'none', cursor: 'pointer',
                    backgroundColor: destMode === 'group' ? '#0284c7' : 'transparent',
                    color: destMode === 'group' ? '#ffffff' : '#475569',
                    transition: 'all 0.15s'
                  }}
                >
                  👥 Grupo Z-API
                </button>
                <button
                  type="button"
                  onClick={() => setDestMode('manual')}
                  style={{
                    flex: 1, padding: '7px 10px', fontSize: '0.75rem', fontWeight: destMode === 'manual' ? 700 : 500,
                    borderRadius: '6px', border: 'none', cursor: 'pointer',
                    backgroundColor: destMode === 'manual' ? '#0284c7' : 'transparent',
                    color: destMode === 'manual' ? '#ffffff' : '#475569',
                    transition: 'all 0.15s'
                  }}
                >
                  ✍️ ID Manual / Lista
                </button>
              </div>

              {/* Conteúdo do Modo 1: Envio Direto aos 3 Anciãos */}
              {destMode === 'direct_cs' && (
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 12px', borderRadius: '8px' }}>
                  <p style={{ margin: '0 0 8px', fontSize: '0.8125rem', fontWeight: 600, color: '#166534' }}>
                    ⚡ Envio individual direto (100% garantido, sem bloqueio de transmissão):
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {csMembersDetected.map(m => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                        <span style={{ color: '#166534', fontWeight: 500 }}>
                          ✓ {m.name} <span style={{ opacity: 0.75 }}>({m.funcao?.split(' ')[0]})</span>
                        </span>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#15803d', backgroundColor: '#dcfce7', padding: '2px 6px', borderRadius: '4px' }}>
                          {m.phone || 'Sem telefone'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conteúdo do Modo 2: Grupo Z-API */}
              {destMode === 'group' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
                    <button
                      type="button"
                      onClick={loadGroups}
                      disabled={loadingGroups}
                      style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                    >
                      {loadingGroups ? '⏳ Carregando...' : '🔄 Atualizar Lista de Grupos'}
                    </button>
                  </div>
                  <select 
                    value={selectedGroupId} 
                    onChange={e => setSelectedGroupId(e.target.value)}
                    style={inputStyle}
                    disabled={loadingGroups}
                  >
                    <option value="">
                      {loadingGroups ? 'Carregando grupos do Z-API...' : '-- Selecione o Grupo do WhatsApp --'}
                    </option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Conteúdo do Modo 3: ID Manual (Grupo ou Lista de Transmissão) */}
              {destMode === 'manual' && (
                <div>
                  <input 
                    type="text"
                    placeholder="Ex: 1624901640@broadcast ou 120363426023919801-group"
                    value={manualDestinationId}
                    onChange={e => setManualDestinationId(e.target.value)}
                    style={inputStyle}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
                    Insira o ID da sua Lista de Transmissão (terminado em `@broadcast`) ou do Grupo (`...-group`).
                  </span>
                </div>
              )}
            </div>

            {/* 3. Publicadores a Confirmar com Filtros de Dropdown */}
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

              {/* Barra de Filtros: Dropdown de Status + Busca por Nome */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as PublisherStatusFilter)}
                  style={{
                    ...inputStyle,
                    flex: '1 1 200px',
                    padding: '6px 10px',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    backgroundColor: statusFilter !== 'all' ? '#eff6ff' : '#ffffff',
                    borderColor: statusFilter !== 'all' ? '#3b82f6' : '#cbd5e1',
                    color: statusFilter !== 'all' ? '#1d4ed8' : '#1e293b'
                  }}
                >
                  <option value="all">📋 Todos os Publicadores ({statusCounts.all})</option>
                  <option value="paused">⏸️ Pausados ({statusCounts.paused})</option>
                  <option value="not_qualified">⚠️ Não Aptos / Restritos ({statusCounts.notQualified})</option>
                  <option value="inactive">🚫 Inativos ({statusCounts.inactive})</option>
                  {statusCounts.thisWeek > 0 && (
                    <option value="this_week">⚡ Designados da Semana ({statusCounts.thisWeek})</option>
                  )}
                </select>

                <input 
                  type="text"
                  placeholder="🔍 Buscar por nome ou função..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ ...inputStyle, flex: '2 1 200px', padding: '6px 10px', fontSize: '0.8125rem' }}
                />
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

              {/* Lista com Rolagem e Badges Visuais de Status */}
              <div style={listContainerStyle}>
                {filteredPublishers.length === 0 ? (
                  <p style={{ margin: 0, padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>
                    Nenhum publicador encontrado com os filtros aplicados.
                  </p>
                ) : (
                  filteredPublishers.map(p => {
                    const isSelected = selectedIds.has(p.id);
                    const isAssignedThisWeek = weekAssignedPubs.some(wp => wp.id === p.id);
                    const statusText = getPublisherStatusText(p);

                    // Estilização inteligente do badge de status
                    let badgeBg = '#f1f5f9';
                    let badgeColor = '#64748b';
                    let badgeIcon = '✓';

                    if (p.isIndefinitelyPaused || p.availability?.mode === 'never') {
                      badgeBg = '#ffe4e6';
                      badgeColor = '#e11d48';
                      badgeIcon = '⏸️';
                    } else if (p.isNotQualified || p.requestedNoParticipation) {
                      badgeBg = '#fef3c7';
                      badgeColor = '#b45309';
                      badgeIcon = '⚠️';
                    } else if (p.isServing === false) {
                      badgeBg = '#f1f5f9';
                      badgeColor = '#475569';
                      badgeIcon = '🚫';
                    } else {
                      badgeBg = '#dcfce7';
                      badgeColor = '#15803d';
                      badgeIcon = '✓';
                    }

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

                        {/* Badge do Status Atual */}
                        <span 
                          style={{ 
                            fontSize: '0.6875rem', 
                            fontWeight: 600,
                            backgroundColor: badgeBg, 
                            color: badgeColor, 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            marginLeft: '6px',
                            maxWidth: '180px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                          title={statusText}
                        >
                          {badgeIcon} {statusText}
                        </span>

                        {isAssignedThisWeek && (
                          <span style={{ fontSize: '0.6875rem', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px' }}>
                            Semana Atual
                          </span>
                        )}

                        {p.condition && (
                          <span style={{ fontSize: '0.6875rem', backgroundColor: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px' }}>
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
              disabled={isSubmitDisabled}
              style={{
                ...primaryBtnStyle,
                opacity: isSubmitDisabled ? 0.6 : 1,
                cursor: isSubmitDisabled ? 'not-allowed' : 'pointer'
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
