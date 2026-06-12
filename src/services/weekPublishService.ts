/**
 * weekPublishService — Publicar / Despublicar uma semana via Z-API (lote).
 *
 * Intenção (Eliezer, 2026-06-12):
 *  - "Publicar" envia automaticamente, em lote, IGUAL ao modal zap-s-89:
 *    cartão S-89 (imagem) + texto-com-link de confirmação, apenas para partes
 *    DESIGNÁVEIS, 1x por publicador quando publica (idempotente).
 *  - Também envia o S-140 (imagem + texto) para Ajudante SRVM + SRVM + Grupo.
 *  - NÃO altera o status das partes.
 *  - Reversível ("Despublicar"): limpa o marcador da semana e o log de
 *    PUBLICACAO_S89 das partes, permitindo republicar (reenviar).
 *
 * Decoplamento: todo o envio passa pela Edge Function `send-whatsapp` via
 * `zapiOrchestrator` (caminho desacoplado). Os fluxos manuais do modal
 * permanecem intocados.
 */

import type { WorkbookPart, Publisher } from '../types';
import { communicationService } from './communicationService';
import { zapiOrchestrator } from './zapiOrchestrator';
import { generateS89PngBase64 } from './s89Generator';
import { api } from './api';
import { supabase } from '../lib/supabase';

const WEEK_PUBLISHED_KEY = 'week_published';
const S89_MEETING_DAY_SETTING_KEY = 's89_meeting_day_by_week';
const DEFAULT_MEETING_DAY_OF_WEEK = 4;

export interface PublishResult {
    success: boolean;
    s89Sent: number;
    s89Skipped: number;
    s89Failed: number;
    s140: { attempted: number; ok: number } | null;
    errors: string[];
}

function extractPartNumber(titulo?: string): string {
    const match = (titulo || '').match(/^(\d+)/);
    return match ? match[1] : '';
}

function normalizeMeetingDayOfWeek(value?: number): number {
    if (typeof value === 'number' && value >= 0 && value <= 6) return value;
    return DEFAULT_MEETING_DAY_OF_WEEK;
}

/**
 * Replica EXATAMENTE a seleção de partes designáveis do modal S89SelectionModal
 * (prepareParts): cartões a partir do S-140 unificado (Titular/Ajudante) +
 * Presidente + varredura de cobertura por status designável. Função pura/read-only.
 */
export async function buildDesignatableCards(
    weekParts: WorkbookPart[],
    publishers: Publisher[]
): Promise<WorkbookPart[]> {
    if (!weekParts || weekParts.length === 0) return [];

    const { prepareS140UnifiedData } = await import('./s140GeneratorUnified');
    const weekData = await prepareS140UnifiedData(weekParts, publishers);

    const findOriginal = (s140PartId?: string) => weekParts.find(wp => wp.id === s140PartId);

    const cards: any[] = [];
    const includedOriginalIds = new Set<string>();

    // Presidente (S-140 o coloca no cabeçalho, não em parts)
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

    for (const part of (weekData.parts || []) as any[]) {
        const original = findOriginal(part.id);
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
            const ajudanteRealId = ajudanteWp?.id || part.id;
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
                id: ajudanteRealId + '-ajudante',
            });
            if (ajudanteRealId) includedOriginalIds.add(ajudanteRealId);
        }
    }

    // Cobertura: partes designáveis não capturadas pelo S-140
    const DESIGNATABLE_STATUSES = ['DESIGNADA', 'APROVADA', 'PROPOSTA', 'CONCLUIDA'];
    const HIDDEN_TYPES = ['Cântico', 'Cantico', 'Comentários Iniciais', 'Comentarios Iniciais',
        'Comentários Finais', 'Comentarios Finais', 'Elogios e Conselhos', 'Elogios e conselhos'];

    for (const wp of weekParts) {
        if (!DESIGNATABLE_STATUSES.includes(wp.status)) continue;
        if (HIDDEN_TYPES.some(h => wp.tipoParte?.includes(h))) continue;
        if (wp.isChairmanDerived === true) continue;
        const name = wp.resolvedPublisherName || wp.rawPublisherName;
        if (!name) continue;
        const virtualId = wp.id + (wp.funcao === 'Ajudante' ? '-ajudante' : '-titular');
        if (cards.some(c => c.id === virtualId)) continue;
        cards.push({ ...wp, id: virtualId, resolvedPublisherName: name });
    }

    return cards as WorkbookPart[];
}

/**
 * Resolve os parâmetros do cartão S-89 (espelha resolveS89CardParams do modal).
 */
function resolveS89CardParams(part: WorkbookPart, weekParts: WorkbookPart[]) {
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
}

async function getMeetingDayOfWeek(weekId: string): Promise<number> {
    try {
        const map = await api.getSetting<Record<string, number>>(S89_MEETING_DAY_SETTING_KEY, {});
        return normalizeMeetingDayOfWeek(map[weekId]);
    } catch {
        return DEFAULT_MEETING_DAY_OF_WEEK;
    }
}

/** Mapa de semanas publicadas { weekId: ISO-timestamp }. */
export async function getPublishedWeeks(): Promise<Record<string, string>> {
    return api.getSetting<Record<string, string>>(WEEK_PUBLISHED_KEY, {});
}

export async function isWeekPublished(weekId: string): Promise<boolean> {
    const map = await getPublishedWeeks();
    return Boolean(map[weekId]);
}

/**
 * Publica a semana: envia S-89 (imagem+texto) a cada publicador designável (1x,
 * idempotente) e o S-140 (imagem+texto) para Ajd SRVM + SRVM + Grupo. Marca a
 * semana como publicada. NÃO altera status das partes.
 */
export async function publishWeek(
    weekId: string,
    weekParts: WorkbookPart[],
    publishers: Publisher[]
): Promise<PublishResult> {
    const result: PublishResult = {
        success: false, s89Sent: 0, s89Skipped: 0, s89Failed: 0, s140: null, errors: [],
    };

    if (!(await zapiOrchestrator.isAutomationActive())) {
        result.errors.push('Automação Z-API desativada (settings.zapi_automation_active).');
        return result;
    }

    const meetingDayOfWeek = await getMeetingDayOfWeek(weekId);
    const cards = await buildDesignatableCards(weekParts, publishers);
    const getPublisher = (name?: string) => publishers.find(p => p.name === name);

    // 1) Cartões S-89 individuais (idempotente por parte).
    for (const card of cards) {
        try {
            const publisherName = (card as any).resolvedPublisherName || card.rawPublisherName;
            const foundPublisher = getPublisher(publisherName);
            const phone = foundPublisher?.phone || (card as any).phone;
            if (!phone || !String(phone).trim()) {
                result.s89Failed++;
                result.errors.push(`${publisherName || card.id}: sem telefone.`);
                continue;
            }

            const { partForPdf, assistantName, isStudent } = resolveS89CardParams(card, weekParts);

            const { content } = await communicationService.prepareS89Message(
                card as any, publishers, weekParts, { isSubstitution: false, meetingDayOfWeek }
            );
            if (!content) {
                result.s89Failed++;
                result.errors.push(`${publisherName}: falha ao gerar texto.`);
                continue;
            }

            const imageBase64 = await generateS89PngBase64(partForPdf, assistantName, meetingDayOfWeek, isStudent);
            if (!imageBase64) {
                result.s89Failed++;
                result.errors.push(`${publisherName}: falha ao gerar imagem do cartão.`);
                continue;
            }

            const sent = await zapiOrchestrator.sendS89Direct(card.id, String(phone), content, imageBase64, 'PUBLICACAO_S89');
            if (sent.skipped) {
                result.s89Skipped++;
            } else if (sent.success) {
                result.s89Sent++;
                await communicationService.logNotification({
                    type: 'S89',
                    recipient_name: publisherName,
                    recipient_phone: String(phone),
                    title: `S-89 (Publicação): ${card.tipoParte}`,
                    content,
                    status: 'SENT',
                    metadata: { weekId, partId: card.id, isStudent, channel: 'z-api', isPublication: true },
                });
            } else {
                result.s89Failed++;
                result.errors.push(`${publisherName}: ${sent.error || 'falha no envio'}.`);
            }
        } catch (err) {
            result.s89Failed++;
            result.errors.push(`${card.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // 2) S-140 (imagem + texto) para Ajd SRVM + SRVM + Grupo.
    try {
        const recipients = await zapiOrchestrator.getBroadcastRecipients();
        if (recipients.length > 0) {
            const { generateS140ImageBase64 } = await import('./s140GeneratorUnified');
            const s140Base64 = await generateS140ImageBase64(weekParts, publishers);
            if (s140Base64) {
                const caption = buildS140Caption(weekId, meetingDayOfWeek);
                const rs = await zapiOrchestrator.dispatchImageToRecipients(s140Base64, caption, recipients);
                result.s140 = { attempted: rs.length, ok: rs.filter(r => r.success).length };
                rs.filter(r => !r.success).forEach(r => result.errors.push(`S-140 ${r.phone}: ${r.error || 'falha'}`));
            } else {
                result.errors.push('S-140: falha ao gerar imagem.');
            }
        }
    } catch (err) {
        result.errors.push(`S-140: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 3) Marcar semana como publicada (não altera status das partes).
    try {
        const map = await getPublishedWeeks();
        await api.setSetting(WEEK_PUBLISHED_KEY, { ...map, [weekId]: new Date().toISOString() });
    } catch (err) {
        result.errors.push(`Marcador de publicação: ${err instanceof Error ? err.message : String(err)}`);
    }

    result.success = result.s89Failed === 0;
    return result;
}

/**
 * Despublica a semana: limpa o marcador de publicação e o log de PUBLICACAO_S89
 * das partes da semana (permitindo republicar/reenviar). NÃO recolhe mensagens
 * já enviadas (WhatsApp não permite "unsend") nem altera status das partes.
 */
export async function unpublishWeek(
    weekId: string,
    weekParts: WorkbookPart[],
    publishers: Publisher[]
): Promise<{ success: boolean; clearedLogs: number; error?: string }> {
    try {
        const cards = await buildDesignatableCards(weekParts, publishers);
        const cardIds = cards.map(c => c.id);

        let clearedLogs = 0;
        if (cardIds.length > 0) {
            const { data, error } = await supabase
                .from('zapi_dispatch_log')
                .delete()
                .eq('dispatch_type', 'PUBLICACAO_S89')
                .in('part_id', cardIds)
                .select('id');
            if (error) {
                return { success: false, clearedLogs: 0, error: error.message };
            }
            clearedLogs = (data || []).length;
        }

        const map = await getPublishedWeeks();
        if (map[weekId]) {
            delete map[weekId];
            await api.setSetting(WEEK_PUBLISHED_KEY, map);
        }

        return { success: true, clearedLogs };
    } catch (err) {
        return { success: false, clearedLogs: 0, error: err instanceof Error ? err.message : String(err) };
    }
}

/** Legenda padrão do S-140 (saudação + data da reunião). Espelha o modal. */
function buildS140Caption(weekId: string, meetingDayOfWeek: number): string {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'bom dia' : hour < 18 ? 'boa tarde' : 'boa noite';
    const [y, m, d] = weekId.split('-').map(Number);
    const weekDate = new Date(y, m - 1, d);
    const daysToTarget = (meetingDayOfWeek - weekDate.getDay() + 7) % 7;
    const targetDate = new Date(weekDate);
    targetDate.setDate(weekDate.getDate() + daysToTarget);
    const day = targetDate.getDate();
    const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const weekDays = ['domingo', 'segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sabado'];
    const dayName = weekDays[targetDate.getDay()] || 'quinta-feira';
    const month = months[targetDate.getMonth()];
    const year = targetDate.getFullYear();
    const formattedDate = `${day} de ${month} de ${year}`;
    return `Olá irmãos! ${greeting.charAt(0).toUpperCase() + greeting.slice(1)}!\n\nSegue programação da reunião de meio de semana, para ${dayName}, dia ${formattedDate}.\n\n(Salmo 90:17)`;
}
