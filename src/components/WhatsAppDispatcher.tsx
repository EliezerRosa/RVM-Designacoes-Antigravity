/**
 * WhatsAppDispatcher — modal para disparo de Anúncio/Notificação via WhatsApp.
 *
 * Fluxo (Fase D):
 *   1. Pré-condição: evento APROVADO + caller é CS (gating UI; RPC re-valida).
 *   2. Compõe mensagem a partir de event.theme/content/reference/links.
 *   3. Lista publicadores com phone (+ filtro por grupo: todos / anciãos+SMs / publicadores).
 *   4. Para cada destinatário escolhido: abre `https://api.whatsapp.com/send`
 *      em nova aba E registra `log_whatsapp_dispatch` (1 por clique — evita
 *      bloqueio de pop-up por múltiplas abas).
 *   5. Carrega histórico de envios já registrados (marca destinatário como
 *      "✓ enviado" se hash igual + recipient já consta).
 *
 * Não persiste o texto integral, apenas hash SHA-256 (truncado 16 hex).
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
    announcementService,
    type WhatsAppDispatchEntry,
} from '../services/announcementService';
import type { Publisher, SpecialEvent } from '../types';

interface Props {
    event: SpecialEvent;
    publishers: Publisher[];
    /** Identidade textual usada na auditoria. */
    actorLabel: string;
    onClose: () => void;
}

type GroupFilter = 'all' | 'elders_sms' | 'publicators';

/** SHA-256 hex truncado a 16 chars. */
async function hashMessage(msg: string): Promise<string> {
    const enc = new TextEncoder().encode(msg);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    const hex = Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    return hex.slice(0, 16);
}

/** Mascara telefone preservando últimos 4 dígitos: +55 11 ****-1234 */
function maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) return '****';
    const tail = digits.slice(-4);
    return `***${tail}`;
}

/** Sanitiza/normaliza telefone para wa.me (BR default). */
function normalizePhone(phone: string): string {
    let cleaned = (phone || '').replace(/\D/g, '');
    if (cleaned && cleaned.length <= 11 && !cleaned.startsWith('55')) {
        cleaned = '55' + cleaned;
    }
    return cleaned;
}

/** Constrói URL WhatsApp (api.whatsapp.com — funciona mobile + desktop). */
function buildWhatsAppUrl(phone: string, message: string): string {
    const cleaned = normalizePhone(phone);
    const encoded = encodeURIComponent(message);
    return `https://api.whatsapp.com/send?${cleaned ? `phone=${cleaned}&` : ''}text=${encoded}`;
}

/** Compõe corpo da mensagem a partir do evento. */
function composeMessage(event: SpecialEvent): string {
    const lines: string[] = [];
    if (event.theme) lines.push(`📢 *${event.theme}*`);
    if (event.content) {
        lines.push('');
        lines.push(event.content.trim());
    }
    if (event.reference) {
        lines.push('');
        lines.push(`_${event.reference}_`);
    }
    if (event.links && event.links.length > 0) {
        lines.push('');
        lines.push(...event.links);
    }
    return lines.join('\n');
}

/** Categoriza publisher para o filtro. */
function isElderOrSm(p: Publisher): boolean {
    return p.condition === 'Anciao' || p.condition === 'Ancião' || p.condition === 'Servo Ministerial';
}

interface RecipientRow {
    publisherId: string;
    name: string;
    phone: string;
    role: string;
    funcao: string | null;
    alreadyDispatched: boolean;
}

export function WhatsAppDispatcher({ event, publishers, actorLabel, onClose }: Props) {
    const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
    const [search, setSearch] = useState('');
    const [dispatches, setDispatches] = useState<WhatsAppDispatchEntry[]>([]);
    const [loadingLog, setLoadingLog] = useState(true);
    const [messageHash, setMessageHash] = useState<string>('');
    const [dispatchingId, setDispatchingId] = useState<string | null>(null);
    const [customPhone, setCustomPhone] = useState('');
    const [customLabel, setCustomLabel] = useState('');

    const message = useMemo(() => composeMessage(event), [event]);

    useEffect(() => {
        let alive = true;
        void hashMessage(message).then(h => { if (alive) setMessageHash(h); });
        return () => { alive = false; };
    }, [message]);

    const refreshLog = useCallback(async () => {
        try {
            const log = await announcementService.getDispatchLog(event.id);
            setDispatches(log);
        } catch (err) {
            console.warn('[WhatsAppDispatcher] log error:', err);
        } finally {
            setLoadingLog(false);
        }
    }, [event.id]);

    useEffect(() => { void refreshLog(); }, [refreshLog]);

    const recipients: RecipientRow[] = useMemo(() => {
        const dispatchedSet = new Set(
            dispatches
                .filter(d => !messageHash || !d.messageHash || d.messageHash === messageHash)
                .map(d => d.recipientPublisherId)
                .filter((v): v is string => !!v),
        );
        const term = search.trim().toLowerCase();
        return publishers
            .filter(p => p.phone && p.phone.replace(/\D/g, '').length >= 8)
            .filter(p => {
                if (groupFilter === 'elders_sms') return isElderOrSm(p);
                if (groupFilter === 'publicators') return !isElderOrSm(p);
                return true;
            })
            .filter(p => !term || p.name.toLowerCase().includes(term))
            .map(p => ({
                publisherId: p.id,
                name: p.name,
                phone: p.phone,
                role: p.condition,
                funcao: p.funcao,
                alreadyDispatched: dispatchedSet.has(p.id),
            }))
            .sort((a, b) => Number(a.alreadyDispatched) - Number(b.alreadyDispatched) || a.name.localeCompare(b.name, 'pt-BR'));
    }, [publishers, dispatches, messageHash, groupFilter, search]);

    const handleDispatch = useCallback(async (row: RecipientRow) => {
        if (dispatchingId) return;
        setDispatchingId(row.publisherId);
        try {
            // 1. Abrir wa.me em nova aba (precisa ser dentro do gesto do click).
            window.open(buildWhatsAppUrl(row.phone, message), '_blank', 'noopener,noreferrer');
            // 2. Registrar dispatch (não bloqueia se a aba já abriu).
            await announcementService.logWhatsAppDispatch({
                eventId: event.id,
                actorLabel,
                recipientRole: row.funcao || row.role || 'publicador',
                recipientPublisherId: row.publisherId,
                recipientLabel: row.name,
                phoneMasked: maskPhone(row.phone),
                messageHash,
                metadata: { via: 'wa.me-direct' },
            });
            await refreshLog();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Falha ao registrar envio';
            alert(`Aviso: a aba do WhatsApp foi aberta, mas o registro falhou.\n\n${msg}`);
        } finally {
            setDispatchingId(null);
        }
    }, [dispatchingId, event.id, message, messageHash, actorLabel, refreshLog]);

    const handleDispatchCustom = useCallback(async () => {
        const phone = customPhone.trim();
        const label = customLabel.trim() || `Avulso ${maskPhone(phone)}`;
        if (!phone || phone.replace(/\D/g, '').length < 8) {
            alert('Informe um telefone válido (com DDD).');
            return;
        }
        if (dispatchingId) return;
        setDispatchingId('__custom__');
        try {
            window.open(buildWhatsAppUrl(phone, message), '_blank', 'noopener,noreferrer');
            await announcementService.logWhatsAppDispatch({
                eventId: event.id,
                actorLabel,
                recipientRole: 'avulso',
                recipientPublisherId: null,
                recipientLabel: label,
                phoneMasked: maskPhone(phone),
                messageHash,
                metadata: { via: 'wa.me-custom' },
            });
            setCustomPhone('');
            setCustomLabel('');
            await refreshLog();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Falha ao registrar';
            alert(`Aviso: aba aberta, registro falhou.\n${msg}`);
        } finally {
            setDispatchingId(null);
        }
    }, [customPhone, customLabel, dispatchingId, event.id, message, messageHash, actorLabel, refreshLog]);

    const dispatchedCount = recipients.filter(r => r.alreadyDispatched).length;

    return (
        <div
            role="dialog"
            aria-label="Disparar via WhatsApp"
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: '#fff', borderRadius: '12px', maxWidth: '720px', width: '100%',
                    maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '14px 18px', background: '#16A34A', color: '#fff',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <div>
                        <div style={{ fontSize: '14px', fontWeight: 700 }}>📱 Disparar via WhatsApp</div>
                        <div style={{ fontSize: '11px', opacity: 0.9 }}>
                            {event.theme || 'Anúncio'} · {recipients.length} contato(s) · {dispatchedCount} já enviado(s)
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ border: 'none', background: 'transparent', color: '#fff', fontSize: '20px', cursor: 'pointer' }}
                        aria-label="Fechar"
                    >×</button>
                </div>

                {/* Preview */}
                <div style={{ padding: '12px 18px', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB' }}>
                    <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px', fontWeight: 600 }}>
                        PRÉ-VISUALIZAÇÃO ({message.length} car · hash {messageHash || '...'})
                    </div>
                    <pre style={{
                        margin: 0, padding: '8px 10px', background: '#fff', border: '1px solid #E5E7EB',
                        borderRadius: '6px', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        maxHeight: '120px', overflow: 'auto', fontFamily: 'inherit',
                    }}>{message}</pre>
                </div>

                {/* Filtros */}
                <div style={{ padding: '10px 18px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #F3F4F6' }}>
                    <select
                        value={groupFilter}
                        onChange={e => setGroupFilter(e.target.value as GroupFilter)}
                        style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12px' }}
                    >
                        <option value="all">Todos com WhatsApp</option>
                        <option value="elders_sms">Anciãos & SMs</option>
                        <option value="publicators">Publicadores</option>
                    </select>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por nome..."
                        style={{ flex: 1, minWidth: '160px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12px' }}
                    />
                </div>

                {/* Lista */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                    {loadingLog ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#6B7280', fontSize: '13px' }}>
                            Carregando histórico de envios...
                        </div>
                    ) : recipients.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px', fontStyle: 'italic' }}>
                            Nenhum publicador com WhatsApp encontrado para este filtro.
                        </div>
                    ) : (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                            {recipients.map(r => (
                                <li
                                    key={r.publisherId}
                                    style={{
                                        padding: '8px 18px', borderBottom: '1px solid #F3F4F6',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        background: r.alreadyDispatched ? '#F0FDF4' : '#fff',
                                    }}
                                >
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1F2937' }}>
                                            {r.alreadyDispatched && '✓ '}{r.name}
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#6B7280' }}>
                                            {r.role}{r.funcao ? ` · ${r.funcao}` : ''} · {r.phone}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDispatch(r)}
                                        disabled={dispatchingId === r.publisherId}
                                        style={{
                                            background: r.alreadyDispatched ? '#6B7280' : '#16A34A',
                                            color: '#fff', border: 'none', borderRadius: '6px',
                                            padding: '6px 10px', fontSize: '12px', cursor: 'pointer',
                                            opacity: dispatchingId === r.publisherId ? 0.6 : 1,
                                        }}
                                        title={r.alreadyDispatched ? 'Reenviar' : 'Abrir WhatsApp e registrar'}
                                    >
                                        {dispatchingId === r.publisherId ? '...' : (r.alreadyDispatched ? '↻ Reenviar' : '📱 Abrir & Registrar')}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Avulso */}
                <div style={{ padding: '10px 18px', borderTop: '1px solid #E5E7EB', background: '#FAFAFA' }}>
                    <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px', fontWeight: 600 }}>
                        ENVIO AVULSO (sem cadastro)
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                            type="tel"
                            value={customPhone}
                            onChange={e => setCustomPhone(e.target.value)}
                            placeholder="DDD + número"
                            style={{ flex: 1, minWidth: '140px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12px' }}
                        />
                        <input
                            type="text"
                            value={customLabel}
                            onChange={e => setCustomLabel(e.target.value)}
                            placeholder="Identificação (opcional)"
                            style={{ flex: 1, minWidth: '140px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12px' }}
                        />
                        <button
                            onClick={handleDispatchCustom}
                            disabled={dispatchingId === '__custom__'}
                            style={{
                                background: '#0EA5E9', color: '#fff', border: 'none',
                                borderRadius: '6px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer',
                                opacity: dispatchingId === '__custom__' ? 0.6 : 1,
                            }}
                        >
                            {dispatchingId === '__custom__' ? '...' : '📱 Enviar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
