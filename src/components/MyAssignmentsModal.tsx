/**
 * MyAssignmentsModal — Modal de designações do publicador logado.
 *
 * Funcionalidades:
 * 1. Lista designações futuras (PROPOSTA / DESIGNADA) do publicador logado
 * 2. Por parte: exibe título, função, status, data e modalidade
 * 3. Copiar S-89 para clipboard (botão por parte)
 * 4. Confirmar ou Recusar a parte diretamente (sem sair do modal)
 * 5. Abrir portal de disponibilidade em nova aba
 * 6. [ADMIN ONLY] Copiar link do portal de disponibilidade para clipboard
 */

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { copyS89ToClipboard } from '../services/s89Generator';
import { getTodayWeekIdLocal } from '../utils/dateUtils';
import type { WorkbookPart, Publisher } from '../types';
import type { AvailabilityToken } from './PublisherAvailabilityPortal';

// ── types ──────────────────────────────────────────────────────────────────

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** All loaded workbook parts — modal filters internally. */
    parts: WorkbookPart[];
    publishers: Publisher[];
    weekOrder: string[];
}

type ConfirmationStatus = 'confirmed' | 'refused';

// ── constants ──────────────────────────────────────────────────────────────

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

// ── helpers ────────────────────────────────────────────────────────────────

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

// ── component ──────────────────────────────────────────────────────────────

export function MyAssignmentsModal({ isOpen, onClose, parts, publishers, weekOrder }: Props) {
    const { profile, isAdmin } = useAuth();

    // Per-part confirmation status (pre-loaded from DB on open)
    const [confirmStatuses, setConfirmStatuses] = useState<Record<string, ConfirmationStatus>>({});

    // Which part is currently submitting a confirm/refuse
    const [submittingId, setSubmittingId] = useState<string | null>(null);

    // Which part is in "refuse mode" (shows inline reason textarea)
    const [refusingPartId, setRefusingPartId] = useState<string | null>(null);
    const [refuseReason, setRefuseReason] = useState('');

    // S-89 per-part loading / copied flash
    const [s89LoadingId, setS89LoadingId] = useState<string | null>(null);
    const [s89CopiedId, setS89CopiedId] = useState<string | null>(null);

    // Portal link (admin-only)
    const [copyingLink, setCopyingLink] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);

    // Availability portal link opening
    const [availabilityLoading, setAvailabilityLoading] = useState(false);

    // Admin: publisher selected to view (when admin has no own publisher_id)
    const [selectedPubId, setSelectedPubId] = useState('');

    // ── derived data ──────────────────────────────────────────────────────

    const todayWeekId = useMemo(() => getTodayWeekIdLocal(), []);

    // Effective publisher: own (regular user / admin with publisher_id) or admin-selected
    const effectivePubId: string | null =
        profile?.publisher_id ?? (isAdmin && selectedPubId ? selectedPubId : null);

    const myParts = useMemo(() => {
        if (!effectivePubId) return [];
        return parts.filter(
            p =>
                p.resolvedPublisherId === effectivePubId &&
                p.weekId >= todayWeekId &&
                (p.status === 'PROPOSTA' || p.status === 'DESIGNADA') &&
                !p.isChairmanDerived
        );
    }, [parts, effectivePubId, todayWeekId]);

    const grouped = useMemo(() => {
        const map: Record<string, WorkbookPart[]> = {};
        for (const p of myParts) {
            if (!map[p.weekId]) map[p.weekId] = [];
            map[p.weekId].push(p);
        }
        return weekOrder
            .filter(wid => map[wid])
            .map(wid => ({ weekId: wid, weekDisplay: map[wid][0].weekDisplay, parts: map[wid] }));
    }, [myParts, weekOrder]);

    const publisherName = effectivePubId
        ? (publishers.find(p => p.id === effectivePubId)?.name ?? 'Publicador')
        : (profile?.full_name ?? 'Publicador');

    // ── effects ───────────────────────────────────────────────────────────

    // Load existing confirmation statuses from DB when modal opens
    useEffect(() => {
        setConfirmStatuses({});
        if (!isOpen || !effectivePubId || myParts.length === 0) return;
        const uniqueWeeks = [...new Set(myParts.map(p => p.weekId))];
        Promise.all(
            uniqueWeeks.map(wid =>
                supabase
                    .rpc('get_portal_responses_for_week', { p_week_id: wid })
                    .then(({ data }) => data || [])
                    .catch(() => [])
            )
        ).then(results => {
            const map: Record<string, ConfirmationStatus> = {};
            (results.flat() as { part_id: string; response: string }[]).forEach(row => {
                const resp = (row.response || '').toLowerCase();
                if (resp === 'confirmed') map[row.part_id] = 'confirmed';
                else if (resp === 'refused') map[row.part_id] = 'refused';
            });
            setConfirmStatuses(map);
        });
    }, [isOpen, effectivePubId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Reset refuse state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setRefusingPartId(null);
            setRefuseReason('');
            setLinkCopied(false);
            setS89CopiedId(null);
            setSelectedPubId('');
        }
    }, [isOpen]);

    // ── S-89 helpers ──────────────────────────────────────────────────────

    const resolveS89CardParams = (part: WorkbookPart) => {
        const weekPartsForPart = parts.filter(p => p.weekId === part.weekId);
        const isAjudante = part.funcao === 'Ajudante';
        const currentPartNumber = extractPartNumber(part.tituloParte || part.tipoParte || '');
        let partForPdf: WorkbookPart = part;
        let assistantName: string | undefined;

        if (isAjudante) {
            const titular = weekPartsForPart.find(p => {
                const pNum = extractPartNumber(p.tituloParte || p.tipoParte || '');
                return pNum === currentPartNumber && p.funcao === 'Titular' && p.id !== part.id;
            });
            if (titular) {
                partForPdf = titular;
                assistantName = part.resolvedPublisherName || part.rawPublisherName;
            }
        } else {
            const assistant = weekPartsForPart.find(p => {
                const pNum = extractPartNumber(p.tituloParte || p.tipoParte || '');
                return pNum === currentPartNumber && p.funcao === 'Ajudante' && p.id !== part.id;
            });
            assistantName = assistant?.resolvedPublisherName || assistant?.rawPublisherName;
        }

        const pType = (part.tipoParte || '').toLowerCase();
        const pSection = (part.section || '').toLowerCase();
        const isStudent =
            pSection.includes('ministério') ||
            pSection.includes('ministerio') ||
            pType.includes('leitura') ||
            pType.includes('conversa') ||
            pType.includes('revisita') ||
            pType.includes('estudo');

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
                setTimeout(
                    () => setS89CopiedId(prev => (prev === part.id ? null : prev)),
                    2500
                );
            } else {
                alert('Não foi possível copiar o S-89. Verifique as permissões do navegador.');
            }
        } catch (err) {
            console.error('[MyAssignmentsModal] Erro ao copiar S-89:', err);
            alert('Erro ao gerar S-89.');
        } finally {
            setS89LoadingId(null);
        }
    };

    // ── confirmation helpers ───────────────────────────────────────────────

    const handleConfirmOrRefuse = async (
        part: WorkbookPart,
        accept: boolean,
        reason?: string
    ) => {
        if (!effectivePubId) return;
        if (submittingId) return;
        if (!accept && !reason?.trim()) {
            // Safety: caller should already prevent this via disabled state
            alert('Por favor, informe o motivo da recusa.');
            return;
        }

        setSubmittingId(part.id);
        try {
            // Step 1: get/create confirmation token
            const { data: tokenData, error: tokenError } = await supabase.rpc(
                'create_confirmation_portal_token',
                { p_part_id: part.id, p_publisher_id: effectivePubId }
            );
            if (tokenError) throw tokenError;

            const tokenResult = (
                tokenData && typeof tokenData === 'object' && !Array.isArray(tokenData)
                    ? tokenData
                    : {}
            ) as { success?: boolean; token?: string; error?: string };

            if (!tokenResult.success || !tokenResult.token) {
                throw new Error(tokenResult.error || 'Token não criado');
            }

            // Step 2: submit response
            const { data: submitData, error: submitError } = await supabase.rpc(
                'submit_confirmation_portal_response',
                {
                    p_part_id: part.id,
                    p_publisher_id: effectivePubId,
                    p_token: tokenResult.token,
                    p_accept: accept,
                    p_reason: accept ? null : (reason?.trim() || null),
                }
            );
            if (submitError) throw submitError;

            const result = (
                submitData && typeof submitData === 'object' && !Array.isArray(submitData)
                    ? submitData
                    : {}
            ) as { success?: boolean; error?: string };

            if (!result.success) throw new Error(result.error || 'Falha ao registrar resposta');

            setConfirmStatuses(prev => ({
                ...prev,
                [part.id]: accept ? 'confirmed' : 'refused',
            }));
            setRefusingPartId(null);
            setRefuseReason('');
        } catch (err) {
            console.error('[MyAssignmentsModal] Erro ao confirmar/recusar:', err);
            alert('Erro ao processar sua resposta. Tente novamente.');
        } finally {
            setSubmittingId(null);
        }
    };

    // ── availability token helpers ────────────────────────────────────────

    const getOrCreateAvailabilityToken = async (): Promise<string | null> => {
        const pubId = effectivePubId;
        if (!pubId) return null;
        try {
            const tokens = await api.getSetting<AvailabilityToken[]>('availability_tokens', []);
            let token = tokens.find(t => t.publisherId === pubId && t.active);
            if (!token) {
                const arr = new Uint8Array(18);
                crypto.getRandomValues(arr);
                const newTok: AvailabilityToken = {
                    token: Array.from(arr, b => b.toString(16).padStart(2, '0')).join(''),
                    publisherId: pubId,
                    publisherName:
                        publishers.find(p => p.id === pubId)?.name || '',
                    createdAt: new Date().toISOString(),
                    createdBy: 'my-assignments-modal',
                    active: true,
                };
                await api.setSetting('availability_tokens', [...tokens, newTok]);
                token = newTok;
            }
            return token.token;
        } catch {
            return null;
        }
    };

    /** [ADMIN ONLY] Copy availability portal link to clipboard. */
    const handleCopyPortalLink = async () => {
        setCopyingLink(true);
        try {
            const tok = await getOrCreateAvailabilityToken();
            if (!tok) {
                alert('Erro ao gerar token de disponibilidade.');
                return;
            }
            const base = window.location.origin + window.location.pathname;
            const url = `${base}?portal=availability&token=${tok}`;
            await navigator.clipboard.writeText(url);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 3000);
        } catch (err) {
            console.error('[MyAssignmentsModal] Erro ao copiar link:', err);
            alert('Erro ao copiar link. Verifique as permissões do navegador.');
        } finally {
            setCopyingLink(false);
        }
    };

    /** Open availability portal in new tab. */
    const handleOpenAvailability = async () => {
        setAvailabilityLoading(true);
        try {
            const tok = await getOrCreateAvailabilityToken();
            if (!tok) {
                alert('Erro ao gerar token de disponibilidade.');
                return;
            }
            const base = window.location.origin + window.location.pathname;
            window.open(`${base}?portal=availability&token=${tok}`, '_blank', 'noopener');
        } catch (err) {
            console.error('[MyAssignmentsModal] Erro ao abrir disponibilidade:', err);
        } finally {
            setAvailabilityLoading(false);
        }
    };

    // ── render ────────────────────────────────────────────────────────────

    if (!isOpen) return null;

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.65)',
                backdropFilter: 'blur(3px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: '16px',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: '#111827',
                    border: '1px solid #1F2937',
                    borderRadius: '16px',
                    width: '100%',
                    maxWidth: '620px',
                    maxHeight: '88vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)',
                    overflow: 'hidden',
                }}
            >
                {/* ── Header ──────────────────────────────────────────────── */}
                <div
                    style={{
                        padding: '18px 20px 14px',
                        borderBottom: '1px solid #1F2937',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexShrink: 0,
                        gap: '12px',
                    }}
                >
                    <div>
                        <div
                            style={{
                                fontSize: '17px',
                                fontWeight: '700',
                                color: '#F1F5F9',
                                lineHeight: 1.2,
                            }}
                        >
                            Minhas Designações
                        </div>
                        <div style={{ fontSize: '13px', color: '#94A3B8', marginTop: '3px' }}>
                            {publisherName}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                        {/* [ADMIN ONLY] Copy portal link */}
                        {isAdmin && effectivePubId && (
                            <button
                                onClick={handleCopyPortalLink}
                                disabled={copyingLink}
                                title="Copiar link do portal de disponibilidade (admin)"
                                style={{
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    background: linkCopied ? '#065F46' : '#1E293B',
                                    border: '1px solid ' + (linkCopied ? '#10B981' : '#334155'),
                                    color: linkCopied ? '#6EE7B7' : '#94A3B8',
                                    fontSize: '12px',
                                    cursor: copyingLink ? 'wait' : 'pointer',
                                    display: 'flex',
                                    gap: '5px',
                                    alignItems: 'center',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {linkCopied ? '✓ Copiado' : '🔗 Copiar link'}
                            </button>
                        )}

                        {/* Close */}
                        <button
                            onClick={onClose}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#94A3B8',
                                fontSize: '22px',
                                cursor: 'pointer',
                                lineHeight: 1,
                                padding: '2px 6px',
                            }}
                        >
                            ×
                        </button>
                    </div>
                </div>

                {/* ── Body ────────────────────────────────────────────────── */}
                <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px 16px' }}>
                {/* Admin publisher selector */}
                {isAdmin && !profile?.publisher_id && (
                    <div style={{ paddingBottom: '14px', borderBottom: '1px solid #1E293B', marginBottom: '12px' }}>
                        <label style={{ fontSize: '12px', color: '#64748B', display: 'block', marginBottom: '6px' }}>
                            Visualizar designações de:
                        </label>
                        <select
                            value={selectedPubId}
                            onChange={e => setSelectedPubId(e.target.value)}
                            style={{
                                width: '100%',
                                background: '#1E293B',
                                border: '1px solid #334155',
                                borderRadius: '8px',
                                color: '#E2E8F0',
                                padding: '8px 10px',
                                fontSize: '13px',
                                cursor: 'pointer',
                            }}
                        >
                            <option value="">— selecione um publicador —</option>
                            {[...publishers]
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map(pub => (
                                    <option key={pub.id} value={pub.id}>{pub.name}</option>
                                ))}
                        </select>
                    </div>
                )}
                {!effectivePubId ? (
                    <div
                        style={{ padding: '40px 32px', textAlign: 'center', color: '#64748B' }}
                    >
                        <div style={{ fontSize: '36px', marginBottom: '12px' }}>
                            {isAdmin ? '🔍' : '👤'}
                        </div>
                        <p style={{ margin: 0 }}>
                            {isAdmin
                                ? 'Selecione um publicador para ver suas designações.'
                                : 'Sua conta não está vinculada a um publicador.'}
                        </p>
                    </div>
                    ) : grouped.length === 0 ? (
                        <div
                            style={{ padding: '40px 32px', textAlign: 'center', color: '#64748B' }}
                        >
                            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📅</div>
                            <p style={{ margin: 0 }}>Nenhuma designação futura encontrada.</p>
                            <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#475569' }}>
                                Partes com status Proposta ou Designada aparecerão aqui.
                            </p>
                        </div>
                    ) : (
                        grouped.map(({ weekId, weekDisplay, parts: wParts }) => (
                            <div key={weekId} style={{ marginBottom: '16px' }}>
                                {/* Week divider */}
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        marginBottom: '10px',
                                    }}
                                >
                                    <div
                                        style={{ height: '1px', flex: 1, background: '#1E293B' }}
                                    />
                                    <span
                                        style={{
                                            fontSize: '11px',
                                            fontWeight: '700',
                                            color: '#64748B',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.06em',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        semana {weekDisplay || weekId}
                                    </span>
                                    <div
                                        style={{ height: '1px', flex: 1, background: '#1E293B' }}
                                    />
                                </div>

                                {/* Part cards */}
                                {wParts.map(part => {
                                    const confirmStatus = confirmStatuses[part.id];
                                    const isRefusing = refusingPartId === part.id;
                                    const isSubmitting = submittingId === part.id;
                                    const isS89Loading = s89LoadingId === part.id;
                                    const isS89Copied = s89CopiedId === part.id;

                                    const funcaoColor =
                                        part.funcao === 'Ajudante' ? '#8B5CF6' : '#3B82F6';
                                    const partTitle =
                                        part.tituloParte || part.tipoParte || '—';
                                    const statusColor =
                                        STATUS_COLOR[part.status] || '#6B7280';

                                    return (
                                        <div
                                            key={part.id}
                                            style={{
                                                background: '#1E293B',
                                                border: '1px solid #334155',
                                                borderRadius: '12px',
                                                padding: '14px 16px',
                                                marginBottom: '10px',
                                            }}
                                        >
                                            {/* Row 1: title + badges */}
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'flex-start',
                                                    gap: '8px',
                                                    flexWrap: 'wrap',
                                                    marginBottom: '6px',
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        color: '#E2E8F0',
                                                        fontWeight: '600',
                                                        fontSize: '14px',
                                                        flex: 1,
                                                        minWidth: 0,
                                                        wordBreak: 'break-word',
                                                    }}
                                                >
                                                    {partTitle}
                                                </span>
                                                <span
                                                    style={{
                                                        background: funcaoColor + '22',
                                                        color: funcaoColor,
                                                        border: '1px solid ' + funcaoColor + '44',
                                                        borderRadius: '6px',
                                                        padding: '2px 7px',
                                                        fontSize: '11px',
                                                        fontWeight: '600',
                                                        flexShrink: 0,
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {part.funcao}
                                                </span>
                                                <span
                                                    style={{
                                                        background: statusColor + '22',
                                                        color: statusColor,
                                                        border: '1px solid ' + statusColor + '44',
                                                        borderRadius: '6px',
                                                        padding: '2px 7px',
                                                        fontSize: '11px',
                                                        fontWeight: '600',
                                                        flexShrink: 0,
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {STATUS_LABEL[part.status] || part.status}
                                                </span>
                                            </div>

                                            {/* Row 2: meta */}
                                            <div
                                                style={{
                                                    fontSize: '12px',
                                                    color: '#64748B',
                                                    marginBottom: '12px',
                                                    display: 'flex',
                                                    gap: '6px',
                                                    flexWrap: 'wrap',
                                                }}
                                            >
                                                {part.date ? (
                                                    <span>{formatDateBR(part.date)}</span>
                                                ) : (
                                                    <span>{weekId}</span>
                                                )}
                                                {part.section && (
                                                    <>
                                                        <span style={{ color: '#334155' }}>·</span>
                                                        <span>{part.section}</span>
                                                    </>
                                                )}
                                                {part.horaInicio && (
                                                    <>
                                                        <span style={{ color: '#334155' }}>·</span>
                                                        <span>{part.horaInicio}</span>
                                                    </>
                                                )}
                                            </div>

                                            {/* Row 3: actions */}
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    gap: '8px',
                                                    flexWrap: 'wrap',
                                                    alignItems: 'center',
                                                }}
                                            >
                                                {/* S-89 */}
                                                <button
                                                    onClick={() => handleCopyS89(part)}
                                                    disabled={!!s89LoadingId}
                                                    style={{
                                                        padding: '6px 10px',
                                                        borderRadius: '8px',
                                                        background: isS89Copied ? '#064E3B' : '#0F172A',
                                                        border:
                                                            '1px solid ' +
                                                            (isS89Copied ? '#10B981' : '#334155'),
                                                        color: isS89Copied ? '#6EE7B7' : '#94A3B8',
                                                        fontSize: '12px',
                                                        cursor: isS89Loading ? 'wait' : 'pointer',
                                                        display: 'flex',
                                                        gap: '4px',
                                                        alignItems: 'center',
                                                        transition: 'all 0.2s',
                                                    }}
                                                >
                                                    {isS89Loading ? '⏳' : isS89Copied ? '✓' : '📋'}{' '}
                                                    {isS89Copied ? 'S-89 copiado' : 'Copiar S-89'}
                                                </button>

                                                {/* Confirmation status / actions */}
                                                {confirmStatus === 'confirmed' ? (
                                                    <span
                                                        style={{
                                                            color: '#34D399',
                                                            fontSize: '12px',
                                                            fontWeight: '600',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                        }}
                                                    >
                                                        ✓ Confirmado
                                                    </span>
                                                ) : confirmStatus === 'refused' ? (
                                                    <span
                                                        style={{
                                                            color: '#F87171',
                                                            fontSize: '12px',
                                                            fontWeight: '600',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                        }}
                                                    >
                                                        ✗ Recusado
                                                    </span>
                                                ) : (
                                                    <>
                                                        {/* Confirm button */}
                                                        <button
                                                            onClick={() =>
                                                                handleConfirmOrRefuse(part, true)
                                                            }
                                                            disabled={isSubmitting}
                                                            style={{
                                                                padding: '6px 12px',
                                                                borderRadius: '8px',
                                                                background: '#064E3B',
                                                                border: '1px solid #065F46',
                                                                color: '#6EE7B7',
                                                                fontSize: '12px',
                                                                fontWeight: '600',
                                                                cursor: isSubmitting
                                                                    ? 'wait'
                                                                    : 'pointer',
                                                            }}
                                                        >
                                                            {isSubmitting ? '⏳' : '✓ Confirmar'}
                                                        </button>

                                                        {/* Refuse button / inline refuse form */}
                                                        {!isRefusing ? (
                                                            <button
                                                                onClick={() => {
                                                                    setRefusingPartId(part.id);
                                                                    setRefuseReason('');
                                                                }}
                                                                disabled={isSubmitting}
                                                                style={{
                                                                    padding: '6px 12px',
                                                                    borderRadius: '8px',
                                                                    background: '#1E293B',
                                                                    border: '1px solid #475569',
                                                                    color: '#94A3B8',
                                                                    fontSize: '12px',
                                                                    fontWeight: '600',
                                                                    cursor: 'pointer',
                                                                }}
                                                            >
                                                                ✗ Recusar
                                                            </button>
                                                        ) : (
                                                            <div style={{ width: '100%', marginTop: '4px' }}>
                                                                <textarea
                                                                    value={refuseReason}
                                                                    onChange={e =>
                                                                        setRefuseReason(e.target.value)
                                                                    }
                                                                    placeholder="Motivo da recusa (obrigatório)…"
                                                                    rows={2}
                                                                    style={{
                                                                        width: '100%',
                                                                        boxSizing: 'border-box',
                                                                        background: '#0F172A',
                                                                        border: '1px solid #475569',
                                                                        borderRadius: '8px',
                                                                        color: '#E2E8F0',
                                                                        padding: '8px 10px',
                                                                        fontSize: '12px',
                                                                        resize: 'vertical',
                                                                        fontFamily: 'inherit',
                                                                    }}
                                                                />
                                                                <div
                                                                    style={{
                                                                        display: 'flex',
                                                                        gap: '8px',
                                                                        marginTop: '6px',
                                                                    }}
                                                                >
                                                                    <button
                                                                        onClick={() =>
                                                                            handleConfirmOrRefuse(
                                                                                part,
                                                                                false,
                                                                                refuseReason
                                                                            )
                                                                        }
                                                                        disabled={
                                                                            isSubmitting ||
                                                                            !refuseReason.trim()
                                                                        }
                                                                        style={{
                                                                            padding: '6px 12px',
                                                                            borderRadius: '8px',
                                                                            background: refuseReason.trim()
                                                                                ? '#7F1D1D'
                                                                                : '#1E293B',
                                                                            border: '1px solid #991B1B',
                                                                            color: refuseReason.trim()
                                                                                ? '#FCA5A5'
                                                                                : '#64748B',
                                                                            fontSize: '12px',
                                                                            fontWeight: '600',
                                                                            cursor:
                                                                                !refuseReason.trim() ||
                                                                                isSubmitting
                                                                                    ? 'not-allowed'
                                                                                    : 'pointer',
                                                                        }}
                                                                    >
                                                                        {isSubmitting
                                                                            ? '⏳'
                                                                            : 'Confirmar recusa'}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            setRefusingPartId(null);
                                                                            setRefuseReason('');
                                                                        }}
                                                                        style={{
                                                                            padding: '6px 12px',
                                                                            borderRadius: '8px',
                                                                            background: 'none',
                                                                            border: '1px solid #334155',
                                                                            color: '#64748B',
                                                                            fontSize: '12px',
                                                                            cursor: 'pointer',
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
                                        </div>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>

                {/* ── Footer: availability ─────────────────────────────────── */}
                {effectivePubId && (
                    <div
                        style={{
                            borderTop: '1px solid #1F2937',
                            padding: '12px 16px',
                            display: 'flex',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        <button
                            onClick={handleOpenAvailability}
                            disabled={availabilityLoading}
                            style={{
                                padding: '8px 18px',
                                borderRadius: '10px',
                                background: '#1E293B',
                                border: '1px solid #334155',
                                color: '#93C5FD',
                                fontSize: '13px',
                                fontWeight: '600',
                                cursor: availabilityLoading ? 'wait' : 'pointer',
                                display: 'flex',
                                gap: '6px',
                                alignItems: 'center',
                                transition: 'all 0.2s',
                            }}
                        >
                            {availabilityLoading ? '⏳' : '📅'} Atualizar disponibilidade
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
