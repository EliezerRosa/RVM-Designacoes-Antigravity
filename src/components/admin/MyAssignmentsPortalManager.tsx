/**
 * MyAssignmentsPortalManager — Admin panel to manage publisher portal tokens.
 *
 * Features:
 *   - Global block toggle: suspends the portal for all publishers at once
 *   - "Gerar tokens para todos" button: bulk-creates missing tokens
 *   - Table: name | bound email | status | copy link | block/unblock | regenerate
 *
 * Pattern follows AvailabilityLinkManager.tsx
 */

import { useState, useEffect, useCallback } from 'react';
import {
    listPublisherPortalTokens,
    getOrCreatePortalToken,
    regeneratePortalToken,
    bulkGeneratePortalTokens,
    setPublisherPortalBlock,
    setGlobalPortalBlock,
    buildMyAssignmentsPortalUrl,
    type PublisherPortalTokenRow,
} from '../../services/myAssignmentsPortalService';
import { supabase } from '../../lib/supabase';

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
    container: {
        padding: '20px 0',
    } as React.CSSProperties,

    section: {
        marginBottom: '24px',
    } as React.CSSProperties,

    heading: {
        fontSize: '13px',
        fontWeight: '700' as const,
        color: '#94A3B8',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.07em',
        marginBottom: '12px',
    } as React.CSSProperties,

    card: {
        background: '#1E293B',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '16px',
    } as React.CSSProperties,

    btn: (variant: 'primary' | 'danger' | 'muted' | 'warn' = 'muted'): React.CSSProperties => ({
        padding: '6px 12px',
        borderRadius: '8px',
        fontSize: '12px',
        fontWeight: '600',
        cursor: 'pointer',
        border: '1px solid',
        transition: 'all 0.15s',
        ...(variant === 'primary'  ? { background: '#1E3A8A', borderColor: '#2563EB', color: '#93C5FD' } :
            variant === 'danger'   ? { background: '#7F1D1D', borderColor: '#991B1B', color: '#FCA5A5' } :
            variant === 'warn'     ? { background: '#451A03', borderColor: '#78350F', color: '#FCD34D' } :
            /* muted */              { background: '#0F172A', borderColor: '#334155', color: '#94A3B8' }),
    }),

    badgeGreen:  { display: 'inline-block', padding: '2px 7px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', background: '#064E3B', border: '1px solid #065F46', color: '#6EE7B7' } as React.CSSProperties,
    badgeRed:    { display: 'inline-block', padding: '2px 7px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', background: '#7F1D1D', border: '1px solid #991B1B', color: '#FCA5A5' } as React.CSSProperties,
    badgeGray:   { display: 'inline-block', padding: '2px 7px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', background: '#1E293B', border: '1px solid #334155', color: '#64748B'  } as React.CSSProperties,
    badgeAmber:  { display: 'inline-block', padding: '2px 7px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', background: '#451A03', border: '1px solid #78350F', color: '#FCD34D'  } as React.CSSProperties,
};

// ── Types ─────────────────────────────────────────────────────────────────────

type BlockDialogState = {
    publisherId: string;
    publisherName: string;
} | null;

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
    adminEmail?: string;
}

export function MyAssignmentsPortalManager({ adminEmail: _adminEmail }: Props) {
    const [rows,            setRows]            = useState<PublisherPortalTokenRow[]>([]);
    const [loading,         setLoading]         = useState(false);
    const [bulkRunning,     setBulkRunning]      = useState(false);
    const [globalBlocked,   setGlobalBlocked]    = useState(false);
    const [globalSaving,    setGlobalSaving]     = useState(false);
    const [copyingId,       setCopyingId]        = useState<string | null>(null);
    const [copiedId,        setCopiedId]         = useState<string | null>(null);
    const [regenId,         setRegenId]          = useState<string | null>(null);
    const [blockDialog,     setBlockDialog]      = useState<BlockDialogState>(null);
    const [blockReason,     setBlockReason]      = useState('');
    const [blockSaving,     setBlockSaving]      = useState(false);
    const [filterText,      setFilterText]       = useState('');
    const [toast,           setToast]            = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    // ── Load data ─────────────────────────────────────────────────────────────

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [tokenRows, setting] = await Promise.all([
                listPublisherPortalTokens(),
                supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', 'my_assignments_portal_global_block')
                    .maybeSingle()
                    .then(({ data }) =>
                        data ? (data.value as { blocked?: boolean })?.blocked ?? false : false
                    ),
            ]);
            setRows(tokenRows);
            setGlobalBlocked(setting);
        } catch (err) {
            console.error('[MyAssignmentsPortalManager] load error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // ── Global block ──────────────────────────────────────────────────────────

    const handleToggleGlobalBlock = async () => {
        setGlobalSaving(true);
        const next = !globalBlocked;
        const ok = await setGlobalPortalBlock(next);
        if (ok) {
            setGlobalBlocked(next);
            showToast(next ? 'Portal bloqueado globalmente.' : 'Portal desbloqueado globalmente.');
        } else {
            showToast('Falha ao alterar bloqueio global.');
        }
        setGlobalSaving(false);
    };

    // ── Bulk generate ─────────────────────────────────────────────────────────

    const handleBulkGenerate = async () => {
        setBulkRunning(true);
        const count = await bulkGeneratePortalTokens();
        showToast(`${count} token(s) gerado(s).`);
        await loadData();
        setBulkRunning(false);
    };

    // ── Copy link ─────────────────────────────────────────────────────────────

    const handleCopyLink = async (row: PublisherPortalTokenRow) => {
        setCopyingId(row.publisher_id);
        try {
            let tok = row.token;
            if (!tok) {
                const result = await getOrCreatePortalToken(row.publisher_id);
                if (!result) throw new Error('token not created');
                tok = result.token;
                await loadData();
            }
            const url = buildMyAssignmentsPortalUrl(row.publisher_id, tok);
            await navigator.clipboard.writeText(url);
            setCopiedId(row.publisher_id);
            setTimeout(() => setCopiedId(prev => (prev === row.publisher_id ? null : prev)), 2500);
        } catch {
            showToast('Erro ao copiar link.');
        } finally {
            setCopyingId(null);
        }
    };

    // ── Regenerate token ──────────────────────────────────────────────────────

    const handleRegenerate = async (row: PublisherPortalTokenRow) => {
        if (!confirm(`Regenerar token de ${row.publisher_name}? O link anterior será invalidado e o email vinculado será desfeito.`)) return;
        setRegenId(row.publisher_id);
        try {
            const newTok = await regeneratePortalToken(row.publisher_id);
            if (newTok) {
                showToast(`Token regenerado para ${row.publisher_name}.`);
            } else {
                showToast('Falha ao regenerar token.');
            }
            await loadData();
        } finally {
            setRegenId(null);
        }
    };

    // ── Block / unblock ───────────────────────────────────────────────────────

    const handleBlockUnblock = (row: PublisherPortalTokenRow) => {
        if (row.is_blocked) {
            // Unblock directly (no reason needed)
            (async () => {
                const ok = await setPublisherPortalBlock(row.publisher_id, false);
                if (ok) showToast(`${row.publisher_name} desbloqueado(a).`);
                else showToast('Falha ao desbloquear.');
                await loadData();
            })();
        } else {
            setBlockDialog({ publisherId: row.publisher_id, publisherName: row.publisher_name });
            setBlockReason('');
        }
    };

    const confirmBlock = async () => {
        if (!blockDialog) return;
        setBlockSaving(true);
        const ok = await setPublisherPortalBlock(blockDialog.publisherId, true, blockReason || undefined);
        if (ok) showToast(`${blockDialog.publisherName} bloqueado(a).`);
        else showToast('Falha ao bloquear.');
        setBlockDialog(null);
        setBlockSaving(false);
        await loadData();
    };

    // ── Filter ────────────────────────────────────────────────────────────────

    const filtered = filterText.trim()
        ? rows.filter(r => r.publisher_name?.toLowerCase().includes(filterText.toLowerCase()) ||
                           r.bound_email?.toLowerCase().includes(filterText.toLowerCase()))
        : rows;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div style={S.container}>
            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
                    background: '#1E293B', border: '1px solid #334155', borderRadius: '10px',
                    padding: '10px 20px', color: '#E2E8F0', fontSize: '13px', fontWeight: '600',
                    zIndex: 9999, boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                }}>
                    {toast}
                </div>
            )}

            {/* Block dialog */}
            {blockDialog && (
                <div
                    onClick={() => setBlockDialog(null)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 9998, padding: '24px',
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#111827', border: '1px solid #334155', borderRadius: '16px',
                            padding: '24px', width: '100%', maxWidth: '400px',
                        }}
                    >
                        <h3 style={{ margin: '0 0 12px', fontSize: '15px', color: '#F1F5F9' }}>
                            Bloquear portal de {blockDialog.publisherName}
                        </h3>
                        <p style={{ margin: '0 0 14px', color: '#94A3B8', fontSize: '13px' }}>
                            O publicador não conseguirá acessar o portal até ser desbloqueado.
                        </p>
                        <textarea
                            value={blockReason}
                            onChange={e => setBlockReason(e.target.value)}
                            placeholder="Motivo (opcional)…"
                            rows={2}
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                background: '#1E293B', border: '1px solid #475569',
                                borderRadius: '8px', color: '#E2E8F0',
                                padding: '8px 10px', fontSize: '13px', resize: 'vertical',
                                fontFamily: 'inherit', marginBottom: '14px',
                            }}
                        />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setBlockDialog(null)}
                                style={S.btn('muted')}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmBlock}
                                disabled={blockSaving}
                                style={S.btn('danger')}
                            >
                                {blockSaving ? '⏳' : 'Bloquear'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Controls ───────────────────────────────────────────────── */}
            <div style={S.section}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Global block */}
                    <button
                        onClick={handleToggleGlobalBlock}
                        disabled={globalSaving}
                        style={S.btn(globalBlocked ? 'warn' : 'muted')}
                    >
                        {globalSaving ? '⏳' : globalBlocked ? '⚠️ Desbloquear portal globalmente' : '🔒 Bloquear portal globalmente'}
                    </button>

                    {/* Bulk generate */}
                    <button
                        onClick={handleBulkGenerate}
                        disabled={bulkRunning}
                        style={S.btn('primary')}
                    >
                        {bulkRunning ? '⏳ Gerando…' : '🔑 Gerar tokens faltantes'}
                    </button>

                    {/* Refresh */}
                    <button onClick={loadData} disabled={loading} style={S.btn('muted')}>
                        {loading ? '⏳' : '↻ Atualizar'}
                    </button>
                </div>

                {globalBlocked && (
                    <div style={{ marginTop: '12px', padding: '10px 14px', background: '#451A03', border: '1px solid #78350F', borderRadius: '10px', color: '#FCD34D', fontSize: '13px' }}>
                        ⚠️ Portal de designações está <strong>globalmente bloqueado</strong>. Nenhum publicador conseguirá acessar.
                    </div>
                )}
            </div>

            {/* ── Search ─────────────────────────────────────────────────── */}
            <div style={{ marginBottom: '16px' }}>
                <input
                    type="text"
                    value={filterText}
                    onChange={e => setFilterText(e.target.value)}
                    placeholder="Filtrar por nome ou email…"
                    style={{
                        width: '100%', boxSizing: 'border-box',
                        background: '#1E293B', border: '1px solid #334155', borderRadius: '10px',
                        color: '#E2E8F0', padding: '9px 12px', fontSize: '13px',
                        outline: 'none',
                    }}
                />
            </div>

            {/* ── Stats ──────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '12px', color: '#64748B' }}>
                <span>{rows.length} publicadores</span>
                <span>{rows.filter(r => r.token && r.is_active).length} com token ativo</span>
                <span>{rows.filter(r => r.bound_email).length} com email vinculado</span>
                <span>{rows.filter(r => r.is_blocked).length} bloqueados</span>
            </div>

            {/* ── Table ──────────────────────────────────────────────────── */}
            {loading ? (
                <div style={{ textAlign: 'center', color: '#64748B', padding: '40px' }}>⏳ Carregando…</div>
            ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748B', padding: '40px' }}>
                    {filterText ? 'Nenhum resultado.' : 'Nenhum publicador encontrado.'}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {filtered.map(row => {
                        const isCopying = copyingId === row.publisher_id;
                        const isCopied  = copiedId  === row.publisher_id;
                        const isRegen   = regenId   === row.publisher_id;
                        const hasToken  = !!(row.token && row.is_active);

                        return (
                            <div key={row.publisher_id} style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {/* Row 1: name + status badge */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: '600', color: '#E2E8F0', fontSize: '14px' }}>
                                        {row.publisher_name || row.publisher_id}
                                    </span>
                                    <span style={
                                        row.is_blocked ? S.badgeRed :
                                        !hasToken      ? S.badgeGray :
                                        row.bound_email ? S.badgeGreen :
                                        S.badgeAmber
                                    }>
                                        {row.is_blocked ? 'Bloqueado' :
                                         !hasToken      ? 'Sem token' :
                                         row.bound_email ? 'Ativo' :
                                         'Token gerado'}
                                    </span>
                                </div>

                                {/* Row 2: email */}
                                <div style={{ fontSize: '12px', color: '#64748B' }}>
                                    {row.bound_email
                                        ? <>🔒 {row.bound_email}</>
                                        : <span style={{ fontStyle: 'italic' }}>Sem email vinculado</span>
                                    }
                                </div>

                                {/* Row 3: actions */}
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {/* Copy link */}
                                    <button
                                        onClick={() => handleCopyLink(row)}
                                        disabled={isCopying}
                                        style={{
                                            ...S.btn('primary'),
                                            ...(isCopied ? { background: '#064E3B', borderColor: '#065F46', color: '#6EE7B7' } : {}),
                                        }}
                                    >
                                        {isCopying ? '⏳' : isCopied ? '✓ Copiado' : '🔗 Copiar link'}
                                    </button>

                                    {/* Block / unblock */}
                                    <button
                                        onClick={() => handleBlockUnblock(row)}
                                        style={S.btn(row.is_blocked ? 'warn' : 'muted')}
                                    >
                                        {row.is_blocked ? '🔓 Desbloquear' : '🔒 Bloquear'}
                                    </button>

                                    {/* Regenerate */}
                                    <button
                                        onClick={() => handleRegenerate(row)}
                                        disabled={isRegen}
                                        style={S.btn('muted')}
                                    >
                                        {isRegen ? '⏳' : '🔄 Regenerar token'}
                                    </button>
                                </div>

                                {/* Block reason */}
                                {row.is_blocked && row.block_reason && (
                                    <div style={{ fontSize: '11px', color: '#F87171', background: '#450A0A', border: '1px solid #7F1D1D', borderRadius: '6px', padding: '5px 8px' }}>
                                        Motivo: {row.block_reason}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
