import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';
import type { Publisher } from '../../types';

interface ProfileLink {
    profile_id: string;
    email: string;
    full_name: string | null;
    role: string;
    publisher_id: string | null;
    publisher_name: string | null;
    publisher_email: string | null;
    whatsapp_verified: boolean;
}

export function ProfileLinksPanel() {
    const [links, setLinks] = useState<ProfileLink[]>([]);
    const [publishers, setPublishers] = useState<Publisher[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<'all' | 'unlinked'>('all');
    const [busyProfile, setBusyProfile] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [{ data: linksData, error: linksErr }, pubs] = await Promise.all([
                supabase.rpc('admin_list_profile_links'),
                api.loadPublishers(),
            ]);
            if (linksErr) {
                console.error('admin_list_profile_links:', linksErr);
                alert('Falha ao carregar vínculos: ' + linksErr.message);
            } else {
                setLinks((linksData || []) as ProfileLink[]);
            }
            setPublishers(pubs);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleLink = async (profileId: string, profileEmail: string) => {
        const namePrompt = window.prompt(
            `Vincular "${profileEmail}" a qual publicador?\n\n` +
            `Digite o nome (parcial) do publicador:`
        );
        if (!namePrompt) return;
        const needle = namePrompt.toLowerCase().trim();
        const matches = publishers.filter(p => p.name.toLowerCase().includes(needle));
        if (matches.length === 0) {
            alert('Nenhum publicador encontrado com "' + namePrompt + '".');
            return;
        }
        let target = matches[0];
        if (matches.length > 1) {
            const list = matches.slice(0, 10).map((p, i) => `${i + 1}. ${p.name} (id ${p.id})`).join('\n');
            const choice = window.prompt(`Vários encontrados — escolha o número:\n\n${list}`);
            const idx = choice ? parseInt(choice, 10) - 1 : -1;
            if (isNaN(idx) || idx < 0 || idx >= matches.length) {
                alert('Cancelado.');
                return;
            }
            target = matches[idx];
        }
        if (!confirm(`Vincular ${profileEmail} → ${target.name}?`)) return;
        setBusyProfile(profileId);
        try {
            const { data, error } = await supabase.rpc('admin_link_profile_to_publisher', {
                p_profile_id: profileId,
                p_publisher_id: target.id,
            });
            if (error) throw error;
            const result = (data || {}) as { success?: boolean; error?: string };
            if (!result.success) {
                alert('Erro: ' + (result.error || 'falha desconhecida'));
            } else {
                await load();
            }
        } catch (e) {
            alert('Erro: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setBusyProfile(null);
        }
    };

    const handleUnlink = async (profileId: string, profileEmail: string) => {
        if (!confirm(`Desvincular ${profileEmail} do publicador?`)) return;
        setBusyProfile(profileId);
        try {
            const { data, error } = await supabase.rpc('admin_unlink_profile', {
                p_profile_id: profileId,
            });
            if (error) throw error;
            const result = (data || {}) as { success?: boolean; error?: string };
            if (!result.success) {
                alert('Erro: ' + (result.error || 'falha desconhecida'));
            } else {
                await load();
            }
        } catch (e) {
            alert('Erro: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setBusyProfile(null);
        }
    };

    const visible = filter === 'unlinked'
        ? links.filter(l => !l.publisher_id && l.role === 'publicador')
        : links;

    return (
        <div style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <button
                    onClick={() => setFilter('all')}
                    style={{ ...btnStyle, background: filter === 'all' ? '#3b82f6' : 'transparent', color: filter === 'all' ? '#fff' : '#475569' }}
                >
                    Todos ({links.length})
                </button>
                <button
                    onClick={() => setFilter('unlinked')}
                    style={{ ...btnStyle, background: filter === 'unlinked' ? '#f59e0b' : 'transparent', color: filter === 'unlinked' ? '#fff' : '#475569' }}
                >
                    ⚠️ Sem vínculo ({links.filter(l => !l.publisher_id && l.role === 'publicador').length})
                </button>
                <button onClick={load} style={{ ...btnStyle, marginLeft: 'auto' }}>🔄 Atualizar</button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', color: '#475569', padding: '2rem' }}>Carregando…</div>
            ) : (
                <table style={tableStyle}>
                    <thead>
                        <tr>
                            <th style={thStyle}>E-mail Google</th>
                            <th style={thStyle}>Nome (Google)</th>
                            <th style={thStyle}>Role</th>
                            <th style={thStyle}>2FA</th>
                            <th style={thStyle}>Publicador vinculado</th>
                            <th style={thStyle}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visible.length === 0 ? (
                            <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>Nenhum registro.</td></tr>
                        ) : visible.map(l => (
                            <tr key={l.profile_id}>
                                <td style={tdStyle}>{l.email}</td>
                                <td style={tdStyle}>{l.full_name || '—'}</td>
                                <td style={tdStyle}>
                                    <span style={{
                                        background: l.role === 'admin' ? '#7c3aed' : '#0ea5e9',
                                        color: '#fff', padding: '0.15rem 0.5rem', borderRadius: '0.5rem',
                                        fontSize: '0.7rem', fontWeight: 700,
                                    }}>{l.role}</span>
                                </td>
                                <td style={tdStyle}>{l.whatsapp_verified ? '✅' : '—'}</td>
                                <td style={tdStyle}>
                                    {l.publisher_id ? (
                                        <span>
                                            <strong>{l.publisher_name || '?'}</strong>
                                            <span style={{ color: '#64748b', fontSize: '0.75rem' }}> (id {l.publisher_id})</span>
                                            {l.publisher_email && l.publisher_email !== l.email && (
                                                <span title="Email do publicador difere do email do Google" style={{ marginLeft: 4, color: '#d97706' }}>⚠️</span>
                                            )}
                                        </span>
                                    ) : (
                                        <span style={{ color: '#d97706', fontWeight: 600 }}>(sem vínculo)</span>
                                    )}
                                </td>
                                <td style={tdStyle}>
                                    {l.role !== 'admin' && (
                                        l.publisher_id ? (
                                            <button
                                                disabled={busyProfile === l.profile_id}
                                                onClick={() => handleUnlink(l.profile_id, l.email)}
                                                style={{ ...actionBtnStyle, background: '#dc2626' }}
                                            >Desvincular</button>
                                        ) : (
                                            <button
                                                disabled={busyProfile === l.profile_id}
                                                onClick={() => handleLink(l.profile_id, l.email)}
                                                style={{ ...actionBtnStyle, background: '#059669' }}
                                            >Vincular…</button>
                                        )
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <p style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.75rem' }}>
                Vínculo automático tenta primeiro <strong>e-mail</strong> (Google ↔ <code>publishers.email</code>) e depois <strong>nome</strong>. Use esta tela quando o automático falhar (homônimos, e-mail vazio, etc.).
            </p>
        </div>
    );
}

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' };
const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '0.6rem 0.75rem', color: '#475569',
    borderBottom: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.75rem',
    textTransform: 'uppercase', letterSpacing: '0.05em',
};
const tdStyle: React.CSSProperties = { padding: '0.6rem 0.75rem', color: '#1e293b', borderBottom: '1px solid #e2e8f0' };
const btnStyle: React.CSSProperties = {
    padding: '0.4rem 0.85rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1',
    background: 'transparent', color: '#475569', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
};
const actionBtnStyle: React.CSSProperties = {
    padding: '0.3rem 0.7rem', borderRadius: '0.4rem', border: 'none',
    color: '#fff', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700,
};
