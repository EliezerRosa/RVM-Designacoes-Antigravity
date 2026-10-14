/**
 * publisherUpcomingAssignmentsService.ts
 *
 * Consulta e formata as designações futuras JÁ PUBLICADAS de um publicador.
 * Usado para enviar uma mensagem Z-API extra, desacoplada e consolidada quando
 * o publicador possui 2 ou mais designações no horizonte futuro.
 */

import { supabase } from '../lib/supabase';
import { api } from './api';
import type { Publisher, WorkbookPart } from '../types';

export interface UpcomingAssignmentItem {
    partId: string;
    realPartId: string; // ID limpo sem -titular / -ajudante
    weekId: string;
    weekDisplay: string;
    date: string; // YYYY-MM-DD
    meetingDisplayDate: string; // e.g. "quinta-feira, 24 de outubro de 2026"
    shortDate: string; // e.g. "24/10"
    tipoParte: string;
    tituloParte?: string;
    funcao: 'Titular' | 'Ajudante';
    modalidade?: string;
    sala: 'Salão Principal' | 'Sala auxiliar B';
    partnerName?: string;
    status: 'DESIGNADA' | 'PROPOSTA' | 'APROVADA';
    isConfirmed: boolean;
}

export interface UpcomingSummaryResult {
    publisher: Publisher;
    assignments: UpcomingAssignmentItem[];
    messageText: string;
    buttonActions: Array<{ id: string; type: 'REPLY'; label: string }>;
    listOptions: Array<{ id: string; title: string; description?: string }>;
}

const MESES = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];
const DIAS_PT = [
    'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
    'quinta-feira', 'sexta-feira', 'sábado'
];

const DEFAULT_MEETING_DOW = 4; // Quinta-feira

/** Resolve o dia da semana configurado para a reunião daquela semana (0 a 6). */
async function getMeetingDayOfWeek(weekId: string): Promise<number> {
    try {
        const map = await api.getSetting<Record<string, number>>('s89_meeting_day_by_week', {});
        const val = map[weekId];
        if (typeof val === 'number' && val >= 0 && val <= 6) return val;
        return DEFAULT_MEETING_DOW;
    } catch {
        return DEFAULT_MEETING_DOW;
    }
}

/** Formata data YYYY-MM-DD para o dia real da reunião */
async function formatMeetingDate(dateStr: string, weekId: string): Promise<{ full: string; short: string }> {
    const dp = (dateStr || '').split('-');
    if (dp.length !== 3) {
        return { full: dateStr || 'Data a confirmar', short: 'Data' };
    }

    const meetingDow = await getMeetingDayOfWeek(weekId);
    const baseDate = new Date(parseInt(dp[0], 10), parseInt(dp[1], 10) - 1, parseInt(dp[2], 10));
    const daysToMeeting = (meetingDow - baseDate.getDay() + 7) % 7;
    const meetingDate = new Date(baseDate);
    meetingDate.setDate(baseDate.getDate() + daysToMeeting);

    const diaNum = meetingDate.getDate();
    const mesNum = meetingDate.getMonth();
    const anoNum = meetingDate.getFullYear();
    const diaSemana = DIAS_PT[meetingDow] || 'quinta-feira';

    const full = `${diaSemana}, ${diaNum} de ${MESES[mesNum]} de ${anoNum}`;
    const short = `${String(diaNum).padStart(2, '0')}/${String(mesNum + 1).padStart(2, '0')}`;
    return { full, short };
}

/**
 * Busca todas as designações futuras que já foram publicadas para o publicador.
 * Considera publicadas:
 *  - Semanas registradas em `app_settings.week_published`
 *  - OU partes com registro 'PUBLICACAO_S89' com 'SUCCESS' em `zapi_dispatch_log`
 */
export async function getFuturePublishedAssignments(
    publisherId: string,
    publishersList?: Publisher[]
): Promise<{ publisher: Publisher | null; assignments: UpcomingAssignmentItem[] }> {
    const allPublishers = publishersList && publishersList.length > 0
        ? publishersList
        : await api.loadPublishers();

    const publisher = allPublishers.find(p => p.id === publisherId) || null;
    if (!publisher) {
        return { publisher: null, assignments: [] };
    }

    // Data de corte: Segunda-feira da semana corrente em UTC-3 (Brasília),
    // pois a coluna `workbook_parts.date` armazena a SEGUNDA-FEIRA de cada semana.
    const nowBrt = new Date(Date.now() - 3 * 3600 * 1000);
    const dayOfWeek = nowBrt.getDay(); // 0=dom, 1=seg, 2=ter...
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const currentMonday = new Date(nowBrt);
    currentMonday.setDate(nowBrt.getDate() - daysSinceMonday);
    const currentMondayStr = currentMonday.toISOString().slice(0, 10);

    // 1. Buscar semanas publicadas
    let publishedWeeksMap: Record<string, string> = {};
    try {
        publishedWeeksMap = await api.getSetting<Record<string, string>>('week_published', {});
    } catch {
        // fallback
    }

    // 2. Buscar partes futuras ativas do publicador (titular ou ajudante)
    // Filtramos partes com status ativos a partir da segunda-feira da semana corrente
    const { data: rawParts, error: partsErr } = await supabase
        .from('workbook_parts')
        .select('*')
        .gte('date', currentMondayStr)
        .in('status', ['PROPOSTA', 'DESIGNADA', 'APROVADA'])
        .or(`resolved_publisher_id.eq.${publisherId},raw_publisher_name.ilike.%${publisher.name.trim()}%`)
        .order('date', { ascending: true })
        .order('seq', { ascending: true });

    if (partsErr || !rawParts || rawParts.length === 0) {
        return { publisher, assignments: [] };
    }

    // 3. Buscar logs de publicação S-89 para confirmar publicação individual de partes
    const partIds = rawParts.map(p => p.id);
    const virtualPartIds = [
        ...partIds,
        ...partIds.map(id => `${id}-titular`),
        ...partIds.map(id => `${id}-ajudante`)
    ];

    const { data: dispatchLogs } = await supabase
        .from('zapi_dispatch_log')
        .select('part_id')
        .eq('dispatch_type', 'PUBLICACAO_S89')
        .eq('status', 'SUCCESS')
        .in('part_id', virtualPartIds);

    const publishedPartIdsSet = new Set<string>();
    (dispatchLogs || []).forEach(row => {
        if (row.part_id) {
            publishedPartIdsSet.add(row.part_id.replace(/-(titular|ajudante)$/i, ''));
        }
    });

    // 4. Filtrar partes que foram de fato publicadas e cuja reunião ainda não ocorreu
    const candidateParts: typeof rawParts = [];
    for (const p of rawParts) {
        const isWeekPub = Boolean(publishedWeeksMap[p.week_id]);
        const isPartPub = publishedPartIdsSet.has(p.id);
        if (!isWeekPub && !isPartPub) continue;

        // Se a semana for a corrente, verificar se a reunião já ocorreu
        if (p.date === currentMondayStr) {
            const meetingDow = await getMeetingDayOfWeek(p.week_id);
            // Se hoje já passou do dia da reunião da semana corrente, descartar
            if (dayOfWeek > meetingDow) continue;
        }

        candidateParts.push(p);
    }

    if (candidateParts.length === 0) {
        return { publisher, assignments: [] };
    }

    // 5. Buscar todas as partes das semanas afetadas para encontrar duplas (parceiros)
    const affectedWeekIds = Array.from(new Set(candidateParts.map(p => p.week_id)));
    const { data: allWeekParts } = await supabase
        .from('workbook_parts')
        .select('*')
        .in('week_id', affectedWeekIds);

    const weekPartsByWeek = new Map<string, any[]>();
    (allWeekParts || []).forEach(wp => {
        const list = weekPartsByWeek.get(wp.week_id) || [];
        list.push(wp);
        weekPartsByWeek.set(wp.week_id, list);
    });

    // 6. Montar a lista formatada de UpcomingAssignmentItem
    const assignments: UpcomingAssignmentItem[] = [];

    for (const p of candidateParts) {
        const dates = await formatMeetingDate(p.date, p.week_id);
        const isSalaB = String(p.modalidade || '').toLowerCase().includes('b');
        const sala: 'Salão Principal' | 'Sala auxiliar B' = isSalaB ? 'Sala auxiliar B' : 'Salão Principal';
        const isConfirmed = p.status === 'DESIGNADA';

        // Localizar parceiro(a) se for parte em dupla
        let partnerName: string | undefined;
        const weekParts = weekPartsByWeek.get(p.week_id) || [];
        const partNumMatch = (p.part_title || p.tipo_parte || '').match(/^(\d+)/);
        const partNum = partNumMatch ? partNumMatch[1] : null;

        const partnerPart = weekParts.find(other => {
            if (other.id === p.id) return false;
            const otherNumMatch = (other.part_title || other.tipo_parte || '').match(/^(\d+)/);
            const otherNum = otherNumMatch ? otherNumMatch[1] : null;
            if (partNum && otherNum && partNum === otherNum) {
                return other.funcao !== p.funcao;
            }
            if (other.tipo_parte === p.tipo_parte && other.funcao !== p.funcao) {
                return true;
            }
            return false;
        });

        if (partnerPart) {
            partnerName = partnerPart.resolved_publisher_name || partnerPart.raw_publisher_name || undefined;
        }

        assignments.push({
            partId: p.id,
            realPartId: p.id.replace(/-(titular|ajudante)$/i, ''),
            weekId: p.week_id,
            weekDisplay: p.week_display || '',
            date: p.date,
            meetingDisplayDate: dates.full,
            shortDate: dates.short,
            tipoParte: p.tipo_parte || 'Parte',
            tituloParte: p.part_title || undefined,
            funcao: p.funcao === 'Ajudante' ? 'Ajudante' : 'Titular',
            modalidade: p.modalidade,
            sala,
            partnerName,
            status: p.status,
            isConfirmed,
        });
    }

    return { publisher, assignments };
}

/**
 * Constrói o resumo completo: texto cordial e estrutura de ações (botões rápidos ou lista).
 */
export async function buildUpcomingAssignmentsSummary(
    publisherId: string,
    publishersList?: Publisher[]
): Promise<UpcomingSummaryResult | null> {
    const { publisher, assignments } = await getFuturePublishedAssignments(publisherId, publishersList);

    if (!publisher || assignments.length < 2) {
        return null; // Não envia se tiver menos que 2 designações futuras publicadas
    }

    const honorific = publisher.gender === 'sister' ? 'Irmã' : 'Irmão';
    const nowHour = (new Date().getUTCHours() - 3 + 24) % 24;
    const greeting = nowHour < 12 ? 'Bom dia' : nowHour < 18 ? 'Boa tarde' : 'Boa noite';

    let text = `📋 *Próximas Designações — Reunião Vida e Ministério*\n\n`;
    text += `${greeting}, ${honorific} *${publisher.name}*! Saudações. 👋\n\n`;
    text += `Para seu bom planejamento, segue o resumo das suas próximas designações na Reunião Nossa Vida e Ministério Cristão:\n\n`;

    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

    assignments.forEach((item, index) => {
        const emoji = numberEmojis[index] || `*${index + 1}.*`;
        text += `${emoji} *${item.meetingDisplayDate}*\n`;
        text += `📖 *${item.tipoParte}*`;
        if (item.funcao === 'Ajudante') {
            text += ` _(Ajudante)_`;
        }
        text += `\n`;

        if (item.tituloParte && item.tituloParte !== item.tipoParte) {
            text += `🎯 Tema: _${item.tituloParte}_\n`;
        }

        if (item.partnerName) {
            const partnerRole = item.funcao === 'Ajudante' ? 'Titular' : 'Ajudante';
            text += `👥 ${partnerRole}: ${item.partnerName}\n`;
        }

        text += `🏛️ Local: ${item.sala}\n`;

        if (item.isConfirmed) {
            text += `🏷️ Situação: ✅ *Confirmada*\n\n`;
        } else {
            text += `🏷️ Situação: ⏳ *Aguardando confirmação*\n\n`;
        }
    });

    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `💡 *Ações Rápidas:*\n`;
    text += `Você pode confirmar partes pendentes ou avisar com antecedência caso não possa realizar alguma delas tocando nas opções abaixo:`;

    // Montar as opções/botões
    const buttonActions: Array<{ id: string; type: 'REPLY'; label: string }> = [];
    const listOptions: Array<{ id: string; title: string; description?: string }> = [];

    for (const item of assignments) {
        if (!item.isConfirmed) {
            // Parte Pendente: Botão Confirmar + Botão Recusar
            buttonActions.push({
                id: `CONFIRMAR:${item.realPartId}`,
                type: 'REPLY',
                label: `✅ Sim (${item.shortDate})`,
            });
            buttonActions.push({
                id: `RECUSAR:${item.realPartId}`,
                type: 'REPLY',
                label: `❌ Não posso (${item.shortDate})`,
            });

            listOptions.push({
                id: `CONFIRMAR:${item.realPartId}`,
                title: `✅ Confirmar (${item.shortDate})`,
                description: `${item.tipoParte} (${item.funcao})`,
            });
            listOptions.push({
                id: `RECUSAR:${item.realPartId}`,
                title: `❌ Não Poderei (${item.shortDate})`,
                description: `${item.tipoParte} (${item.funcao})`,
            });
        } else {
            // Parte já Confirmada: Apenas Botão Recusar (para desistência)
            buttonActions.push({
                id: `RECUSAR:${item.realPartId}`,
                type: 'REPLY',
                label: `❌ Não posso (${item.shortDate})`,
            });

            listOptions.push({
                id: `RECUSAR:${item.realPartId}`,
                title: `❌ Não Poderei (${item.shortDate})`,
                description: `${item.tipoParte} (Já confirmada)`,
            });
        }
    }

    return {
        publisher,
        assignments,
        messageText: text,
        buttonActions,
        listOptions,
    };
}
