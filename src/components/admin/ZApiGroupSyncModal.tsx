/**
 * ZApiGroupSyncModal.tsx — Modal de Sincronização de Telefones & Liberação 2FA por Grupo WhatsApp (Z-API).
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { zapiGroupSyncService, type ReconciliationItem } from '../../services/zapiGroupSyncService';

interface ZApiGroupSyncModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ZApiGroupSyncModal({ isOpen, onClose }: ZApiGroupSyncModalProps) {
    const [groupInput, setGroupInput] = useState('Congregação Parque Jacaraípe');
    const [groupName, setGroupName] = useState('');
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [items, setItems] = useState<ReconciliationItem[]>([]);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [resultMsg, setResultMsg] = useState<string | null>(null);

    // Z-API Credentials state
    const [showCredsForm, setShowCredsForm] = useState(false);
    const [instanceId, setInstanceId] = useState('');
    const [instanceToken, setInstanceToken] = useState('');
    const [clientToken, setClientToken] = useState('');
    const [savingCreds, setSavingCreds] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setItems([]);
            setErrorMsg(null);
            setResultMsg(null);
        } else {
            checkCredentialsAndLoad();
        }
    }, [isOpen]);

    const checkCredentialsAndLoad = async () => {
        const creds = await zapiGroupSyncService.getZApiCredentials();
        if (creds) {
            setInstanceId(creds.instanceId);
            setInstanceToken(creds.instanceToken);
            setClientToken(creds.clientToken);
        }
        setShowCredsForm(false);
        handleFetchMembers();
    };

    const handleSaveCreds = async () => {
        if (!instanceId.trim() || !instanceToken.trim() || !clientToken.trim()) {
            setErrorMsg('Preencha todos os campos do Z-API: Instance ID, Instance Token e Client Token.');
            return;
        }
        setSavingCreds(true);
        setErrorMsg(null);
        try {
            await zapiGroupSyncService.saveZApiCredentials({
                instanceId: instanceId.trim(),
                instanceToken: instanceToken.trim(),
                clientToken: clientToken.trim(),
            });
            setShowCredsForm(false);
            setResultMsg('Credenciais do Z-API salvas com sucesso!');
            handleFetchMembers();
        } catch (e: any) {
            setErrorMsg('Erro ao salvar credenciais: ' + (e.message || String(e)));
        } finally {
            setSavingCreds(false);
        }
    };

    const handleFetchMembers = async () => {
        if (!groupInput.trim()) return;
        setLoading(true);
        setErrorMsg(null);
        setResultMsg(null);

        try {
            const { groupName: gName, participants } = await zapiGroupSyncService.fetchGroupParticipants(groupInput.trim());
            setGroupName(gName);

            const reconciled = await zapiGroupSyncService.reconcileWithRvm(participants);
            setItems(reconciled);
        } catch (err: any) {
            console.error('Erro ao buscar membros do grupo:', err);
            const msg = err.message || '';
            if (msg.includes('não configurad') || msg.includes('chaves ausentes') || msg.includes('não encontrado')) {
                setShowCredsForm(true);
            }
            setErrorMsg(msg || 'Falha ao buscar grupo no Z-API. Verifique se o Z-API está ativo e conectado.');
        } finally {
            setLoading(false);
        }
    };

    const toggleSelectItem = (id: string) => {
        if (syncing) return;
        setItems(prev => prev.map(item => item.id === id ? { ...item, selected: !item.selected } : item));
    };

    const toggleSelectAll = (select: boolean) => {
        if (syncing) return;
        setItems(prev => prev.map(item => ({ ...item, selected: select })));
    };

    const handleExecuteSync = async () => {
        const selectedItems = items.filter(i => i.selected);
        if (selectedItems.length === 0) return;

        if (!confirm(`Deseja sincronizar ${selectedItems.length} contatos e aprovar 2FA dos perfis vinculados?`)) {
            return;
        }

        setSyncing(true);
        setErrorMsg(null);
        setResultMsg(null);

        try {
            const { updatedPublishers, updatedProfiles, errors } = await zapiGroupSyncService.executeSync(selectedItems);

            let msg = `✅ Sincronização concluída! ${updatedPublishers} telefones de publicadores atualizados e ${updatedProfiles} acessos 2FA liberados.`;
            if (errors.length > 0) {
                msg += ` (${errors.length} avisos. Veja o console)`;
                console.warn('Avisos na sincronização:', errors);
            }
            setResultMsg(msg);

            // Recarrega reconciliação
            handleFetchMembers();
        } catch (err: any) {
            setErrorMsg(err.message || 'Erro ao sincronizar contatos.');
        } finally {
            setSyncing(false);
        }
    };

    if (!isOpen) return null;

    const selectedCount = items.filter(i => i.selected).length;
    const pending2FaCount = items.filter(i => i.status === 'PENDING_2FA').length;
    const phoneUpdateCount = items.filter(i => i.status === 'PHONE_UPDATE_NEEDED').length;
    const respondedLinkCount = items.filter(i => i.hasRespondedLink).length;

    return createPortal(
        <div style={modalOverlayStyle}>
            <div style={modalContentStyle}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                            💬
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#f8fafc' }}>
                                Sincronizar Contatos via Grupo WhatsApp
                            </h2>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                                Z-API Automation & Resolução de Telefones e 2FA em Lote
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                            onClick={() => setShowCredsForm(!showCredsForm)}
                            style={{ ...btnSmallStyle, background: '#334155', color: '#cbd5e1' }}
                            title="Configurar Chaves Z-API"
                        >
                            ⚙️ Chaves Z-API
                        </button>
                        <button onClick={onClose} disabled={syncing} style={btnCloseStyle}>&times;</button>
                    </div>
                </div>

                {/* Form de Configuração de Credenciais Z-API (Se não configurado) */}
                {showCredsForm && (
                    <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #f59e0b', marginBottom: '16px' }}>
                        <h4 style={{ margin: '0 0 6px 0', color: '#f59e0b', fontSize: '0.95rem' }}>⚙️ Configurar Chaves Z-API</h4>
                        <p style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: '#cbd5e1' }}>
                            Informe os dados da sua conta Z-API (painel <strong>z-api.io</strong>) para permitir a leitura do grupo:
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Instance ID:</label>
                                <input type="text" value={instanceId} onChange={e => setInstanceId(e.target.value)} placeholder="Ex: 3A91B..." style={inputStyle} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Instance Token:</label>
                                <input type="text" value={instanceToken} onChange={e => setInstanceToken(e.target.value)} placeholder="Ex: F8A72..." style={inputStyle} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Client Token (Segurança):</label>
                                <input type="text" value={clientToken} onChange={e => setClientToken(e.target.value)} placeholder="Ex: Sa981..." style={inputStyle} />
                            </div>
                        </div>
                        <button onClick={handleSaveCreds} disabled={savingCreds} style={{ ...btnPrimaryStyle, background: '#f59e0b', color: '#000' }}>
                            {savingCreds ? 'Salvando...' : '💾 Salvar Chaves e Conectar'}
                        </button>
                    </div>
                )}

                {/* Input de Busca do Grupo */}
                <div style={{ background: '#0f172a', padding: '14px', borderRadius: '8px', border: '1px solid #334155', marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '6px' }}>
                        Nome do Grupo no WhatsApp ou ID:
                    </label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <input
                            type="text"
                            value={groupInput}
                            onChange={e => setGroupInput(e.target.value)}
                            placeholder="Ex: Congregação Parque Jacaraípe"
                            style={inputStyle}
                        />
                        <button
                            onClick={handleFetchMembers}
                            disabled={loading || syncing}
                            style={btnPrimaryStyle}
                        >
                            {loading ? '🔍 Buscando...' : '🔍 Buscar Membros'}
                        </button>
                    </div>
                </div>

                {errorMsg && <div style={errorBannerStyle}>{errorMsg}</div>}
                {resultMsg && <div style={successBannerStyle}>{resultMsg}</div>}

                {/* Tabela de Resultados Reconciliados */}
                {items.length > 0 && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', fontSize: '0.85rem' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => toggleSelectAll(true)} style={btnSmallStyle}>Selecionar Todos</button>
                                <button onClick={() => toggleSelectAll(false)} style={btnSmallStyle}>Desmarcar Todos</button>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', color: '#94a3b8' }}>
                                <span>Total: <strong>{items.length}</strong></span>
                                <span style={{ color: '#c084fc' }}>✨ Respondeu Link: <strong>{respondedLinkCount}</strong></span>
                                <span style={{ color: '#fbbf24' }}>🔓 2FA Pendentes: <strong>{pending2FaCount}</strong></span>
                                <span style={{ color: '#38bdf8' }}>🟡 Atualizações: <strong>{phoneUpdateCount}</strong></span>
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', maxHeight: '360px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', color: '#cbd5e1' }}>
                                <thead>
                                    <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155', textAlign: 'left' }}>
                                        <th style={{ padding: '10px 12px', width: '36px' }}>✓</th>
                                        <th style={{ padding: '10px 12px' }}>Membro WhatsApp</th>
                                        <th style={{ padding: '10px 12px' }}>Publicador RVM</th>
                                        <th style={{ padding: '10px 12px' }}>Perfil Google / E-mail</th>
                                        <th style={{ padding: '10px 12px' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(item => (
                                        <tr key={item.id} style={{ borderBottom: '1px solid #1e293b', background: item.selected ? 'rgba(99, 102, 241, 0.08)' : 'transparent' }}>
                                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={item.selected}
                                                    onChange={() => toggleSelectItem(item.id)}
                                                    disabled={syncing}
                                                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                                />
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <div style={{ fontWeight: 600, color: '#f8fafc' }}>{item.waName}</div>
                                                <div style={{ fontSize: '0.78rem', color: '#38bdf8' }}>{item.waPhone}</div>
                                                {item.hasRespondedLink && (
                                                    <div
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            marginTop: '4px',
                                                            padding: '2px 7px',
                                                            borderRadius: '12px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: 600,
                                                            background: 'rgba(168, 85, 247, 0.18)',
                                                            color: '#d8b4fe',
                                                            border: '1px solid rgba(168, 85, 247, 0.4)',
                                                        }}
                                                        title="Este membro/publicador já respondeu a um link de confirmação do S-89 pelo menos uma vez no portal"
                                                    >
                                                        ✨ Respondeu Link S-89
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                {item.publisherName ? (
                                                    <div>
                                                        <div style={{ color: '#e2e8f0' }}>{item.publisherName}</div>
                                                        <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                                                            Atual: {item.rvmPhone ? item.rvmPhone : '(Sem telefone)'}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span style={{ color: '#64748b', italic: 'true' }}>Não identificado</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                {item.profileEmail ? (
                                                    <div>
                                                        <div style={{ color: '#a7f3d0' }}>{item.profileEmail}</div>
                                                        <div style={{ fontSize: '0.76rem', color: item.isVerified2FA ? '#34d399' : '#f87171' }}>
                                                            {item.isVerified2FA ? '✓ 2FA Ativo' : '⚠ 2FA Travado'}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span style={{ color: '#64748b' }}>-</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                {renderStatusBadge(item.status)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {/* Footer Action Bar */}
                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                        {selectedCount} item(ns) selecionado(s) para sincronização.
                    </span>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={onClose} disabled={syncing} style={btnSecondaryStyle}>
                            Cancelar
                        </button>
                        <button
                            onClick={handleExecuteSync}
                            disabled={syncing || selectedCount === 0}
                            style={{
                                ...btnPrimaryStyle,
                                opacity: selectedCount === 0 || syncing ? 0.5 : 1,
                                cursor: selectedCount === 0 || syncing ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {syncing ? 'Sincronizando...' : `⚡ Sincronizar Telefones e Aprovar 2FA (${selectedCount})`}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

function renderStatusBadge(status: ReconciliationItem['status']) {
    switch (status) {
        case 'PENDING_2FA':
            return <span style={{ ...badgeStyle, background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.4)' }}>🔓 2FA Pendente</span>;
        case 'PHONE_UPDATE_NEEDED':
            return <span style={{ ...badgeStyle, background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.4)' }}>🟡 Tel. Desatualizado</span>;
        case 'SYNCED':
            return <span style={{ ...badgeStyle, background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)' }}>🟢 Sincronizado</span>;
        case 'UNMATCHED_WA':
            return <span style={{ ...badgeStyle, background: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.4)' }}>⚪ Fora do RVM</span>;
    }
}

const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(4px)',
    zIndex: 99999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
};

const modalContentStyle: React.CSSProperties = {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '16px',
    padding: '24px',
    maxWidth: '850px',
    width: '100%',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
};

const btnCloseStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    fontSize: '1.5rem',
    cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '10px 14px',
    borderRadius: '6px',
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#fff',
    fontSize: '0.9rem',
};

const btnPrimaryStyle: React.CSSProperties = {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 18px',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '0.88rem',
};

const btnSecondaryStyle: React.CSSProperties = {
    background: 'transparent',
    color: '#cbd5e1',
    border: '1px solid #475569',
    borderRadius: '6px',
    padding: '10px 18px',
    cursor: 'pointer',
    fontSize: '0.88rem',
};

const btnSmallStyle: React.CSSProperties = {
    background: '#334155',
    color: '#f8fafc',
    border: 'none',
    borderRadius: '4px',
    padding: '5px 10px',
    fontSize: '0.78rem',
    cursor: 'pointer',
};

const badgeStyle: React.CSSProperties = {
    padding: '3px 8px',
    borderRadius: '12px',
    fontSize: '0.74rem',
    fontWeight: 700,
    display: 'inline-block',
};

const errorBannerStyle: React.CSSProperties = {
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid #ef4444',
    color: '#fca5a5',
    padding: '10px 14px',
    borderRadius: '6px',
    marginBottom: '14px',
    fontSize: '0.88rem',
};

const successBannerStyle: React.CSSProperties = {
    background: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid #10b981',
    color: '#6ee7b7',
    padding: '10px 14px',
    borderRadius: '6px',
    marginBottom: '14px',
    fontSize: '0.88rem',
};
