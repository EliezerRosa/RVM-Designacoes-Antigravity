/**
 * PublisherFormLinkManager — Admin UI para gerenciar tokens de acesso ao
 * formulário de atualização em lote de publicadores.
 *
 * Funcionalidades:
 *   - Gerar novos tokens (com label/descrição)
 *   - Visualizar tokens ativos e copiar URL
 *   - Revogar tokens
 *   - Acessar o formulário diretamente como admin
 */

import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { supabase } from '../../lib/supabase';
import type { FormToken, PublisherFormRole } from '../PublisherStatusForm';
import { PublisherStatusForm } from '../PublisherStatusForm';
import { LocalNeedsQueue } from '../LocalNeedsQueue';
import { SpecialEventsManager } from '../SpecialEventsManager';
import { communicationService } from '../../services/communicationService';
import type { Publisher } from '../../types';

// ── Role mapping ─────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<PublisherFormRole, string> = {
    CCA: 'CCA — Coordenador',
    SEC: 'SEC — Secretário',
    SS: 'SS — Sup. de Serviço',
    SRVM: 'SRVM',
    AjSRVM: 'Aj SRVM',
};
const ROLE_BG: Record<PublisherFormRole, string> = {
    CCA: '#7C3AED', SEC: '#0EA5E9', SS: '#10B981', SRVM: '#F97316', AjSRVM: '#FBBF24',
};
function funcaoToRole(funcao?: string): PublisherFormRole | null {
    switch (funcao) {
        case 'Coordenador do Corpo de Anciãos': return 'CCA';
        case 'Secretário': return 'SEC';
        case 'Superintendente de Serviço': return 'SS';
        case 'Superintendente da Reunião Vida e Ministério': return 'SRVM';
        case 'Ajudante do Superintendente da Reunião Vida e Ministério': return 'AjSRVM';
        default: return null;
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function generateToken(): string {
    const arr = new Uint8Array(18);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function buildFormUrl(token: string): string {
    const base = window.location.origin + window.location.pathname;
    return `${base}?portal=publisher-form&token=${token}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function PublisherFormLinkManager({ adminEmail }: { adminEmail?: string }) {
    const [tokens, setTokens] = useState<FormToken[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newLabel, setNewLabel] = useState('');
    const [newRole, setNewRole] = useState<PublisherFormRole>('CCA');
    const [copiedToken, setCopiedToken] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [csMembers, setCsMembers] = useState<Publisher[]>([]);

    // ── Modais NL + Eventos (lazy data) ──────────────────────────────────
    const [showLocalNeeds, setShowLocalNeeds] = useState(false);
    const [showEvents, setShowEvents] = useState(false);
    const [modalPublishers, setModalPublishers] = useState<Publisher[] | null>(null);
    const [modalWeeks, setModalWeeks] = useState<{ weekId: string; display: string }[] | null>(null);
    const [modalDataLoading, setModalDataLoading] = useState(false);
    const [modalDataError, setModalDataError] = useState<string | null>(null);

    const ensureModalData = async () => {
        if (modalPublishers && modalWeeks) return;
        setModalDataLoading(true);
        setModalDataError(null);
        try {
            // Carrega publicadores (para LocalNeedsQueue) e semanas disponíveis (para ambos)
            const [pubs, weeksRes] = await Promise.all([
                api.loadPublishers(),
                supabase
                    .from('workbook_parts')
                    .select('week_id, date')
                    .order('week_id', { ascending: true }),
            ]);
            setModalPublishers(pubs);

            const seen = new Map<string, string>();
            for (const row of (weeksRes.data || []) as Array<{ week_id: string; date: string | null }>) {
                if (!row.week_id || seen.has(row.week_id)) continue;
                const year = row.date ? new Date(row.date).getFullYear() : '';
                seen.set(row.week_id, year ? `${row.week_id} (${year})` : row.week_id);
            }
            setModalWeeks(Array.from(seen.entries()).map(([weekId, display]) => ({ weekId, display })));
        } catch (err) {
            console.error('[LinkManager] Erro carregando dados para modais NL/Eventos:', err);
            setModalDataError(err instanceof Error ? err.message : 'Erro ao carregar dados.');
        } finally {
            setModalDataLoading(false);
        }
    };

    const openLocalNeeds = async () => {
        await ensureModalData();
        setShowLocalNeeds(true);
    };
    const openEvents = async () => {
        await ensureModalData();
        setShowEvents(true);
    };

    // ── Load stored tokens + membros da CS (para ZAP por membro) ────────────
    useEffect(() => {
        (async () => {
            try {
                const [stored, pubs] = await Promise.all([
                    api.getSetting<FormToken[]>('publisher_form_tokens', []),
                    api.loadPublishers(),
                ]);
                setTokens(stored);
                const cs = pubs.filter(p =>
                    p.funcao === 'Coordenador do Corpo de Anciãos'
                    || p.funcao === 'Secretário'
                    || p.funcao === 'Superintendente de Serviço'
                    || p.funcao === 'Superintendente da Reunião Vida e Ministério'
                    || p.funcao === 'Ajudante do Superintendente da Reunião Vida e Ministério'
                );
                setCsMembers(cs);
            } catch (err) {
                console.error('[LinkManager] Load error:', err);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const persist = async (next: FormToken[]) => {
        await api.setSetting('publisher_form_tokens', next);
        setTokens(next);
    };

    // ── Generate new token ────────────────────────────────────────────────
    const handleGenerate = async () => {
        if (!newLabel.trim()) return;
        setSaving(true);
        try {
            const newToken: FormToken = {
                token: generateToken(),
                label: newLabel.trim(),
                createdAt: new Date().toISOString(),
                createdBy: adminEmail || 'admin',
                active: true,
                role: newRole,
            };
            await persist([...tokens, newToken]);
            setNewLabel('');
        } catch (err) {
            console.error('[LinkManager] Generate error:', err);
        } finally {
            setSaving(false);
        }
    };

    // ── Revoke token ──────────────────────────────────────────────────────
    const handleRevoke = async (token: string) => {
        if (!confirm('Revogar este link? Quem tiver o link não conseguirá mais acessar.')) return;
        try {
            await persist(tokens.map(t => t.token === token ? { ...t, active: false } : t));
        } catch (err) {
            console.error('[LinkManager] Revoke error:', err);
        }
    };

    // ── Re-activate token ─────────────────────────────────────────────────
    const handleReactivate = async (token: string) => {
        try {
            await persist(tokens.map(t => t.token === token ? { ...t, active: true } : t));
        } catch (err) {
            console.error('[LinkManager] Reactivate error:', err);
        }
    };

    // ── Delete token (permanent) ──────────────────────────────────────────
    const handleDelete = async (token: string) => {
        if (!confirm('Excluir permanentemente este link?')) return;
        try {
            await persist(tokens.filter(t => t.token !== token));
        } catch (err) {
            console.error('[LinkManager] Delete error:', err);
        }
    };

    // ── Copy URL ──────────────────────────────────────────────────────────
    const handleCopy = async (token: string) => {
        try {
            await navigator.clipboard.writeText(buildFormUrl(token));
            setCopiedToken(token);
            setTimeout(() => setCopiedToken(null), 2000);
        } catch {
            alert('Erro ao copiar. URL: ' + buildFormUrl(token));
        }
    };

    // ── Admin quick-open form ─────────────────────────────────────────────
    if (showForm) {
        return (
            <div>
                <div style={{ padding: '8px 16px', background: '#F1F5F9', borderBottom: '1px solid #E2E8F0', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                        onClick={() => setShowForm(false)}
                        style={{ background: '#4F46E5', color: 'white', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                        ← Voltar para Gerenciamento de Links
                    </button>
                    <span style={{ fontSize: '12px', color: '#64748B' }}>Modo administrador — todas as alterações são salvas diretamente.</span>
                </div>
                <PublisherStatusForm isAdminAccess />
            </div>
        );
    }

    const activeTokens = tokens.filter(t => t.active);
    const revokedTokens = tokens.filter(t => !t.active);

    return (
        <div style={{ padding: '16px 0', fontFamily: 'system-ui, sans-serif', fontSize: '13px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1E293B' }}>
                        🔗 Links de Atualização de Publicadores
                    </h3>
                    <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: '12px' }}>
                        Gere links únicos para que responsáveis atualizem status, privilégios e participação por seção dos publicadores.
                        O admin sempre tem acesso direto abaixo.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setShowForm(true)}
                        style={{
                            background: '#4F46E5',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                        }}
                    >
                        📋 Abrir Formulário (Admin)
                    </button>
                    <button
                        onClick={openLocalNeeds}
                        disabled={modalDataLoading}
                        title="Gerenciar a fila de Necessidades Locais (CRUD completo da congregação)"
                        style={{
                            background: '#F59E0B',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: modalDataLoading ? 'wait' : 'pointer',
                            opacity: modalDataLoading ? 0.7 : 1,
                        }}
                    >
                        📋 Necessidades Locais
                    </button>
                    <button
                        onClick={openEvents}
                        disabled={modalDataLoading}
                        title="Gerenciar Eventos Especiais (visitas, assembleias, congressos…)"
                        style={{
                            background: '#8B5CF6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: modalDataLoading ? 'wait' : 'pointer',
                            opacity: modalDataLoading ? 0.7 : 1,
                        }}
                    >
                        🎉 Eventos Especiais
                    </button>
                </div>
            </div>

            {modalDataError && (
                <div style={{ background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '6px', padding: '8px 12px', marginBottom: '12px', fontSize: '12px' }}>
                    ⚠️ {modalDataError}
                </div>
            )}

            {/* Generate new token */}
            <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '14px',
                marginBottom: '16px',
            }}>
                <div style={{ fontWeight: 700, color: '#334155', marginBottom: '10px', fontSize: '13px' }}>
                    ➕ Gerar novo link de acesso
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <input
                        type="text"
                        placeholder="Descrição do link (ex: Para o irmão Pedro)"
                        value={newLabel}
                        onChange={e => setNewLabel(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                        style={{
                            flex: 1,
                            minWidth: '200px',
                            border: '1px solid #CBD5E1',
                            borderRadius: '7px',
                            padding: '8px 12px',
                            fontSize: '13px',
                            outline: 'none',
                            background: 'white',
                        }}
                    />
                    <button
                        onClick={handleGenerate}
                        disabled={!newLabel.trim() || saving}
                        style={{
                            background: newLabel.trim() && !saving ? '#10B981' : '#CBD5E1',
                            color: 'white',
                            border: 'none',
                            borderRadius: '7px',
                            padding: '8px 16px',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: newLabel.trim() && !saving ? 'pointer' : 'not-allowed',
                        }}
                    >
                        {saving ? 'Gerando...' : '🔑 Gerar Link'}
                    </button>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>Papel do destinatário:</label>
                    <select
                        value={newRole}
                        onChange={e => setNewRole(e.target.value as PublisherFormRole)}
                        style={{
                            border: '1px solid #CBD5E1',
                            borderRadius: '7px',
                            padding: '6px 10px',
                            fontSize: '12px',
                            background: 'white',
                            color: '#1E293B',
                            outline: 'none',
                        }}
                    >
                        {(Object.keys(ROLE_LABEL) as PublisherFormRole[]).map(r => (
                            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                    </select>
                    <span style={{ fontSize: '11px', color: '#64748B' }}>
                        Define as permissões dentro do formulário (CRUD vs. somente leitura por seção).
                    </span>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#7C3AED', fontWeight: 600 }}>
                    🛡️ Todo link gerado aqui é destinado à <strong>Comissão de Serviço</strong> (Coordenador, Secretário, Superintendente de Serviço) e dá acesso a Necessidades Locais e Eventos Especiais.
                </p>
                <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#94A3B8' }}>
                    Cada link é único e pode ser revogado a qualquer momento. Os responsáveis não precisam de conta no sistema.
                </p>
            </div>

            {/* Active tokens */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#94A3B8' }}>Carregando...</div>
            ) : (
                <>
                    <div style={{ fontWeight: 700, color: '#334155', marginBottom: '8px', fontSize: '13px' }}>
                        ✅ Links Ativos ({activeTokens.length})
                    </div>
                    {activeTokens.length === 0 && (
                        <div style={{ color: '#94A3B8', fontSize: '12px', padding: '12px 0' }}>
                            Nenhum link ativo. Gere um acima.
                        </div>
                    )}
                    {activeTokens.map(t => (
                        <TokenRow
                            key={t.token}
                            token={t}
                            copied={copiedToken === t.token}
                            onCopy={() => handleCopy(t.token)}
                            onRevoke={() => handleRevoke(t.token)}
                            onDelete={() => handleDelete(t.token)}
                            buildUrl={buildFormUrl}
                            csMembers={csMembers}
                        />
                    ))}

                    {/* Revoked tokens */}
                    {revokedTokens.length > 0 && (
                        <>
                            <div style={{ fontWeight: 700, color: '#94A3B8', margin: '16px 0 8px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Revogados ({revokedTokens.length})
                            </div>
                            {revokedTokens.map(t => (
                                <TokenRow
                                    key={t.token}
                                    token={t}
                                    copied={false}
                                    onCopy={() => {}}
                                    onRevoke={() => {}}
                                    onReactivate={() => handleReactivate(t.token)}
                                    onDelete={() => handleDelete(t.token)}
                                    buildUrl={buildFormUrl}
                                    csMembers={csMembers}
                                    revoked
                                />
                            ))}
                        </>
                    )}
                </>
            )}

            {/* ── Modal: Necessidades Locais ─────────────────────────────── */}
            {showLocalNeeds && modalPublishers && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', zIndex: 9000,
                }}>
                    <LocalNeedsQueue
                        publishers={modalPublishers.map(p => ({ id: p.id, name: p.name, condition: p.condition as string }))}
                        availableWeeks={modalWeeks ?? []}
                        onClose={() => setShowLocalNeeds(false)}
                    />
                </div>
            )}

            {/* ── Modal: Eventos Especiais ───────────────────────────────── */}
            {showEvents && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', zIndex: 9000,
                }}>
                    <SpecialEventsManager
                        availableWeeks={modalWeeks ?? []}
                        onClose={() => setShowEvents(false)}
                    />
                </div>
            )}
        </div>
    );
}

// ─── Token Row ────────────────────────────────────────────────────────────────
function TokenRow({
    token,
    copied,
    onCopy,
    onRevoke,
    onReactivate,
    onDelete,
    buildUrl,
    csMembers,
    revoked = false,
}: {
    token: FormToken;
    copied: boolean;
    onCopy: () => void;
    onRevoke: () => void;
    onReactivate?: () => void;
    onDelete: () => void;
    buildUrl: (t: string) => string;
    csMembers: Publisher[];
    revoked?: boolean;
}) {
    const url = buildUrl(token.token);

    return (
        <div style={{
            background: revoked ? '#F8FAFC' : 'white',
            border: `1px solid ${revoked ? '#E2E8F0' : '#C7D2FE'}`,
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '8px',
            opacity: revoked ? 0.65 : 1,
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: revoked ? '#94A3B8' : '#1E293B', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span>{revoked ? '🚫 ' : '🔗 '}{token.label}</span>
                        {token.role && (
                            <span style={{
                                background: ROLE_BG[token.role],
                                color: 'white',
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '999px',
                                letterSpacing: '0.03em',
                            }}>{token.role}</span>
                        )}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '6px' }}>
                        Criado por <strong>{token.createdBy}</strong> em {new Date(token.createdAt).toLocaleString('pt-BR')}
                    </div>
                    {!revoked && (
                        <div style={{
                            background: '#EFF6FF',
                            border: '1px solid #BFDBFE',
                            borderRadius: '6px',
                            padding: '5px 10px',
                            fontSize: '11px',
                            color: '#1D4ED8',
                            wordBreak: 'break-all',
                            fontFamily: 'monospace',
                        }}>
                            {url}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
                    {!revoked && (
                        <>
                            <button
                                onClick={onCopy}
                                style={btnStyle(copied ? '#10B981' : '#4F46E5')}
                            >
                                {copied ? '✅ Copiado!' : '📋 Copiar URL'}
                            </button>
                            {csMembers.map(m => {
                                const memberRole = funcaoToRole(m.funcao);
                                // Só mostra o botão do membro cujo cargo bate com o papel do token
                                // (ou todos, para tokens legados sem role).
                                if (token.role && memberRole !== token.role) return null;
                                const hasPhone = !!m.phone && m.phone.trim().length >= 8;
                                const shortRole = m.funcao === 'Coordenador do Corpo de Anciãos'
                                    ? 'Coord.'
                                    : m.funcao === 'Secretário'
                                        ? 'Secr.'
                                        : m.funcao === 'Superintendente de Serviço'
                                            ? 'SupServ.'
                                            : m.funcao === 'Superintendente da Reunião Vida e Ministério'
                                                ? 'SRVM'
                                                : m.funcao === 'Ajudante do Superintendente da Reunião Vida e Ministério'
                                                    ? 'Aj SRVM'
                                                    : '';
                                const firstName = m.name.split(' ')[0];
                                return (
                                    <button
                                        key={m.id}
                                        disabled={!hasPhone}
                                        onClick={() => {
                                            if (!hasPhone) return;
                                            const msg = `Olá, ${m.name}! 🙏\n\nSegue o link de acesso à *Comissão de Serviço* (atualização de publicadores, Necessidades Locais e Eventos Especiais):\n\n${url}\n\nLink: *${token.label}*\nEste link é da CS — não compartilhe fora da comissão.`;
                                            const waUrl = communicationService.generateWhatsAppUrl(m.phone, msg);
                                            window.open(waUrl, '_blank', 'noopener,noreferrer');
                                        }}
                                        title={hasPhone
                                            ? `Enviar para ${m.name} (${m.funcao}) via WhatsApp — ${m.phone}`
                                            : `${m.name} não tem telefone cadastrado. Cadastre o telefone em Publicadores para habilitar este envio.`}
                                        style={{ ...btnStyle(hasPhone ? '#25D366' : '#94A3B8'), opacity: hasPhone ? 1 : 0.55, cursor: hasPhone ? 'pointer' : 'not-allowed' }}
                                    >
                                        💬 {shortRole} {firstName}
                                    </button>
                                );
                            })}
                            {csMembers.length === 0 && (
                                <span style={{ fontSize: '11px', color: '#94A3B8', alignSelf: 'center' }} title="Defina Coordenador, Secretário, Superintendente de Serviço, SRVM e Aj SRVM em Publicadores para habilitar envios diretos.">
                                    ⚠️ CS / RVM não cadastrados
                                </span>
                            )}
                            <button onClick={onRevoke} style={btnStyle('#F59E0B')}>
                                🔒 Revogar
                            </button>
                        </>
                    )}
                    {revoked && onReactivate && (
                        <button onClick={onReactivate} style={btnStyle('#10B981')}>
                            ♻️ Reativar
                        </button>
                    )}
                    <button onClick={onDelete} style={btnStyle('#EF4444')}>
                        🗑️
                    </button>
                </div>
            </div>
        </div>
    );
}

const btnStyle = (bg: string): React.CSSProperties => ({
    background: bg,
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '5px 10px',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
});
