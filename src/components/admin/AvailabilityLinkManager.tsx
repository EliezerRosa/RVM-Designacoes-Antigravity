/**
 * AvailabilityLinkManager — Admin UI para gerenciar tokens de acesso individual
 * ao portal de disponibilidade de publicadores.
 *
 * Diferente do PublisherFormLinkManager (genérico), cada token aqui é vinculado
 * a um publicador específico. O admin seleciona um publicador e gera um link único
 * que o próprio publicador usa para marcar sua disponibilidade.
 *
 * Token key in app_settings: 'availability_tokens'
 * Portal URL: ?portal=availability&token=<tok>
 */

import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { Publisher } from '../../types';
import type { AvailabilityToken } from '../PublisherAvailabilityPortal';

// ── Helpers ──────────────────────────────────────────────────────────────────
function generateToken(): string {
    const arr = new Uint8Array(18);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function buildAvailabilityUrl(token: string): string {
    const base = window.location.origin + window.location.pathname;
    return `${base}?portal=availability&token=${token}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function AvailabilityLinkManager({ adminEmail }: { adminEmail?: string }) {
    const [tokens, setTokens] = useState<AvailabilityToken[]>([]);
    const [publishers, setPublishers] = useState<Publisher[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedPublisherId, setSelectedPublisherId] = useState('');
    const [copiedToken, setCopiedToken] = useState<string | null>(null);

    // ── Load stored tokens + publishers ──────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                const [stored, pubs] = await Promise.all([
                    api.getSetting<AvailabilityToken[]>('availability_tokens', []),
                    api.loadPublishers(),
                ]);
                setTokens(stored);
                setPublishers(pubs.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
            } catch (err) {
                console.error('[AvailabilityLinkManager] Load error:', err);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const persist = async (next: AvailabilityToken[]) => {
        await api.setSetting('availability_tokens', next);
        setTokens(next);
    };

    // ── Generate new token ────────────────────────────────────────────────
    const handleGenerate = async () => {
        if (!selectedPublisherId) return;
        const pub = publishers.find(p => p.id === selectedPublisherId);
        if (!pub) return;

        setSaving(true);
        try {
            const newToken: AvailabilityToken = {
                token: generateToken(),
                publisherId: pub.id,
                publisherName: pub.name,
                createdAt: new Date().toISOString(),
                createdBy: adminEmail ?? 'admin',
                active: true,
            };
            await persist([...tokens, newToken]);
            setSelectedPublisherId('');
        } catch (err) {
            console.error('[AvailabilityLinkManager] Generate error:', err);
        } finally {
            setSaving(false);
        }
    };

    // ── Revoke ────────────────────────────────────────────────────────────
    const handleRevoke = async (token: string) => {
        if (!confirm('Revogar este link? O publicador não conseguirá mais acessar com este link.')) return;
        try {
            await persist(tokens.map(t => t.token === token ? { ...t, active: false } : t));
        } catch (err) {
            console.error('[AvailabilityLinkManager] Revoke error:', err);
        }
    };

    // ── Re-activate ───────────────────────────────────────────────────────
    const handleReactivate = async (token: string) => {
        try {
            await persist(tokens.map(t => t.token === token ? { ...t, active: true } : t));
        } catch (err) {
            console.error('[AvailabilityLinkManager] Reactivate error:', err);
        }
    };

    // ── Delete (permanent) ────────────────────────────────────────────────
    const handleDelete = async (token: string) => {
        if (!confirm('Excluir permanentemente este link?')) return;
        try {
            await persist(tokens.filter(t => t.token !== token));
        } catch (err) {
            console.error('[AvailabilityLinkManager] Delete error:', err);
        }
    };

    // ── Copy URL ──────────────────────────────────────────────────────────
    const handleCopy = async (token: string) => {
        try {
            await navigator.clipboard.writeText(buildAvailabilityUrl(token));
            setCopiedToken(token);
            setTimeout(() => setCopiedToken(null), 2000);
        } catch {
            alert('Erro ao copiar. URL: ' + buildAvailabilityUrl(token));
        }
    };

    const activeTokens = tokens.filter(t => t.active);
    const revokedTokens = tokens.filter(t => !t.active);

    // Publishers that don't already have an active token
    const publishersWithoutActiveToken = publishers.filter(
        p => !activeTokens.some(t => t.publisherId === p.id),
    );

    return (
        <div style={{ padding: '16px 0', fontFamily: 'system-ui, sans-serif', fontSize: '13px' }}>
            {/* Header */}
            <div style={{ marginBottom: '16px' }}>
                <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: '#1E293B' }}>
                    📅 Links de Disponibilidade Individual
                </h3>
                <p style={{ margin: 0, color: '#64748B', fontSize: '12px' }}>
                    Gere um link exclusivo por publicador para que ele mesmo informe sua disponibilidade
                    nos próximos dois meses. As alterações afetam o motor de designações imediatamente.
                </p>
            </div>

            {/* Generate new token */}
            <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '14px',
                marginBottom: '16px',
            }}>
                <div style={{ fontWeight: 700, color: '#334155', marginBottom: '10px', fontSize: '13px' }}>
                    ➕ Gerar link para um publicador
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <select
                        value={selectedPublisherId}
                        onChange={e => setSelectedPublisherId(e.target.value)}
                        style={{
                            flex: 1,
                            minWidth: '200px',
                            border: '1px solid #CBD5E1',
                            borderRadius: '7px',
                            padding: '8px 12px',
                            fontSize: '13px',
                            outline: 'none',
                            background: 'white',
                            color: '#1E293B',
                            cursor: 'pointer',
                        }}
                    >
                        <option value="">Selecione um publicador…</option>
                        {publishersWithoutActiveToken.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                    <button
                        onClick={handleGenerate}
                        disabled={!selectedPublisherId || saving}
                        style={{
                            background: selectedPublisherId && !saving ? '#10B981' : '#CBD5E1',
                            color: 'white',
                            border: 'none',
                            borderRadius: '7px',
                            padding: '8px 16px',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: selectedPublisherId && !saving ? 'pointer' : 'not-allowed',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {saving ? 'Gerando...' : '🔑 Gerar Link'}
                    </button>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#94A3B8' }}>
                    Apenas publicadores sem link ativo aparecem na lista. Um link por publicador.
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
                        <AvailabilityTokenRow
                            key={t.token}
                            token={t}
                            copied={copiedToken === t.token}
                            onCopy={() => handleCopy(t.token)}
                            onRevoke={() => handleRevoke(t.token)}
                            onDelete={() => handleDelete(t.token)}
                        />
                    ))}

                    {/* Revoked tokens */}
                    {revokedTokens.length > 0 && (
                        <>
                            <div style={{
                                fontWeight: 700,
                                color: '#94A3B8',
                                margin: '16px 0 8px',
                                fontSize: '12px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                            }}>
                                Revogados ({revokedTokens.length})
                            </div>
                            {revokedTokens.map(t => (
                                <AvailabilityTokenRow
                                    key={t.token}
                                    token={t}
                                    copied={false}
                                    onCopy={() => {}}
                                    onRevoke={() => {}}
                                    onReactivate={() => handleReactivate(t.token)}
                                    onDelete={() => handleDelete(t.token)}
                                    revoked
                                />
                            ))}
                        </>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Token Row ────────────────────────────────────────────────────────────────
function AvailabilityTokenRow({
    token,
    copied,
    onCopy,
    onRevoke,
    onReactivate,
    onDelete,
    revoked = false,
}: {
    token: AvailabilityToken;
    copied: boolean;
    onCopy: () => void;
    onRevoke: () => void;
    onReactivate?: () => void;
    onDelete: () => void;
    revoked?: boolean;
}) {
    const url = buildAvailabilityUrl(token.token);
    const createdDate = new Date(token.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

    return (
        <div style={{
            background: revoked ? '#F8FAFC' : 'white',
            border: `1px solid ${revoked ? '#E2E8F0' : '#BFDBFE'}`,
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '8px',
            opacity: revoked ? 0.75 : 1,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#1E293B', fontSize: '13px', marginBottom: '2px' }}>
                        👤 {token.publisherName}
                        {revoked && <span style={{ color: '#94A3B8', fontWeight: 400, marginLeft: '6px', fontSize: '11px' }}>(revogado)</span>}
                    </div>
                    <div style={{
                        color: '#64748B',
                        fontSize: '11px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '280px',
                    }}>
                        {url}
                    </div>
                    <div style={{ color: '#94A3B8', fontSize: '10px', marginTop: '2px' }}>
                        Criado em {createdDate} por {token.createdBy}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '4px', flexShrink: 0, flexWrap: 'wrap' }}>
                    {!revoked && (
                        <>
                            <button
                                onClick={onCopy}
                                style={{
                                    background: copied ? '#10B981' : '#EEF2FF',
                                    color: copied ? 'white' : '#4F46E5',
                                    border: 'none',
                                    borderRadius: '5px',
                                    padding: '4px 10px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {copied ? '✓ Copiado!' : '📋 Copiar'}
                            </button>
                            <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    background: '#F0FDF4',
                                    color: '#16A34A',
                                    border: 'none',
                                    borderRadius: '5px',
                                    padding: '4px 10px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    textDecoration: 'none',
                                    display: 'inline-block',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                🔗 Abrir
                            </a>
                            <button
                                onClick={onRevoke}
                                style={{
                                    background: '#FEF2F2',
                                    color: '#DC2626',
                                    border: 'none',
                                    borderRadius: '5px',
                                    padding: '4px 10px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                🚫 Revogar
                            </button>
                        </>
                    )}
                    {revoked && onReactivate && (
                        <button
                            onClick={onReactivate}
                            style={{
                                background: '#F0FDF4',
                                color: '#16A34A',
                                border: 'none',
                                borderRadius: '5px',
                                padding: '4px 10px',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            ↩ Reativar
                        </button>
                    )}
                    <button
                        onClick={onDelete}
                        style={{
                            background: '#F8FAFC',
                            color: '#94A3B8',
                            border: 'none',
                            borderRadius: '5px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        🗑 Excluir
                    </button>
                </div>
            </div>
        </div>
    );
}
