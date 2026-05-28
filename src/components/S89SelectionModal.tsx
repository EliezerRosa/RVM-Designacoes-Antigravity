import { useState, useRef, useEffect } from 'react';

import type { WorkbookPart, Publisher } from '../types';

import { copyS89ToClipboard } from '../services/s89Generator';
import html2canvas from 'html2canvas';

import { communicationService } from '../services/communicationService';
import { api } from '../services/api';
import { supabase } from '../lib/supabase';
import type { AvailabilityToken } from './PublisherAvailabilityPortal';
import { AvailabilityChangesBanner } from './admin/AvailabilityChangesBanner';
import { ConfirmationRefusalsBanner } from './admin/ConfirmationRefusalsBanner';
import { usePublisherProfileNotifications } from '../hooks/usePublisherProfileNotifications';
import { ProfileChangeTooltipChip } from './admin/ProfileChangeTooltipChip';

/** Type for confirmation status per part (item 4). */
type PartConfirmationStatus = {
    response: 'accepted' | 'declined';
    respondedAt: string;
};

/** Send-history entry per part (item 1). */
type SendKind = 'inicial' | 'reconf' | 'substituicao';
type SendEntry = { sentAt: string; kind: SendKind };

const DEFAULT_MEETING_DAY_OF_WEEK = 4;
const S89_MEETING_DAY_SETTING_KEY = 's89_meeting_day_by_week';

function normalizeMeetingDayOfWeek(value?: number): number {
    if (typeof value === 'number' && value >= 0 && value <= 6) return value;
    return DEFAULT_MEETING_DAY_OF_WEEK;
}

interface S89SelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    weekParts: WorkbookPart[];
    weekId: string;
    publishers: Publisher[];
}

export function S89SelectionModal({ isOpen, onClose, weekParts, weekId, publishers }: S89SelectionModalProps) {
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
    const [processingReconfirmIds, setProcessingReconfirmIds] = useState<Set<string>>(new Set());
    const [isSharingS140, setIsSharingS140] = useState(false);
    const [isSharingStatus, setIsSharingStatus] = useState(false);
    const [s140HTML, setS140HTML] = useState<string>('');
    const [editingMessages, setEditingMessages] = useState<Record<string, string>>({});
    const [lastMessages, setLastMessages] = useState<Record<string, any>>({});
    /** Item 1: full per-part send history (most recent first). */
    const [sendHistory, setSendHistory] = useState<Record<string, SendEntry[]>>({});
    /** Item 4: confirmation statuses by part_id. */
    const [confirmationStatuses, setConfirmationStatuses] = useState<Record<string, PartConfirmationStatus>>({});
    const [availabilityTokens, setAvailabilityTokens] = useState<AvailabilityToken[]>([]);
    const [insertingAvailability, setInsertingAvailability] = useState<Set<string>>(new Set());
    /** Per-card flag: when true, message is rendered as substitution request. */
    const [substitutionIds, setSubstitutionIds] = useState<Set<string>>(new Set());
    /** Override do dia da reunião (apenas para a mensagem). 0=dom..6=sáb. Default=4 (qui). */
    const [meetingDayOfWeek, setMeetingDayOfWeek] = useState<number>(DEFAULT_MEETING_DAY_OF_WEEK);
    const { notifications: profileChangeNotifications } = usePublisherProfileNotifications();
    const s140Ref = useRef<HTMLDivElement>(null);
    const statusRef = useRef<HTMLDivElement>(null);


    // Helper function must be declared before use
    const extractPartNumber = (titulo: string): string => {
        const match = titulo?.match(/^(\d+)/);
        return match ? match[1] : '';
    };



    // Nova lógica: usar prepareS140UnifiedData para garantir agrupamento idêntico ao S-140 contextual
    const [validParts, setValidParts] = useState<any[]>([]);
    useEffect(() => {
        let mounted = true;
        async function prepareParts() {
            if (!weekParts || weekParts.length === 0) {
                setValidParts([]);
                return;
            }
            const { prepareS140UnifiedData } = await import('../services/s140GeneratorUnified');
            const weekData = await prepareS140UnifiedData(weekParts, publishers);

            // Helper: encontrar WorkbookPart original pelo ID do S140Part
            const findOriginal = (s140PartId?: string) =>
                weekParts.find(wp => wp.id === s140PartId);

            const cards = [];
            // Rastrear IDs já incluídos via S-140 para não duplicar
            const includedOriginalIds = new Set<string>();

            // Incluir Presidente explicitamente (S-140 o coloca no cabeçalho, não em parts)
            if (weekData.president) {
                const presidenteWp = weekParts.find(wp =>
                    (wp.tipoParte === 'Presidente' || wp.tipoParte === 'Presidente da Reunião') &&
                    wp.funcao === 'Titular'
                );
                if (presidenteWp && (presidenteWp.resolvedPublisherName || presidenteWp.rawPublisherName)) {
                    const presId = presidenteWp.id;
                    cards.push({
                        ...presidenteWp,
                        id: presId + '-titular',
                        resolvedPublisherName: presidenteWp.resolvedPublisherName || presidenteWp.rawPublisherName,
                        funcao: 'Titular',
                        tipoParte: presidenteWp.tipoParte,
                        title: `Presidente da Reunião`,
                    });
                    includedOriginalIds.add(presId);
                }
            }

            for (const part of weekData.parts || []) {
                const original = findOriginal(part.id);
                // Campos do WorkbookPart necessários para prepareS89Message / generateWhatsAppMessage
                const wpFields = original ? {
                    date: original.date,
                    weekId: original.weekId,
                    weekDisplay: original.weekDisplay,
                    tituloParte: original.tituloParte,
                    modalidade: original.modalidade,
                    status: original.status,
                    horaInicio: original.horaInicio,
                    descricaoParte: original.descricaoParte,
                    detalhesParte: original.detalhesParte,
                    duracao: original.duracao,
                    rawPublisherName: original.rawPublisherName,
                    resolvedPublisherId: original.resolvedPublisherId,
                    section: original.section,
                } : {};

                if (part.mainHallAssignee) {
                    // ID real do Titular = original.id (já é correto via findOriginal)
                    const titularRealId = original?.id || part.id;
                    cards.push({
                        ...part,
                        ...wpFields,
                        funcao: 'Titular',
                        resolvedPublisherName: part.mainHallAssignee,
                        tipoParte: part.tipoParte,
                        id: titularRealId + '-titular',
                    });
                    if (titularRealId) includedOriginalIds.add(titularRealId);
                }
                if (part.mainHallAssistant) {
                    // CORREÇÃO CRÍTICA: o S140 agrupa Titular e Ajudante num mesmo slot (part.id = ID do Titular).
                    // Precisamos buscar o ID real do Ajudante no weekParts.
                    //
                    // Estratégia (mais robusta que match por nome):
                    //   1) Por número de sequência do título (ex.: "4. Iniciando conversas" ↔ "4. Iniciando conversas - Ajudante")
                    //      — funciona mesmo quando resolvedPublisherName do Ajudante está NULL no BD
                    //   2) Fallback: match por nome (resolvedPublisherName / rawPublisherName) — caso o título não dê seq
                    const titularTitulo = (original?.tituloParte || part.title || '') as string;
                    const titularSeq = extractPartNumber(titularTitulo);
                    let ajudanteWp = titularSeq
                        ? weekParts.find(wp =>
                            wp.funcao === 'Ajudante' &&
                            extractPartNumber(wp.tituloParte || wp.tipoParte || '') === titularSeq
                        )
                        : undefined;
                    if (!ajudanteWp) {
                        ajudanteWp = weekParts.find(wp =>
                            wp.funcao === 'Ajudante' &&
                            (wp.resolvedPublisherName === part.mainHallAssistant ||
                             wp.rawPublisherName === part.mainHallAssistant)
                        );
                    }
                    const ajudanteRealId = ajudanteWp?.id || part.id; // fallback = ID do slot se não encontrado
                    const ajudanteWpFields = ajudanteWp ? {
                        date: ajudanteWp.date,
                        weekId: ajudanteWp.weekId,
                        weekDisplay: ajudanteWp.weekDisplay,
                        tituloParte: ajudanteWp.tituloParte,
                        modalidade: ajudanteWp.modalidade,
                        status: ajudanteWp.status,
                        horaInicio: ajudanteWp.horaInicio,
                        descricaoParte: ajudanteWp.descricaoParte,
                        detalhesParte: ajudanteWp.detalhesParte,
                        duracao: ajudanteWp.duracao,
                        rawPublisherName: ajudanteWp.rawPublisherName,
                        resolvedPublisherId: ajudanteWp.resolvedPublisherId,
                        section: ajudanteWp.section,
                    } : wpFields;
                    cards.push({
                        ...part,
                        ...ajudanteWpFields,
                        funcao: 'Ajudante',
                        resolvedPublisherName: part.mainHallAssistant,
                        tipoParte: part.tipoParte,
                        id: ajudanteRealId + '-ajudante', // ID real do Ajudante + sufixo UI
                    });
                    if (ajudanteRealId) includedOriginalIds.add(ajudanteRealId);
                }
            }

            // Garantia de cobertura: incluir partes designadas/aprovadas do weekParts
            // que possam ter ficado de fora do S-140 (ex: partes respondidas, reconfirmações)
            const DESIGNATABLE_STATUSES = ['DESIGNADA', 'APROVADA', 'PROPOSTA', 'CONCLUIDA'];
            const HIDDEN_TYPES = ['Cântico', 'Cantico', 'Comentários Iniciais', 'Comentarios Iniciais',
                'Comentários Finais', 'Comentarios Finais', 'Elogios e Conselhos', 'Elogios e conselhos'];

            for (const wp of weekParts) {
                if (!DESIGNATABLE_STATUSES.includes(wp.status)) continue;
                if (HIDDEN_TYPES.some(h => wp.tipoParte?.includes(h))) continue;
                // Parte derivada do presidente: auto-atribuída ao mesmo publicador.
                // S-89 dessas partes não vai para o presidente — ele já recebe via
                // o cartão da própria designação "Presidente" (seq=1).
                if (wp.isChairmanDerived === true) continue;
                const name = wp.resolvedPublisherName || wp.rawPublisherName;
                if (!name) continue;
                // Já incluída via S-140?
                const virtualId = wp.id + (wp.funcao === 'Ajudante' ? '-ajudante' : '-titular');
                if (cards.some(c => c.id === virtualId)) continue;
                // Adicionar card avulso para garantir reenvio
                cards.push({
                    ...wp,
                    id: virtualId,
                    resolvedPublisherName: name,
                });
            }
            if (mounted) setValidParts(cards);
        }
        prepareParts();
        return () => { mounted = false; };
    }, [weekParts, publishers]);

    // Carregar histórico de mensagens ao abrir o modal
    // Deps incluem weekParts e publishers para regen a msg ao mudar designação
    useEffect(() => {
        if (isOpen) {
            loadHistory();
            loadConfirmationStatuses();
        }
    }, [isOpen, weekId, weekParts, publishers]);

    // Carregar dia da reunião persistido para a semana atual.
    useEffect(() => {
        if (!isOpen || !weekId) return;
        let canceled = false;

        const loadMeetingDayOfWeek = async () => {
            try {
                const map = await api.getSetting<Record<string, number>>(S89_MEETING_DAY_SETTING_KEY, {});
                const resolved = normalizeMeetingDayOfWeek(map[weekId]);
                if (!canceled) setMeetingDayOfWeek(resolved);
            } catch (error) {
                console.warn('[S89Modal] Falha ao carregar dia da reuniao persistido:', error);
                if (!canceled) setMeetingDayOfWeek(DEFAULT_MEETING_DAY_OF_WEEK);
            }
        };

        loadMeetingDayOfWeek();
        return () => { canceled = true; };
    }, [isOpen, weekId]);

    const handleMeetingDayChange = async (nextDay: number) => {
        const normalizedDay = normalizeMeetingDayOfWeek(nextDay);
        setMeetingDayOfWeek(normalizedDay);

        try {
            const map = await api.getSetting<Record<string, number>>(S89_MEETING_DAY_SETTING_KEY, {});
            const current = normalizeMeetingDayOfWeek(map[weekId]);
            if (current === normalizedDay) return;

            await api.setSetting(S89_MEETING_DAY_SETTING_KEY, {
                ...map,
                [weekId]: normalizedDay,
            });
        } catch (error) {
            console.warn('[S89Modal] Falha ao salvar dia da reuniao persistido:', error);
        }
    };

    // Realtime: refresh quando notifications ou portal_responses mudam externamente
    useEffect(() => {
        if (!isOpen) return;
        const ch = supabase
            .channel(`s89-modal-${weekId}`)
            .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'notifications' }, () => {
                console.log('[S89Modal] realtime: notifications changed -> reload history');
                loadHistory();
            })
            .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'confirmation_portal_responses' }, () => {
                console.log('[S89Modal] realtime: portal_responses changed -> reload statuses');
                loadConfirmationStatuses();
            })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [isOpen, weekId]);

    // Re-gerar mensagens sempre que validParts mudar (garante cobertura das novas cards)
    useEffect(() => {
        if (!isOpen || validParts.length === 0) return;
        let mounted = true;
        async function generateMessages() {
            const edits: Record<string, string> = {};
            for (const p of validParts) {
                try {
                    const { content } = await communicationService.prepareS89Message(p, publishers, weekParts, { isSubstitution: substitutionIds.has(p.id), meetingDayOfWeek });
                    edits[p.id] = content;
                } catch (err) {
                    console.warn('[S89Modal] Falha ao gerar mensagem para', p.id, err);
                }
            }
            if (mounted) setEditingMessages(prev => ({ ...prev, ...edits }));
        }
        generateMessages();
        return () => { mounted = false; };
    }, [validParts, meetingDayOfWeek]);

    const loadHistory = async () => {
        try {
            const history = await communicationService.getHistory(500);
            const mapping: Record<string, any> = {};
            const allEntries: Record<string, SendEntry[]> = {};
            // Rehydrate substitution flag from persisted notifications metadata.
            // Rule: most-recent send for the part wins; if it was a substitution, the part
            // is currently in substitution mode (the publisher being asked is a stand-in).
            const recentSubst = new Set<string>();
            // history is ordered by created_at DESC
            history.forEach(h => {
                const partId = h.metadata?.partId;
                if (!partId) return;
                if (!mapping[partId]) {
                    mapping[partId] = h;
                    if (h.metadata?.isSubstitution) recentSubst.add(partId);
                }
                let kind: SendKind = 'inicial';
                if (h.metadata?.isReconfirmation) kind = 'reconf';
                else if (h.metadata?.isSubstitution) kind = 'substituicao';
                if (!allEntries[partId]) allEntries[partId] = [];
                allEntries[partId].push({ sentAt: h.created_at as string, kind });
            });
            setLastMessages(mapping);
            setSendHistory(allEntries);
            // Merge rehydrated substitution flags with any flags toggled in the current session.
            setSubstitutionIds(prev => {
                const merged = new Set(prev);
                recentSubst.forEach(id => merged.add(id));
                return merged;
            });
        } catch (err) {
            console.error('Erro ao carregar histórico no modal:', err);
        }
    };

    /**
     * Item 4: load latest portal response per part for current week.
     * Uses RPC `get_portal_responses_for_week` (SECURITY DEFINER) because confirmation_portal_*
     * tables have RLS enabled with no SELECT policy. Portal RPC stores 'confirmed'/'refused'.
     */
    const loadConfirmationStatuses = async () => {
        try {
            const { data, error } = await supabase.rpc('get_portal_responses_for_week', { p_week_id: weekId });
            if (error) {
                console.warn('[S89Modal] RPC get_portal_responses_for_week falhou:', error);
                return;
            }
            const map: Record<string, PartConfirmationStatus> = {};
            for (const row of (data || []) as any[]) {
                const resp = (row.response || '').toLowerCase();
                if (resp === 'confirmed') {
                    map[row.part_id] = { response: 'accepted', respondedAt: row.responded_at };
                } else if (resp === 'refused') {
                    map[row.part_id] = { response: 'declined', respondedAt: row.responded_at };
                }
            }
            setConfirmationStatuses(map);
        } catch (err) {
            console.warn('[S89Modal] Falha ao carregar respostas do portal:', err);
        }
    };

    // Carrega tokens de disponibilidade ao abrir o modal
    useEffect(() => {
        if (!isOpen) return;
        api.getSetting<AvailabilityToken[]>('availability_tokens', [])
            .then(setAvailabilityTokens)
            .catch(() => {/* não crítico */});
    }, [isOpen]);

    // Gera ou recupera token de disponibilidade para um publicador e insere o link na mensagem
    const handleInsertAvailabilityLink = async (part: WorkbookPart) => {
        const publisherName = (part as any).resolvedPublisherName || part.rawPublisherName;
        const pub = publishers.find(p => p.name === publisherName);
        if (!pub) { alert('Publicador não encontrado.'); return; }

        setInsertingAvailability(prev => new Set(prev).add(part.id));
        try {
            let token = availabilityTokens.find(t => t.publisherId === pub.id && t.active);
            if (!token) {
                // Gera novo token
                const arr = new Uint8Array(18);
                crypto.getRandomValues(arr);
                const newTok: AvailabilityToken = {
                    token: Array.from(arr, b => b.toString(16).padStart(2, '0')).join(''),
                    publisherId: pub.id,
                    publisherName: pub.name,
                    createdAt: new Date().toISOString(),
                    createdBy: 'auto-s89',
                    active: true,
                };
                const updated = [...availabilityTokens, newTok];
                await api.setSetting('availability_tokens', updated);
                setAvailabilityTokens(updated);
                token = newTok;
            }

            const base = window.location.origin + window.location.pathname;
            const url = `${base}?portal=availability&token=${token.token}`;
            const line = `\n\n📅 Atualize sua disponibilidade:\n${url}`;

            setEditingMessages(prev => {
                const current = prev[part.id] || '';
                // Evita duplicar se o link já estiver na mensagem
                if (current.includes(token!.token)) return prev;
                return { ...prev, [part.id]: current + line };
            });
        } catch (err) {
            console.error('[S89Modal] Erro ao inserir link de disponibilidade:', err);
            alert('Erro ao gerar link de disponibilidade.');
        } finally {
            setInsertingAvailability(prev => { const n = new Set(prev); n.delete(part.id); return n; });
        }
    };

    // Async Generation of S-140 HTML for Sharing
    // IMPORTANT: Dependencies must be consistent.
    useEffect(() => {
        if (!isOpen) return; // Don't generate if closed
        if (weekParts.length === 0) return;

        let isMounted = true;
        const generateHiddenS140 = async () => {
            try {
                const { prepareS140UnifiedData, renderS140ToElement } = await import('../services/s140GeneratorUnified');

                // Passa publishers para que resolveName funcione quando resolvedPublisherName é null
                const weekData = await prepareS140UnifiedData(weekParts, publishers);
                const element = renderS140ToElement(weekData);

                if (isMounted) {
                    setS140HTML(element.outerHTML);
                }
            } catch (error) {
                console.error('Erro ao preparar S-140 hidden:', error);
            }
        };

        generateHiddenS140();

        return () => { isMounted = false; };
    }, [weekParts, publishers, isOpen]);

    // Helper to find publisher phone
    const getPublisher = (name?: string) => publishers.find(p => p.name === name);
    const hasConfirmationLink = (message: string) => /portal=confirm/i.test(message) && /token=/i.test(message);

    /**
     * Resolve os parâmetros do cartão S-89 para qualquer parte:
     * - `partForPdf`: sempre o Titular (ou a própria parte se for titular)
     * - `assistantName`: nome do Ajudante, se houver
     * - `isStudent`: se a parte pertence à Escola do Ministério
     */
    const resolveS89CardParams = (part: WorkbookPart) => {
        const isAjudante = part.funcao === 'Ajudante';
        const currentPartNumber = extractPartNumber(part.tituloParte || part.tipoParte);
        let partForPdf: WorkbookPart = part;
        let assistantName: string | undefined;

        if (isAjudante) {
            const titular = weekParts.find(p => {
                const pNum = extractPartNumber(p.tituloParte || p.tipoParte);
                return pNum === currentPartNumber && p.funcao === 'Titular' && p.id !== part.id;
            });
            if (titular) {
                partForPdf = titular;
                assistantName = part.resolvedPublisherName || part.rawPublisherName;
            }
        } else {
            const assistant = weekParts.find(p => {
                const pNum = extractPartNumber(p.tituloParte || p.tipoParte);
                return pNum === currentPartNumber && p.funcao === 'Ajudante' && p.id !== part.id;
            });
            assistantName = assistant?.resolvedPublisherName || assistant?.rawPublisherName;
        }

        const pType = (part.tipoParte || '').toLowerCase();
        const pSection = (part.section || '').toLowerCase();
        const isStudent = pSection.includes('ministério') ||
            pSection.includes('ministerio') ||
            pType.includes('leitura') ||
            pType.includes('conversa') ||
            pType.includes('revisita') ||
            pType.includes('estudo');

        return { partForPdf, assistantName, isStudent };
    };

    const handleSend = async (part: WorkbookPart) => {
        setProcessingIds(prev => new Set(prev).add(part.id));
        try {
            const publisherName = part.resolvedPublisherName || part.rawPublisherName;
            const foundPublisher = getPublisher(publisherName);
            const phone = foundPublisher?.phone;

            const { partForPdf, assistantName, isStudent } = resolveS89CardParams(part);

            // Obter mensagem (pode estar undefined se validParts acabou de ser populado)
            let message = editingMessages[part.id];

            // Gerar on-demand se ainda não estiver pronta
            if (!message) {
                try {
                    const { content } = await communicationService.prepareS89Message(part as any, publishers, weekParts, { isSubstitution: substitutionIds.has(part.id), meetingDayOfWeek });
                    message = content;
                    setEditingMessages(prev => ({ ...prev, [part.id]: content }));
                } catch (err) {
                    console.warn('[S89Modal] Mensagem gerada on-demand falhou:', err);
                }
            }

            const canHaveConfirmationLink = Boolean(part.resolvedPublisherId || foundPublisher?.id);
            if (message && canHaveConfirmationLink && !hasConfirmationLink(message)) {
                try {
                    const { content } = await communicationService.prepareS89Message(part as any, publishers, weekParts, { isSubstitution: substitutionIds.has(part.id), meetingDayOfWeek });
                    if (hasConfirmationLink(content)) {
                        message = content;
                        setEditingMessages(prev => ({ ...prev, [part.id]: content }));
                    }
                } catch (err) {
                    console.warn('[S89Modal] Regeração da mensagem com link falhou:', err);
                }
            }

            if (!message) {
                alert('Mensagem ainda não carregada. Aguarde um instante e tente novamente.');
                return;
            }

            // 1. Gerar e copiar imagem do cartão S-89 para TODAS as partes.
            //    `forStudent` controla a oclusão visual dos elementos de estudante.
            {
                const success = await copyS89ToClipboard(partForPdf, assistantName, meetingDayOfWeek, isStudent);
                if (!success) {
                    console.warn('Falha ao gerar imagem do cartão S-89. Continuando apenas com texto.');
                }
            }

            // 2. Registrar no histórico de notificações
            await communicationService.logNotification({
                type: 'S89',
                recipient_name: publisherName,
                recipient_phone: phone,
                title: `S-89: ${part.tipoParte}`,
                content: message,
                status: 'SENT',
                metadata: {
                    weekId,
                    partId: part.id,
                    isStudent: isStudent,
                    isSubstitution: substitutionIds.has(part.id)
                }
            });

            // 4. Abrir WhatsApp
            const url = communicationService.generateWhatsAppUrl(phone || '', message);
            window.open(url, '_blank');

            // Atualizar histórico local para o UI
            const nowIso = new Date().toISOString();
            setLastMessages(prev => ({
                ...prev,
                [part.id]: { content: message, created_at: nowIso }
            }));
            setSendHistory(prev => {
                const arr = prev[part.id] ? [...prev[part.id]] : [];
                arr.unshift({ sentAt: nowIso, kind: substitutionIds.has(part.id) ? 'substituicao' : 'inicial' });
                return { ...prev, [part.id]: arr };
            });

        } catch (error) {
            console.error('Erro ao enviar S-89:', error);
            alert('Erro ao processar envio.');
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(part.id);
                return next;
            });
        }
    };

    const handleSendReconfirmation = async (part: WorkbookPart) => {
        setProcessingReconfirmIds(prev => new Set(prev).add(part.id));
        try {
            const publisherName = part.resolvedPublisherName || part.rawPublisherName;
            const { content, phone } = await communicationService.prepareS89ReconfirmationMessage(part as any, publishers);

            if (!content || !/https?:\/\//i.test(content)) {
                alert('Não foi possível gerar o link de re-confirmação para esta designação.');
                return;
            }

            // Copiar imagem do cartão S-89 para a área de transferência —
            // mesmo comportamento do envio inicial.
            {
                const { partForPdf, assistantName, isStudent } = resolveS89CardParams(part);
                const success = await copyS89ToClipboard(partForPdf, assistantName, meetingDayOfWeek, isStudent);
                if (!success) {
                    console.warn('[Reconfirmação] Falha ao gerar imagem do cartão S-89. Continuando apenas com texto.');
                }
            }

            await communicationService.logNotification({
                type: 'S89',
                recipient_name: publisherName,
                recipient_phone: phone,
                title: `S-89 Reconfirmação: ${part.tipoParte}`,
                content,
                status: 'SENT',
                metadata: {
                    weekId,
                    partId: part.id,
                    isReconfirmation: true
                }
            });

            const url = communicationService.generateWhatsAppUrl(phone || '', content);
            window.open(url, '_blank');

            const nowIso = new Date().toISOString();
            setLastMessages(prev => ({
                ...prev,
                [part.id]: { content, created_at: nowIso }
            }));
            setSendHistory(prev => {
                const arr = prev[part.id] ? [...prev[part.id]] : [];
                arr.unshift({ sentAt: nowIso, kind: 'reconf' });
                return { ...prev, [part.id]: arr };
            });
        } catch (error) {
            console.error('Erro ao enviar reconfirmação S-89:', error);
            alert('Erro ao processar reconfirmação.');
        } finally {
            setProcessingReconfirmIds(prev => {
                const next = new Set(prev);
                next.delete(part.id);
                return next;
            });
        }
    };

    // --- S-140 SHARE LOGIC ---
    const handleShareS140 = async () => {
        if (!s140Ref.current) return;
        setIsSharingS140(true);
        try {
            // Force block visibility for capture (although it's visually hidden via position)
            const element = s140Ref.current;

            const canvas = await html2canvas(element, {
                scale: 2, // High DPI
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false,
            });

            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));

            if (!blob) throw new Error('Falha ao gerar Blob da imagem S-140');

            if (navigator.clipboard && navigator.clipboard.write) {
                await navigator.clipboard.write([
                    new ClipboardItem({
                        [blob.type]: blob
                    })
                ]);

                // 1. Calcular Saudação (Dia/Tarde/Noite) — PT-BR: bom dia / boa tarde / boa noite
                const hour = new Date().getHours();
                const greeting = hour < 12 ? 'bom dia' : hour < 18 ? 'boa tarde' : 'boa noite';

                // 2. Calcular Data da reunião da semana com base no dropdown persistido.
                const [y, m, d] = weekId.split('-').map(Number);
                const weekDate = new Date(y, m - 1, d);
                const daysToTarget = (meetingDayOfWeek - weekDate.getDay() + 7) % 7;
                const targetDate = new Date(weekDate);
                targetDate.setDate(weekDate.getDate() + daysToTarget);

                // Formatar Data: DD de MMMMM de YYYYY
                const day = targetDate.getDate();
                const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
                const weekDays = ['domingo', 'segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sabado'];
                const dayName = weekDays[targetDate.getDay()] || 'quinta-feira';
                const month = months[targetDate.getMonth()];
                const year = targetDate.getFullYear();
                const formattedDate = `${day} de ${month} de ${year}`;

                // 3. Montar Mensagem
                const message = `Olá irmãos! ${greeting.charAt(0).toUpperCase() + greeting.slice(1)}!\n\nSegue programação da reunião de meio de semana, para ${dayName}, dia ${formattedDate}.\n\n(Salmo 90:17)`;

                // 4. Abrir WhatsApp Web com texto preenchido
                const encodedMessage = encodeURIComponent(message);
                window.open(`https://api.whatsapp.com/send?text=${encodedMessage}`, '_blank');
            } else {
                alert('Seu navegador não suporta cópia direta. Imagem gerada, mas não copiada.');
            }

        } catch (error) {
            console.error('Erro ao compartilhar S-140:', error);
            alert('Erro ao gerar imagem S-140.');
        } finally {
            setIsSharingS140(false);
        }
    };

    // --- Item 4: STATUS BOARD SHARE LOGIC ---
    const handleShareStatusBoard = async () => {
        if (!statusRef.current) return;
        setIsSharingStatus(true);
        try {
            // Recarregar respostas para snapshot atualizado
            await loadConfirmationStatuses();
            // pequena espera para o React aplicar o setState antes do html2canvas
            await new Promise(r => setTimeout(r, 80));
            const canvas = await html2canvas(statusRef.current, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false,
            });
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('Falha ao gerar imagem do status board');

            if (navigator.clipboard && navigator.clipboard.write) {
                await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                const message = `Status atual das designações da semana ${weekId} (cole a imagem aqui).`;
                window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
            } else {
                // Fallback: download
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `status-${weekId}.png`; a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err) {
            console.error('Erro ao compartilhar status board:', err);
            alert('Erro ao gerar imagem do status.');
        } finally {
            setIsSharingStatus(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }} onClick={onClose}>
            <div style={{
                background: 'white', borderRadius: '12px', width: '500px', maxWidth: '95vw',
                maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F9FAFB' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1em', color: '#111827' }}>📤 Enviar Cartões (Semana {weekId})</h3>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6B7280' }}>&times;</button>
                </div>

                {/* S-140 Hidden Render Container */}
                <div
                    ref={s140Ref}
                    style={{
                        position: 'absolute',
                        top: '-9999px',
                        left: '-9999px',
                        width: '800px', // Fixed width for A4 consistency or similar
                        background: 'white',
                        padding: '20px'
                    }}
                    dangerouslySetInnerHTML={{ __html: s140HTML }}
                />

                {/* Item 4: Status Board Hidden Render Container */}
                <div
                    ref={statusRef}
                    style={{
                        position: 'absolute',
                        top: '-9999px',
                        left: '-9999px',
                        width: '900px',
                        background: 'white',
                        padding: '24px',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        color: '#111827'
                    }}
                >
                    <div style={{ borderBottom: '3px solid #0EA5E9', paddingBottom: 8, marginBottom: 12 }}>
                        <h2 style={{ margin: 0, fontSize: 22, color: '#0C4A6E' }}>📊 Status das Designações — Semana {weekId}</h2>
                        <div style={{ fontSize: 12, color: '#6B7280' }}>
                            Snapshot gerado em {new Date().toLocaleString('pt-BR')}
                        </div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#F1F5F9' }}>
                                <th style={{ textAlign: 'left', padding: '8px', border: '1px solid #CBD5E1' }}>Parte</th>
                                <th style={{ textAlign: 'left', padding: '8px', border: '1px solid #CBD5E1' }}>Publicador</th>
                                <th style={{ textAlign: 'center', padding: '8px', border: '1px solid #CBD5E1', width: 150 }}>Status</th>
                                <th style={{ textAlign: 'left', padding: '8px', border: '1px solid #CBD5E1', width: 170 }}>Última msg-zap</th>
                            </tr>
                        </thead>
                        <tbody>
                            {validParts.map(part => {
                                // REGRA AUTORITATIVA: part.status manda.
                                //   DESIGNADA  → ACEITA
                                //   REJEITADA  → REJEITADA
                                //   senão      → AGUARDANDO (se já enviou) / — não enviado —
                                // portal_response só é usado para preencher respondedAt quando coincide.
                                const portal = confirmationStatuses[part.id];
                                let status: PartConfirmationStatus | undefined;
                                if (part.status === 'DESIGNADA') {
                                    status = { response: 'accepted', respondedAt: portal?.respondedAt };
                                } else if (part.status === 'REJEITADA') {
                                    status = { response: 'declined', respondedAt: portal?.respondedAt };
                                } else {
                                    status = undefined;
                                }
                                const isSubst = substitutionIds.has(part.id);
                                const last = lastMessages[part.id];
                                const wasSent = !!last;

                                // Response stamp (independente da substituição)
                                let respLabel: string | null = null;
                                let respBg = '#FEF3C7';
                                let respFg = '#92400E';
                                if (status?.response === 'accepted') {
                                    respLabel = '✓ ACEITA'; respBg = '#10B981'; respFg = 'white';
                                } else if (status?.response === 'declined') {
                                    respLabel = '✗ REJEITADA'; respBg = '#EF4444'; respFg = 'white';
                                } else if (wasSent) {
                                    respLabel = '⏳ AGUARDANDO'; respBg = '#FEF3C7'; respFg = '#92400E';
                                } else {
                                    respLabel = '— não enviado —'; respBg = '#E5E7EB'; respFg = '#374151';
                                }

                                const lastWhen = last?.created_at
                                    ? new Date(last.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                                    : '—';
                                return (
                                    <tr key={part.id}>
                                        <td style={{ padding: '8px', border: '1px solid #CBD5E1' }}>
                                            <strong>{part.tipoParte}</strong>
                                            {part.tituloParte && <div style={{ fontSize: 11, color: '#6B7280' }}>{part.tituloParte}</div>}
                                        </td>
                                        <td style={{ padding: '8px', border: '1px solid #CBD5E1' }}>
                                            {part.resolvedPublisherName || part.rawPublisherName || '—'}
                                            {part.funcao === 'Ajudante' && <span style={{ marginLeft: 4, fontSize: 10, color: '#3730A3' }}>(Ajud.)</span>}
                                        </td>
                                        <td style={{ padding: '8px', border: '1px solid #CBD5E1', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                                {isSubst && (
                                                    <span style={{
                                                        background: '#F59E0B', color: 'white',
                                                        padding: '3px 8px', borderRadius: 12,
                                                        fontWeight: 700, fontSize: 11, letterSpacing: 0.4,
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        🔄 SUBSTITUIÇÃO
                                                    </span>
                                                )}
                                                <span style={{
                                                    background: respBg, color: respFg,
                                                    padding: '4px 10px', borderRadius: 14,
                                                    fontWeight: 700, fontSize: 12, letterSpacing: 0.4,
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {respLabel}
                                                </span>
                                                {status?.respondedAt && (
                                                    <div style={{ fontSize: 10, color: '#6B7280' }}>
                                                        Resp: {new Date(status.respondedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '8px', border: '1px solid #CBD5E1', fontSize: 12 }}>
                                            {lastWhen}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* List */}
                <div style={{ overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <ProfileChangeTooltipChip
                            notifications={profileChangeNotifications}
                            tone="light"
                        />
                    </div>

                    <AvailabilityChangesBanner
                        publishers={publishers}
                        workbookParts={weekParts}
                        tone="light"
                    />

                    <ConfirmationRefusalsBanner
                        publishers={publishers}
                        workbookParts={weekParts}
                        tone="light"
                    />

                    {/* Seletor de dia da reunião — afeta mensagens, formulário S-89 e exibição do dia */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 12px', borderRadius: '8px',
                        background: '#FEF3C7', border: '1px solid #FDE68A'
                    }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#92400E' }}>📅 Dia da reunião:</span>
                        <select
                            value={meetingDayOfWeek}
                            onChange={e => handleMeetingDayChange(parseInt(e.target.value, 10))}
                            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #D97706', fontSize: 13 }}
                        >
                            <option value={0}>Domingo</option>
                            <option value={1}>Segunda-feira</option>
                            <option value={2}>Terça-feira</option>
                            <option value={3}>Quarta-feira</option>
                            <option value={4}>Quinta-feira (padrão)</option>
                            <option value={5}>Sexta-feira</option>
                            <option value={6}>Sábado</option>
                        </select>
                        <span style={{ fontSize: 11, color: '#92400E', fontStyle: 'italic' }}>
                            (Salvo por semana; reflete em todas as mensagens, formulário S-89 e textos de data)
                        </span>
                    </div>

                    {/* S-140 Action Row */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px', borderRadius: '8px', border: '1px solid #d1fae5', background: '#ecfdf5',
                        marginBottom: '8px'
                    }}>
                        <div>
                            <div style={{ fontWeight: '600', color: '#065f46', fontSize: '0.9em' }}>📜 Quadro de Anúncios (S-140)</div>
                            <div style={{ fontSize: '0.85em', color: '#047857' }}>
                                Programação completa da semana
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={handleShareS140}
                                disabled={isSharingS140}
                                style={{
                                    background: '#059669', color: 'white', border: 'none',
                                    padding: '8px 12px', borderRadius: '6px', cursor: isSharingS140 ? 'wait' : 'pointer',
                                    fontWeight: '500', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '4px',
                                    opacity: isSharingS140 ? 0.7 : 1
                                }}
                                title="Copia a imagem do S-140 e abre o WhatsApp Web"
                            >
                                {isSharingS140 ? '⏳...' : 'ZapWeb 🌐'}
                            </button>
                            <button
                                onClick={handleShareStatusBoard}
                                disabled={isSharingStatus}
                                style={{
                                    background: '#0EA5E9', color: 'white', border: 'none',
                                    padding: '8px 12px', borderRadius: '6px', cursor: isSharingStatus ? 'wait' : 'pointer',
                                    fontWeight: '500', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '4px',
                                    opacity: isSharingStatus ? 0.7 : 1
                                }}
                                title="Imagem da grade carimbada (ACEITA/REJEITADA/SUBSTITUIÇÃO + última msg)"
                            >
                                {isSharingStatus ? '⏳...' : 'Status 📊'}
                            </button>
                        </div>
                    </div>

                    <div style={{ height: '1px', background: '#E5E7EB', margin: '4px 0 8px 0' }} />
                    <div style={{ fontSize: '0.85em', color: '#6B7280', textTransform: 'uppercase', fontWeight: '600', marginBottom: '8px' }}>
                        Cartões Individuais (S-89)
                    </div>

                    {validParts.length === 0 ? (
                        <div style={{ color: '#6B7280', textAlign: 'center', padding: '20px' }}>Nenhuma designação relevante nesta semana.</div>
                    ) : (
                        validParts.map(part => {
                            const isProcessing = processingIds.has(part.id);
                            const isProcessingReconfirm = processingReconfirmIds.has(part.id);
                            const lastSent = lastMessages[part.id];
                            return (
                                <div key={part.id} style={{
                                    display: 'flex', flexDirection: 'column', gap: '8px',
                                    padding: '12px', borderRadius: '8px', border: '1px solid #E5E7EB', background: '#fff'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: '600', color: '#374151', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                {part.modalidade} {part.tituloParte ? `- ${part.tituloParte}` : ''}
                                                {part.status && (
                                                    <span style={{ 
                                                        fontSize: '0.75em', 
                                                        padding: '2px 8px', 
                                                        borderRadius: '12px', 
                                                        background: part.status === 'DESIGNADA' ? '#D1FAE5' : (part.status === 'PROPOSTA' ? '#DBEAFE' : '#F3F4F6'),
                                                        color: part.status === 'DESIGNADA' ? '#065F46' : (part.status === 'PROPOSTA' ? '#1E40AF' : '#374151'),
                                                        fontWeight: 'bold',
                                                        letterSpacing: '0.05em'
                                                    }}>
                                                        {part.status}
                                                    </span>
                                                )}
                                                {lastSent && (
                                                    <span
                                                        title={`Última msg: ${lastSent.content}`}
                                                        style={{ cursor: 'help', fontSize: '14px' }}
                                                    >
                                                        ℹ️
                                                    </span>
                                                )}
                                                {lastSent?.created_at && (
                                                    <span style={{ fontSize: '10px', color: '#10B981', background: '#ECFDF5', padding: '1px 4px', borderRadius: '4px' }}>
                                                        Enviado em {new Date(lastSent.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.85em', color: '#6B7280' }}>
                                                👤 {part.resolvedPublisherName || part.rawPublisherName}
                                                {part.funcao === 'Ajudante' && <span style={{ marginLeft: '4px', background: '#E0E7FF', color: '#3730A3', padding: '1px 4px', borderRadius: '4px', fontSize: '0.9em' }}>Ajudante</span>}
                                            </div>
                                            {/* Item 1: send-history list */}
                                            {sendHistory[part.id] && sendHistory[part.id].length > 0 && (
                                                <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                    {sendHistory[part.id].slice(0, 6).map((entry, idx) => {
                                                        const label = entry.kind === 'reconf' ? 'Re-conf' : entry.kind === 'substituicao' ? 'Substituição' : '1ª';
                                                        const bg = entry.kind === 'reconf' ? '#DBEAFE' : entry.kind === 'substituicao' ? '#FEF3C7' : '#D1FAE5';
                                                        const fg = entry.kind === 'reconf' ? '#1E40AF' : entry.kind === 'substituicao' ? '#92400E' : '#065F46';
                                                        const when = new Date(entry.sentAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                                                        return (
                                                            <span
                                                                key={idx}
                                                                style={{
                                                                    fontSize: '10px',
                                                                    background: bg, color: fg,
                                                                    padding: '2px 6px', borderRadius: '4px',
                                                                    fontWeight: 600
                                                                }}
                                                                title={`${label} \u00b7 ${when}`}
                                                            >
                                                                {label} · {when}
                                                            </span>
                                                        );
                                                    })}
                                                    {sendHistory[part.id].length > 6 && (
                                                        <span style={{ fontSize: '10px', color: '#6B7280' }}>
                                                            +{sendHistory[part.id].length - 6}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {/* Item 4 mini: status badge no card (+ SUBST se aplicável).
                                                REGRA: part.status manda. DESIGNADA→ACEITA; REJEITADA→REJEITADA. */}
                                            {(() => {
                                                const portal = confirmationStatuses[part.id];
                                                let effective: PartConfirmationStatus | undefined;
                                                if (part.status === 'DESIGNADA') {
                                                    effective = { response: 'accepted', respondedAt: portal?.respondedAt };
                                                } else if (part.status === 'REJEITADA') {
                                                    effective = { response: 'declined', respondedAt: portal?.respondedAt };
                                                }
                                                const showBlock = !!effective || substitutionIds.has(part.id);
                                                if (!showBlock) return null;
                                                return (
                                                <div style={{ marginTop: '4px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                    {substitutionIds.has(part.id) && (
                                                        <span style={{
                                                            fontSize: '11px',
                                                            background: '#F59E0B',
                                                            color: 'white', padding: '2px 8px', borderRadius: '12px',
                                                            fontWeight: 700, letterSpacing: '0.03em'
                                                        }}>
                                                            🔄 SUBST
                                                        </span>
                                                    )}
                                                    {effective && (
                                                    <span style={{
                                                        fontSize: '11px',
                                                        background: effective.response === 'accepted' ? '#10B981' : '#EF4444',
                                                        color: 'white', padding: '2px 8px', borderRadius: '12px',
                                                        fontWeight: 700, letterSpacing: '0.03em'
                                                    }}>
                                                        {effective.response === 'accepted' ? '✓ ACEITA' : '✗ REJEITADA'}
                                                    </span>
                                                    )}
                                                </div>
                                                );
                                            })()}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={async () => {
                                                    const willEnable = !substitutionIds.has(part.id);
                                                    setSubstitutionIds(prev => {
                                                        const next = new Set(prev);
                                                        if (willEnable) next.add(part.id); else next.delete(part.id);
                                                        return next;
                                                    });
                                                    // Regenerar mensagem refletindo o novo estado
                                                    try {
                                                        const { content } = await communicationService.prepareS89Message(part as any, publishers, weekParts, { isSubstitution: willEnable, meetingDayOfWeek });
                                                        setEditingMessages(prev => ({ ...prev, [part.id]: content }));
                                                    } catch (err) {
                                                        console.warn('[S89Modal] Falha ao regerar mensagem com flag substituição:', err);
                                                    }
                                                }}
                                                style={{
                                                    background: substitutionIds.has(part.id) ? '#F59E0B' : '#FFFBEB',
                                                    color: substitutionIds.has(part.id) ? 'white' : '#92400E',
                                                    border: '1px solid #F59E0B',
                                                    padding: '8px 10px', borderRadius: '6px', cursor: 'pointer',
                                                    fontWeight: '600', fontSize: '0.85em',
                                                    whiteSpace: 'nowrap',
                                                }}
                                                title={substitutionIds.has(part.id)
                                                    ? 'Marcado como pedido de substituição (clique para desmarcar)'
                                                    : 'Marcar como pedido de substituição (mensagem incluirá aviso)'}
                                            >
                                                {substitutionIds.has(part.id) ? '🔄 Substituição' : '🔄'}
                                            </button>
                                            <button
                                                onClick={() => handleInsertAvailabilityLink(part)}
                                                disabled={insertingAvailability.has(part.id)}
                                                style={{
                                                    background: '#7C3AED', color: 'white', border: 'none',
                                                    padding: '8px 10px', borderRadius: '6px',
                                                    cursor: insertingAvailability.has(part.id) ? 'wait' : 'pointer',
                                                    fontWeight: '500', fontSize: '0.85em',
                                                    opacity: insertingAvailability.has(part.id) ? 0.7 : 1,
                                                    whiteSpace: 'nowrap',
                                                }}
                                                title="Gera/recupera link de disponibilidade do publicador e insere na mensagem"
                                            >
                                                {insertingAvailability.has(part.id) ? '⏳' : '📅'}
                                            </button>
                                            <button
                                                onClick={() => handleSendReconfirmation(part)}
                                                disabled={isProcessingReconfirm}
                                                style={{
                                                    background: '#2563EB', color: 'white', border: 'none',
                                                    padding: '8px 12px', borderRadius: '6px', cursor: isProcessingReconfirm ? 'wait' : 'pointer',
                                                    fontWeight: '500', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '4px',
                                                    opacity: isProcessingReconfirm ? 0.7 : 1
                                                }}
                                                title="Envia apenas a 2ª chamada de reconfirmação"
                                            >
                                                {isProcessingReconfirm ? '⏳...' : 'Reconf. 🔁'}
                                            </button>
                                            <button
                                                onClick={() => handleSend(part)}
                                                disabled={isProcessing}
                                                style={{
                                                    background: '#25D366', color: 'white', border: 'none',
                                                    padding: '8px 12px', borderRadius: '6px', cursor: isProcessing ? 'wait' : 'pointer',
                                                    fontWeight: '500', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '4px',
                                                    opacity: isProcessing ? 0.7 : 1
                                                }}
                                            >
                                                {isProcessing ? '⏳...' : 'Zap 📤'}
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        value={editingMessages[part.id] || ''}
                                        onChange={(e) => setEditingMessages(prev => ({ ...prev, [part.id]: e.target.value }))}
                                        style={{
                                            width: '100%',
                                            fontSize: '11px',
                                            border: '1px solid #E5E7EB',
                                            borderRadius: '4px',
                                            padding: '8px',
                                            fontFamily: 'inherit',
                                            resize: 'vertical',
                                            minHeight: '60px',
                                            background: '#F9FAFB'
                                        }}
                                        placeholder="Carregando mensagem..."
                                    />
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', background: '#F9FAFB' }}>
                    <button onClick={onClose} style={{
                        padding: '8px 16px', borderRadius: '6px', border: '1px solid #D1D5DB',
                        background: 'white', color: '#374151', cursor: 'pointer'
                    }}>
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
}
