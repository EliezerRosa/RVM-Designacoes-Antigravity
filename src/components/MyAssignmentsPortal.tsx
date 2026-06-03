/**
 * MyAssignmentsPortal — Full-page portal for publishers to view and respond to
 * their own designations (Minhas Designações).
 *
 * Access via: ?portal=my-assignments&publisher_id=<id>&token=<tok>
 *
 * Auth flow (completely separate from main app auth):
 *   1. Requires Google OAuth (no WhatsApp 2FA).
 *   2. First use: binds the Google email to the token permanently.
 *   3. Subsequent uses: same Google email required.
 *   4. Admin: bypasses email check, can view any publisher's portal.
 *
 * Actions available inside the portal (same as MyAssignmentsModal):
 *   - View future parts (PROPOSTA / DESIGNADA)
 *   - Confirm or refuse each part
 *   - Copy S-89 to clipboard
 *   - Open availability portal in new tab
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { authorizeMyAssignmentsPortal } from '../services/myAssignmentsPortalService';
import { copyS89ToClipboard } from '../services/s89Generator';
import { getTodayWeekIdLocal } from '../utils/dateUtils';
import { workbookService } from '../services/workbookService';
import type { WorkbookPart, Publisher } from '../types';
import type { AvailabilityToken } from './PublisherAvailabilityPortal';

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
    PROPOSTA: 'Proposta',
    DESIGNADA: 'Designada',
    CONCLUIDA: 'Concluída',
    PENDENTE: 'Pendente',
};

const STATUS_COLOR: Record<string, string> = {
    PROPOSTA: '#F59E0B',
    DESIGNADA: '#3B82F6',
    CONCLUIDA: '#10B981',
    PENDENTE: '#6B7280',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractPartNumber(titulo: string): string {
    const match = titulo?.match(/^(\d+)/);
    return match ? match[1] : '';
}

function formatDateBR(dateStr: string | undefined): string {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
}

type ConfirmationStatus = 'confirmed' | 'refused';

// ── Sub-screens ───────────────────────────────────────────────────────────────

function FullPageShell({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: '#e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '24px 16px',
        }}>
            <div style={{
                width: '100%',
                maxWidth: '640px',
            }}>
                <div style={{
                    fontSize: '13px',
                    color: '#475569',
                    marginBottom: '18px',
                    textAlign: 'center',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    fontWeight: '600',
                }}>
                    RVM Designações
                </div>
                {children}
            </div>
        </div>
    );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
            padding: '24px',
            ...style,
        }}>
            {children}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
    publisherId: string;
    token: string;
}

export function MyAssignmentsPortal({ publisherId, token }: Props) {
    const { user, profile, isLoading: authLoading, signInWithGoogle, signOut } = useAuth();

    // Authorization state
    const [authChecked,    setAuthChecked]    = useState(false);
    const [isAuthorized,   setIsAuthorized]   = useState(false);
    const [authError,      setAuthError]      = useState<string | null>(null);
    const [publisherName,  setPublisherName]  = useState('');
    const [isAdminAccess,  setIsAdminAccess]  = useState(false);
    const [boundEmail,     setBoundEmail]     = useState<string | null>(null);
    const [isGlobalBlock,  setIsGlobalBlock]  = useState(false);
    const [isSigningIn,    setIsSigningIn]    = useState(false);

    // Data state
    const [parts,       setParts]       = useState<WorkbookPart[]>([]);
    const [, setPublishers]  = useState<Publisher[]>([]);
    const [dataLoading, setDataLoading] = useState(false);
    const [weekOrder,   setWeekOrder]   = useState<string[]>([]);

    // Part interaction state (same as modal)
    const [confirmStatuses, setConfirmStatuses] = useState<Record<string, ConfirmationStatus>>({});
    const [submittingId,    setSubmittingId]    = useState<string | null>(null);
    const [refusingPartId,  setRefusingPartId]  = useState<string | null>(null);
    const [refuseReason,    setRefuseReason]    = useState('');
    const [s89LoadingId,    setS89LoadingId]    = useState<string | null>(null);
    const [s89CopiedId,     setS89CopiedId]     = useState<string | null>(null);
    const [availabilityLoading, setAvailabilityLoading] = useState(false);

    const todayWeekId = useMemo(() => getTodayWeekIdLocal(), []);

    // ── Authorization ─────────────────────────────────────────────────────────

    useEffect(() => {
        if (authLoading) return;

        if (!user) {
            setAuthChecked(true);
            setIsAuthorized(false);
            return;
        }

        if (!profile) {
            setAuthChecked(true);
            setIsAuthorized(false);
            setAuthError('Seu login Google foi reconhecido, mas seu perfil não está vinculado ao sistema.');
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const result = await authorizeMyAssignmentsPortal(publisherId, token);

                if (cancelled) return;

                if (!result.authorized) {
                    setIsAuthorized(false);
                    setIsGlobalBlock(result.reason === 'global_block');
                    setAuthError(
                        result.reason === 'global_block'
                            ? 'O portal de designações está temporariamente suspenso pelo administrador.'
                            : result.reason === 'publisher_blocked'
                                ? 'Seu acesso ao portal está bloqueado. Contacte o administrador.'
                                : result.reason === 'email_mismatch'
                                    ? `Este link já foi associado ao e-mail ${result.bound_email || 'outro'}. Faça login com essa conta Google.`
                                    : 'Link inválido ou expirado. Solicite um novo link.'
                    );
                } else {
                    setIsAuthorized(true);
                    setPublisherName(result.publisher_name ?? '');
                    setIsAdminAccess(result.is_admin ?? false);
                    setBoundEmail(result.bound_email ?? null);
                    setIsGlobalBlock(result.global_blocked ?? false);
                }
            } catch {
                if (!cancelled) {
                    setIsAuthorized(false);
                    setAuthError('Falha ao validar acesso. Tente novamente.');
                }
            } finally {
                if (!cancelled) setAuthChecked(true);
            }
        })();

        return () => { cancelled = true; };
    }, [authLoading, user, profile, publisherId, token]);

    // ── Data loading ──────────────────────────────────────────────────────────

    const loadData = useCallback(async () => {
        if (!isAuthorized) return;
        setDataLoading(true);
        try {
            const [allParts, pubs] = await Promise.all([
                workbookService.getByStatus(['PROPOSTA', 'DESIGNADA'] as any, todayWeekId),
                api.loadPublishers(),
            ]);

            const myParts = allParts.filter(
                p =>
                    p.resolvedPublisherId === publisherId &&
                    p.weekId >= todayWeekId &&
                    !p.isChairmanDerived
            );

            setParts(myParts);
            setPublishers(pubs);

            // Derive ordered week list from parts
            const weeks = [...new Set(myParts.map(p => p.weekId))].sort();
            setWeekOrder(weeks);

            // Load confirmation statuses
            if (myParts.length > 0) {
                const uniqueWeeks = [...new Set(myParts.map(p => p.weekId))];
                const results = await Promise.all(
                    uniqueWeeks.map(wid =>
                        supabase
                            .rpc('get_portal_responses_for_week', { p_week_id: wid })
                            .then(({ data }) => data || [], () => [])
                    )
                );
                const map: Record<string, ConfirmationStatus> = {};
                (results.flat() as { part_id: string; response: string }[]).forEach(row => {
                    const resp = (row.response || '').toLowerCase();
                    if (resp === 'confirmed') map[row.part_id] = 'confirmed';
                    else if (resp === 'refused') map[row.part_id] = 'refused';
                });
                setConfirmStatuses(map);
            }
        } catch (err) {
            console.error('[MyAssignmentsPortal] load error:', err);
        } finally {
            setDataLoading(false);
        }
    }, [isAuthorized, publisherId, todayWeekId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // ── Grouped parts ─────────────────────────────────────────────────────────

    const grouped = useMemo(() => {
        const map: Record<string, WorkbookPart[]> = {};
        for (const p of parts) {
            if (!map[p.weekId]) map[p.weekId] = [];
            map[p.weekId].push(p);
        }
        return weekOrder
            .filter(wid => map[wid])
            .map(wid => ({ weekId: wid, weekDisplay: map[wid][0].weekDisplay, parts: map[wid] }));
    }, [parts, weekOrder]);

    // ── S-89 helpers ──────────────────────────────────────────────────────────

    const resolveS89CardParams = (part: WorkbookPart) => {
        const weekParts = parts.filter(p => p.weekId === part.weekId);
        const isAjudante = part.funcao === 'Ajudante';
        const currentPartNum = extractPartNumber(part.tituloParte || part.tipoParte || '');
        let partForPdf: WorkbookPart = part;
        let assistantName: string | undefined;

        if (isAjudante) {
            const titular = weekParts.find(p => {
                const pNum = extractPartNumber(p.tituloParte || p.tipoParte || '');
                return pNum === currentPartNum && p.funcao === 'Titular' && p.id !== part.id;
            });
            if (titular) { partForPdf = titular; assistantName = part.resolvedPublisherName || part.rawPublisherName; }
        } else {
            const assistant = weekParts.find(p => {
                const pNum = extractPartNumber(p.tituloParte || p.tipoParte || '');
                return pNum === currentPartNum && p.funcao === 'Ajudante' && p.id !== part.id;
            });
            assistantName = assistant?.resolvedPublisherName || assistant?.rawPublisherName;
        }

        const pType    = (part.tipoParte || '').toLowerCase();
        const pSection = (part.section   || '').toLowerCase();
        const isStudent =
            pSection.includes('ministério') || pSection.includes('ministerio') ||
            pType.includes('leitura') || pType.includes('conversa') ||
            pType.includes('revisita') || pType.includes('estudo');

        return { partForPdf, assistantName, isStudent };
    };

    const handleCopyS89 = async (part: WorkbookPart) => {
        if (s89LoadingId) return;
        setS89LoadingId(part.id);
        try {
            const { partForPdf, assistantName, isStudent } = resolveS89CardParams(part);
            const ok = await copyS89ToClipboard(partForPdf, assistantName, undefined, isStudent);
            if (ok) {
                setS89CopiedId(part.id);
                setTimeout(() => setS89CopiedId(prev => (prev === part.id ? null : prev)), 2500);
            } else {
                alert('Não foi possível copiar o S-89. Verifique as permissões do navegador.');
            }
        } catch {
            alert('Erro ao gerar S-89.');
        } finally {
            setS89LoadingId(null);
        }
    };

    // ── Confirm / refuse ──────────────────────────────────────────────────────

    const handleConfirmOrRefuse = async (part: WorkbookPart, accept: boolean, reason?: string) => {
        if (submittingId) return;
        if (!accept && !reason?.trim()) { alert('Por favor, informe o motivo da recusa.'); return; }

        setSubmittingId(part.id);
        try {
            const { data: tokenData, error: tokenError } = await supabase.rpc(
                'create_confirmation_portal_token',
                { p_part_id: part.id, p_publisher_id: publisherId }
            );
            if (tokenError) throw tokenError;

            const tokenResult = (
                tokenData && typeof tokenData === 'object' && !Array.isArray(tokenData)
                    ? tokenData : {}
            ) as { success?: boolean; token?: string; error?: string };

            if (!tokenResult.success || !tokenResult.token) throw new Error(tokenResult.error || 'Token não criado');

            const { data: submitData, error: submitError } = await supabase.rpc(
                'submit_confirmation_portal_response',
                {
                    p_part_id:     part.id,
                    p_publisher_id: publisherId,
                    p_token:       tokenResult.token,
                    p_accept:      accept,
                    p_reason:      accept ? null : (reason?.trim() || null),
                }
            );
            if (submitError) throw submitError;

            const result = (
                submitData && typeof submitData === 'object' && !Array.isArray(submitData)
                    ? submitData : {}
            ) as { success?: boolean; error?: string };

            if (!result.success) throw new Error(result.error || 'Falha ao registrar resposta');

            setConfirmStatuses(prev => ({ ...prev, [part.id]: accept ? 'confirmed' : 'refused' }));
            setRefusingPartId(null);
            setRefuseReason('');
        } catch (err) {
            console.error('[MyAssignmentsPortal] confirm/refuse error:', err);
            alert('Erro ao processar sua resposta. Tente novamente.');
        } finally {
            setSubmittingId(null);
        }
    };

    // ── Availability portal ───────────────────────────────────────────────────

    const handleOpenAvailability = async () => {
        setAvailabilityLoading(true);
        try {
            const tokens = await api.getSetting<AvailabilityToken[]>('availability_tokens', []);
            let tok = tokens.find(t => t.publisherId === publisherId && t.active);
            if (!tok) {
                const arr = new Uint8Array(18);
                crypto.getRandomValues(arr);
                tok = {
                    token: Array.from(arr, b => b.toString(16).padStart(2, '0')).join(''),
                    publisherId,
                    publisherName,
                    createdAt: new Date().toISOString(),
                    createdBy: 'my-assignments-portal',
                    active: true,
                };
                await api.setSetting('availability_tokens', [...tokens, tok]);
            }
            const base = window.location.origin + window.location.pathname;
            window.open(`${base}?portal=availability&token=${tok.token}`, '_blank', 'noopener');
        } catch {
            alert('Erro ao abrir portal de disponibilidade.');
        } finally {
            setAvailabilityLoading(false);
        }
    };

    // ── Login handler ─────────────────────────────────────────────────────────

    const handleGoogleLogin = async () => {
        setIsSigningIn(true);
        try {
            await signInWithGoogle();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Falha ao iniciar login Google.';
            setAuthError(msg);
            setIsSigningIn(false);
        }
    };

    // ── Render: loading ───────────────────────────────────────────────────────

    if (authLoading || (user && !authChecked)) {
        return (
            <FullPageShell>
                <Card style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
                    <p style={{ color: '#94a3b8', margin: 0 }}>Validando acesso...</p>
                </Card>
            </FullPageShell>
        );
    }

    // ── Render: not logged in ─────────────────────────────────────────────────

    if (!user) {
        return (
            <FullPageShell>
                <Card>
                    <h2 style={{ margin: '0 0 8px', fontSize: '1.3rem', fontWeight: '700' }}>
                        📋 Minhas Designações
                    </h2>
                    <p style={{ color: '#94a3b8', margin: '0 0 20px', lineHeight: 1.6, fontSize: '14px' }}>
                        Entre com sua conta Google para visualizar suas designações.
                        Não é necessário verificação por WhatsApp para este portal.
                    </p>
                    {authError && (
                        <p style={{ color: '#fca5a5', marginBottom: '16px', fontSize: '14px' }}>{authError}</p>
                    )}
                    <button
                        onClick={handleGoogleLogin}
                        disabled={isSigningIn}
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '10px',
                            background: '#4F46E5',
                            border: 'none',
                            color: '#fff',
                            fontSize: '14px',
                            fontWeight: '700',
                            cursor: isSigningIn ? 'wait' : 'pointer',
                        }}
                    >
                        {isSigningIn ? 'Redirecionando...' : '🔐 Entrar com Google'}
                    </button>
                </Card>
            </FullPageShell>
        );
    }

    // ── Render: not authorized ────────────────────────────────────────────────

    if (authChecked && !isAuthorized) {
        return (
            <FullPageShell>
                <Card style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔒</div>
                    <h2 style={{ margin: '0 0 10px', fontSize: '1.2rem' }}>Acesso não autorizado</h2>
                    <p style={{ color: '#94a3b8', margin: '0 0 20px', lineHeight: 1.6, fontSize: '14px' }}>
                        {authError || 'Não foi possível validar seu acesso a este portal.'}
                    </p>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                            onClick={handleGoogleLogin}
                            disabled={isSigningIn}
                            style={{
                                padding: '10px 20px',
                                borderRadius: '10px',
                                background: '#4F46E5',
                                border: 'none',
                                color: '#fff',
                                fontSize: '13px',
                                fontWeight: '600',
                                cursor: 'pointer',
                            }}
                        >
                            {isSigningIn ? 'Redirecionando...' : 'Trocar conta Google'}
                        </button>
                        <button
                            onClick={signOut}
                            style={{
                                padding: '10px 20px',
                                borderRadius: '10px',
                                background: 'transparent',
                                border: '1px solid #475569',
                                color: '#94a3b8',
                                fontSize: '13px',
                                cursor: 'pointer',
                            }}
                        >
                            Sair
                        </button>
                    </div>
                </Card>
            </FullPageShell>
        );
    }

    // ── Render: authorized — data loading ─────────────────────────────────────

    if (dataLoading) {
        return (
            <FullPageShell>
                <Card style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📋</div>
                    <p style={{ color: '#94a3b8', margin: 0 }}>Carregando designações...</p>
                </Card>
            </FullPageShell>
        );
    }

    // ── Render: main portal ───────────────────────────────────────────────────

    return (
        <FullPageShell>
            {/* Header */}
            <div style={{ marginBottom: '20px' }}>
                <h1 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontWeight: '800' }}>
                    📋 Minhas Designações
                </h1>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>
                    {publisherName}
                    {isAdminAccess && (
                        <span style={{ marginLeft: '8px', color: '#F59E0B', fontSize: '12px', fontWeight: '600' }}>
                            [Admin]
                        </span>
                    )}
                </p>
                {isGlobalBlock && isAdminAccess && (
                    <p style={{ margin: '8px 0 0', color: '#F59E0B', fontSize: '12px', background: '#451A03', border: '1px solid #78350F', borderRadius: '8px', padding: '6px 10px' }}>
                        ⚠️ Portal globalmente bloqueado (visível apenas para admins)
                    </p>
                )}
                {boundEmail && (
                    <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: '12px' }}>
                        🔒 Acesso vinculado a: {boundEmail}
                    </p>
                )}
            </div>

            {/* Parts */}
            {grouped.length === 0 ? (
                <Card style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📅</div>
                    <p style={{ margin: 0, color: '#94a3b8' }}>Nenhuma designação futura encontrada.</p>
                    <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#475569' }}>
                        Partes com status Proposta ou Designada aparecerão aqui.
                    </p>
                </Card>
            ) : (
                grouped.map(({ weekId, weekDisplay, parts: wParts }) => (
                    <div key={weekId} style={{ marginBottom: '20px' }}>
                        {/* Week divider */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <div style={{ height: '1px', flex: 1, background: 'rgba(255,255,255,0.08)' }} />
                            <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                                semana {weekDisplay || weekId}
                            </span>
                            <div style={{ height: '1px', flex: 1, background: 'rgba(255,255,255,0.08)' }} />
                        </div>

                        {wParts.map(part => {
                            const confirmStatus = confirmStatuses[part.id];
                            const isRefusing    = refusingPartId === part.id;
                            const isSub         = submittingId === part.id;
                            const isS89Loading  = s89LoadingId === part.id;
                            const isS89Copied   = s89CopiedId === part.id;
                            const funcaoColor   = part.funcao === 'Ajudante' ? '#8B5CF6' : '#3B82F6';
                            const statusColor   = STATUS_COLOR[part.status] || '#6B7280';
                            const partTitle     = part.tituloParte || part.tipoParte || '—';

                            return (
                                <Card key={part.id} style={{ marginBottom: '12px', padding: '16px' }}>
                                    {/* Row 1: title + badges */}
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                        <span style={{ color: '#E2E8F0', fontWeight: '600', fontSize: '14px', flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                                            {partTitle}
                                        </span>
                                        <span style={{ background: funcaoColor + '22', color: funcaoColor, border: '1px solid ' + funcaoColor + '44', borderRadius: '6px', padding: '2px 7px', fontSize: '11px', fontWeight: '600', flexShrink: 0 }}>
                                            {part.funcao}
                                        </span>
                                        <span style={{ background: statusColor + '22', color: statusColor, border: '1px solid ' + statusColor + '44', borderRadius: '6px', padding: '2px 7px', fontSize: '11px', fontWeight: '600', flexShrink: 0 }}>
                                            {STATUS_LABEL[part.status] || part.status}
                                        </span>
                                    </div>

                                    {/* Row 2: meta */}
                                    <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {part.date ? <span>{formatDateBR(part.date)}</span> : <span>{weekId}</span>}
                                        {part.section && <><span style={{ color: '#334155' }}>·</span><span>{part.section}</span></>}
                                        {part.horaInicio && <><span style={{ color: '#334155' }}>·</span><span>{part.horaInicio}</span></>}
                                    </div>

                                    {/* Row 3: actions */}
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        {/* S-89 */}
                                        <button
                                            onClick={() => handleCopyS89(part)}
                                            disabled={!!s89LoadingId}
                                            style={{
                                                padding: '7px 12px', borderRadius: '8px',
                                                background: isS89Copied ? '#064E3B' : 'rgba(255,255,255,0.05)',
                                                border: '1px solid ' + (isS89Copied ? '#10B981' : 'rgba(255,255,255,0.1)'),
                                                color: isS89Copied ? '#6EE7B7' : '#94A3B8',
                                                fontSize: '12px', cursor: isS89Loading ? 'wait' : 'pointer',
                                                display: 'flex', gap: '4px', alignItems: 'center',
                                            }}
                                        >
                                            {isS89Loading ? '⏳' : isS89Copied ? '✓' : '📋'} {isS89Copied ? 'S-89 copiado' : 'Copiar S-89'}
                                        </button>

                                        {/* Confirm / refuse */}
                                        {confirmStatus === 'confirmed' ? (
                                            <span style={{ color: '#34D399', fontSize: '13px', fontWeight: '600' }}>✓ Confirmado</span>
                                        ) : confirmStatus === 'refused' ? (
                                            <span style={{ color: '#F87171', fontSize: '13px', fontWeight: '600' }}>✗ Recusado</span>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => handleConfirmOrRefuse(part, true)}
                                                    disabled={isSub}
                                                    style={{
                                                        padding: '7px 14px', borderRadius: '8px',
                                                        background: '#064E3B', border: '1px solid #065F46',
                                                        color: '#6EE7B7', fontSize: '12px', fontWeight: '600',
                                                        cursor: isSub ? 'wait' : 'pointer',
                                                    }}
                                                >
                                                    {isSub ? '⏳' : '✓ Confirmar'}
                                                </button>

                                                {!isRefusing ? (
                                                    <button
                                                        onClick={() => { setRefusingPartId(part.id); setRefuseReason(''); }}
                                                        disabled={isSub}
                                                        style={{
                                                            padding: '7px 14px', borderRadius: '8px',
                                                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                                            color: '#94A3B8', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                                                        }}
                                                    >
                                                        ✗ Recusar
                                                    </button>
                                                ) : (
                                                    <div style={{ width: '100%', marginTop: '6px' }}>
                                                        <textarea
                                                            value={refuseReason}
                                                            onChange={e => setRefuseReason(e.target.value)}
                                                            placeholder="Motivo da recusa (obrigatório)…"
                                                            rows={2}
                                                            style={{
                                                                width: '100%', boxSizing: 'border-box',
                                                                background: 'rgba(0,0,0,0.3)', border: '1px solid #475569',
                                                                borderRadius: '8px', color: '#E2E8F0',
                                                                padding: '8px 10px', fontSize: '13px',
                                                                resize: 'vertical', fontFamily: 'inherit',
                                                            }}
                                                        />
                                                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                                            <button
                                                                onClick={() => handleConfirmOrRefuse(part, false, refuseReason)}
                                                                disabled={isSub || !refuseReason.trim()}
                                                                style={{
                                                                    padding: '7px 14px', borderRadius: '8px',
                                                                    background: refuseReason.trim() ? '#7F1D1D' : 'rgba(255,255,255,0.05)',
                                                                    border: '1px solid #991B1B',
                                                                    color: refuseReason.trim() ? '#FCA5A5' : '#64748B',
                                                                    fontSize: '12px', fontWeight: '600',
                                                                    cursor: (!refuseReason.trim() || isSub) ? 'not-allowed' : 'pointer',
                                                                }}
                                                            >
                                                                {isSub ? '⏳' : 'Confirmar recusa'}
                                                            </button>
                                                            <button
                                                                onClick={() => { setRefusingPartId(null); setRefuseReason(''); }}
                                                                style={{
                                                                    padding: '7px 14px', borderRadius: '8px',
                                                                    background: 'none', border: '1px solid #334155',
                                                                    color: '#64748B', fontSize: '12px', cursor: 'pointer',
                                                                }}
                                                            >
                                                                Cancelar
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                ))
            )}

            {/* Footer: availability + sign out */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '8px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <button
                    onClick={handleOpenAvailability}
                    disabled={availabilityLoading}
                    style={{
                        padding: '10px 20px', borderRadius: '10px',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#93C5FD', fontSize: '13px', fontWeight: '600',
                        cursor: availabilityLoading ? 'wait' : 'pointer',
                        display: 'flex', gap: '6px', alignItems: 'center',
                    }}
                >
                    {availabilityLoading ? '⏳' : '📅'} Atualizar disponibilidade
                </button>

                <button
                    onClick={signOut}
                    style={{
                        padding: '10px 20px', borderRadius: '10px',
                        background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#64748B', fontSize: '12px', cursor: 'pointer',
                    }}
                >
                    Sair
                </button>
            </div>
        </FullPageShell>
    );
}
