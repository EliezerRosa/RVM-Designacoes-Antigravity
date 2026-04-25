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
import { VideoTutorialModal } from '../VideoTutorialModal';
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
function buildFormUrl(token: string): string {
    const base = window.location.origin + window.location.pathname;
    return `${base}?portal=publisher-form&token=${token}`;
}

// Linha do banco -> shape FormToken usado pela UI
type DbRow = {
    id: string;
    token: string;
    label: string;
    role: PublisherFormRole | null;
    created_at: string;
    created_by_email: string | null;
    expires_at: string | null;
    revoked_at: string | null;
    last_used_at: string | null;
    use_count: number;
};

function rowToToken(r: DbRow): FormToken {
    return {
        id: r.id,
        token: r.token,
        label: r.label,
        role: r.role || 'CCA',
        createdAt: r.created_at,
        createdBy: r.created_by_email || 'admin',
        active: r.revoked_at === null && (!r.expires_at || new Date(r.expires_at) > new Date()),
        lastUsedAt: r.last_used_at,
        useCount: r.use_count,
    };
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
    const [showVideoTutorial, setShowVideoTutorial] = useState(false);

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
                const [tokensRes, pubs] = await Promise.all([
                    supabase
                        .from('publisher_form_tokens')
                        .select('id, token, label, role, created_at, created_by_email, expires_at, revoked_at, last_used_at, use_count')
                        .order('created_at', { ascending: false }),
                    api.loadPublishers(),
                ]);
                if (tokensRes.error) {
                    console.error('[LinkManager] Load tokens error:', tokensRes.error);
                    setTokens([]);
                } else {
                    setTokens((tokensRes.data as DbRow[]).map(rowToToken));
                }
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

    const reloadTokens = async () => {
        const { data, error } = await supabase
            .from('publisher_form_tokens')
            .select('id, token, label, role, created_at, created_by_email, expires_at, revoked_at, last_used_at, use_count')
            .order('created_at', { ascending: false });
        if (error) {
            console.error('[LinkManager] Reload error:', error);
            return;
        }
        setTokens((data as DbRow[]).map(rowToToken));
    };

    // ── Generate new token ────────────────────────────────────────────────
    const handleGenerate = async () => {
        if (!newLabel.trim()) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from('publisher_form_tokens')
                .insert({
                    label: newLabel.trim(),
                    role: newRole,
                    created_by_email: adminEmail || 'admin',
                });
            if (error) throw error;
            setNewLabel('');
            await reloadTokens();
        } catch (err) {
            console.error('[LinkManager] Generate error:', err);
            alert('Erro ao gerar link. Verifique se você tem permissão de admin.');
        } finally {
            setSaving(false);
        }
    };

    // ── Revoke token ──────────────────────────────────────────────────────
    const handleRevoke = async (token: string) => {
        if (!confirm('Revogar este link? Quem tiver o link não conseguirá mais acessar.')) return;
        try {
            const { error } = await supabase
                .from('publisher_form_tokens')
                .update({ revoked_at: new Date().toISOString() })
                .eq('token', token);
            if (error) throw error;
            await reloadTokens();
        } catch (err) {
            console.error('[LinkManager] Revoke error:', err);
        }
    };

    // ── Re-activate token ─────────────────────────────────────────────────
    const handleReactivate = async (token: string) => {
        try {
            const { error } = await supabase
                .from('publisher_form_tokens')
                .update({ revoked_at: null, revoked_by_profile_id: null })
                .eq('token', token);
            if (error) throw error;
            await reloadTokens();
        } catch (err) {
            console.error('[LinkManager] Reactivate error:', err);
        }
    };

    // ── Delete token (permanent) ──────────────────────────────────────────
    const handleDelete = async (token: string) => {
        if (!confirm('Excluir permanentemente este link?')) return;
        try {
            const { error } = await supabase
                .from('publisher_form_tokens')
                .delete()
                .eq('token', token);
            if (error) throw error;
            await reloadTokens();
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
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: '#FFFFFF',
                    zIndex: 9000,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'auto',
                }}
            >
                <div style={{ padding: '8px 16px', background: '#F1F5F9', borderBottom: '1px solid #E2E8F0', display: 'flex', gap: '8px', alignItems: 'center', position: 'sticky', top: 0, zIndex: 1 }}>
                    <button
                        onClick={() => setShowForm(false)}
                        style={{ background: '#4F46E5', color: 'white', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                        ← Voltar para Gerenciamento de Links
                    </button>
                    <span style={{ fontSize: '12px', color: '#64748B' }}>Modo administrador — todas as alterações são salvas diretamente.</span>
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                    <PublisherStatusForm isAdminAccess />
                </div>
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
                        onClick={() => setShowVideoTutorial(true)}
                        title="Assistir vídeo-tutorial completo (Status, Necessidades Locais, Eventos Especiais)"
                        style={{
                            background: '#0EA5E9',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                        }}
                    >
                        🎬 Vídeo-tutorial
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

            {/* ── Modal: Vídeo-tutorial ─────────────────────────────────── */}
            {showVideoTutorial && (
                <div
                    onClick={() => setShowVideoTutorial(false)}
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.85)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', zIndex: 9500,
                        padding: '20px',
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#0F172A', borderRadius: '12px',
                            padding: '16px', maxWidth: '1100px', width: '100%',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', color: 'white' }}>
                            <div style={{ fontWeight: 700, fontSize: '15px' }}>
                                🎬 Vídeo-tutorial completo
                            </div>
                            <button
                                onClick={() => setShowVideoTutorial(false)}
                                style={{
                                    background: '#EF4444', color: 'white', border: 'none',
                                    borderRadius: '6px', padding: '6px 12px', fontSize: '12px',
                                    fontWeight: 600, cursor: 'pointer',
                                }}
                            >
                                ✕ Fechar
                            </button>
                        </div>
                        <video
                            src="/tutorial_completo.mp4"
                            controls
                            autoPlay
                            style={{ width: '100%', borderRadius: '8px', display: 'block', background: '#000' }}
                        >
                            Seu navegador não suporta vídeo HTML5. <a href="/tutorial_completo.mp4" style={{ color: '#60A5FA' }}>Baixar o vídeo</a>.
                        </video>
                        <div style={{ marginTop: '10px', fontSize: '12px', color: '#94A3B8' }}>
                            Cobre os três tutoriais guiados: Status do Publicador, Necessidades Locais (modal Eventos Especiais) e Novo Evento.
                            &nbsp;·&nbsp;
                            <a href="/tutorial_completo.mp4" download style={{ color: '#60A5FA' }}>Baixar MP4</a>
                        </div>
                    </div>
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
    const [showLog, setShowLog] = useState(false);
    const [logEntries, setLogEntries] = useState<Array<{ id: string; used_at: string; user_publisher_id: string | null; user_publisher_name: string | null; user_agent: string | null }> | null>(null);
    const [logLoading, setLogLoading] = useState(false);

    const toggleLog = async () => {
        if (showLog) { setShowLog(false); return; }
        setShowLog(true);
        if (logEntries !== null || !token.id) return;
        setLogLoading(true);
        try {
            const { data, error } = await supabase.rpc('list_publisher_form_token_uses', {
                p_token_id: token.id,
                p_limit: 50,
            });
            if (error) {
                console.error('[TokenRow] log error:', error);
                setLogEntries([]);
            } else {
                setLogEntries((data as Array<{ id: string; used_at: string; user_publisher_id: string | null; user_publisher_name: string | null; user_agent: string | null }>) || []);
            }
        } finally {
            setLogLoading(false);
        }
    };

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
                    {(token.useCount ?? 0) > 0 && (
                        <div style={{ fontSize: '11px', color: '#475569', marginBottom: '6px' }}>
                            📊 <strong>{token.useCount}</strong> uso{(token.useCount ?? 0) === 1 ? '' : 's'}
                            {token.lastUsedAt && (
                                <> · último em {new Date(token.lastUsedAt).toLocaleString('pt-BR')}</>
                            )}
                        </div>
                    )}
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
                                            // URL personalizada com hint de identidade do destinatário (?u=<id>)
                                            // — gravado no log de uso server-side para auditoria.
                                            const personalUrl = `${url}${url.includes('?') ? '&' : '?'}u=${encodeURIComponent(m.id)}`;
                                            const msg = `Olá, ${m.name}! 🙏\n\nSegue o link de acesso à *Comissão de Serviço* (atualização de publicadores, Necessidades Locais e Eventos Especiais):\n\n${personalUrl}\n\nLink: *${token.label}*\nEste link é da CS — não compartilhe fora da comissão.`;
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
                            {token.id && (
                                <button onClick={toggleLog} style={btnStyle(showLog ? '#0EA5E9' : '#64748B')}>
                                    📊 {showLog ? 'Ocultar log' : 'Ver log'}
                                </button>
                            )}
                            <button onClick={onRevoke} style={btnStyle('#F59E0B')}>
                                🔒 Revogar
                            </button>
                        </>
                    )}
                    {revoked && token.id && (
                        <button onClick={toggleLog} style={btnStyle(showLog ? '#0EA5E9' : '#64748B')}>
                            📊 {showLog ? 'Ocultar log' : 'Ver log'}
                        </button>
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
            {showLog && (
                <div style={{
                    marginTop: '10px',
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '12px',
                }}>
                    <div style={{ fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                        Histórico de uso ({logEntries?.length ?? 0})
                    </div>
                    {logLoading && <div style={{ color: '#64748B' }}>Carregando…</div>}
                    {!logLoading && (logEntries?.length ?? 0) === 0 && (
                        <div style={{ color: '#94A3B8', fontStyle: 'italic' }}>
                            Nenhum acesso identificado. Apenas links enviados via "💬 ZAP" capturam o nome do destinatário.
                        </div>
                    )}
                    {!logLoading && (logEntries?.length ?? 0) > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {logEntries!.map(e => (
                                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '4px 0', borderBottom: '1px dashed #E2E8F0' }}>
                                    <span style={{ fontWeight: 600, color: '#1E293B' }}>
                                        {e.user_publisher_name || <em style={{ color: '#94A3B8' }}>(sem identificação)</em>}
                                    </span>
                                    <span style={{ color: '#64748B', whiteSpace: 'nowrap' }}>
                                        {new Date(e.used_at).toLocaleString('pt-BR')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
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
