import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const NOISE_PARTS = ['cântico', 'cantico', 'oração inicial', 'oracao inicial', 'comentários iniciais', 'comentarios iniciais', 'comentários finais', 'comentarios finais', 'elogios e conselhos', 'elogios'];
const DIAS_PT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

async function checkDispatched(partId, dispatchType) {
    const { data } = await supabase.from('zapi_dispatch_log').select('id')
        .or(part_id.eq.\,part_id.eq.\-titular,part_id.eq.\-ajudante)
        .eq('dispatch_type', dispatchType).eq('status', 'SUCCESS').limit(1).maybeSingle();
    return !!data;
}

function isNoisePart(tipoParte) {
    const lower = tipoParte.toLowerCase().trim();
    return NOISE_PARTS.some(noise => lower.includes(noise));
}

function calculateMeetingDate(weekId, meetingDays) {
    const dp = weekId.split('-');
    if (dp.length !== 3) return null;
    const baseDate = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]));
    const dow = meetingDays[weekId] ?? 4; 
    const daysToMeeting = (dow - baseDate.getDay() + 7) % 7;
    const meetingDate = new Date(baseDate);
    meetingDate.setDate(meetingDate.getDate() + daysToMeeting);
    return meetingDate;
}

async function runDailyCycle(parts, publishers, meetingDays, today) {
    let sentCount = 0;
    const nowBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const utcToday = Date.UTC(nowBRT.getUTCFullYear(), nowBRT.getUTCMonth(), nowBRT.getUTCDate());

    for (const part of parts) {
        if (isNoisePart(part.tipo_parte)) continue;
        const meetingDate = calculateMeetingDate(part.week_id, meetingDays);
        if (!meetingDate) continue;
        const utcMeeting = Date.UTC(meetingDate.getFullYear(), meetingDate.getMonth(), meetingDate.getDate());
        const diffDays = Math.round((utcMeeting - utcToday) / (1000 * 60 * 60 * 24));
        
        let pub;
        if (part.resolved_publisher_id) pub = publishers.find(p => p.id === part.resolved_publisher_id);
        if (!pub && part.raw_publisher_name) pub = publishers.find(p => p.name.trim() === part.raw_publisher_name.trim());
        if (!pub) continue;

        const s89Sent = await checkDispatched(part.id, 'PUBLICACAO_S89');
        if (!['DESIGNADA', 'PROPOSTA'].includes(part.status)) continue;

        let dispatchType = '';
        const sentD9 = await checkDispatched(part.id, 'LEMBRETE_D9');
        const sentD7 = await checkDispatched(part.id, 'LEMBRETE_D7');
        const sentD2 = await checkDispatched(part.id, 'LEMBRETE_D2');

        if (diffDays >= 9 && diffDays <= 10 && !sentD9) dispatchType = 'LEMBRETE_D9';
        else if (diffDays >= 6 && diffDays <= 8 && !sentD7) dispatchType = 'LEMBRETE_D7';
        else if (diffDays >= 1 && diffDays <= 3 && !sentD2) dispatchType = 'LEMBRETE_D2';

        if (!dispatchType) continue;

        if (!s89Sent) {
            console.log([cron] Parte \ (\) não teve S-89 enviado.);
            continue;
        }
        
        if (!pub.phone) continue;
        console.log(WILL SEND \ for part \ (\));
        sentCount++;
    }
    return sentCount;
}

async function run() {
    const { data: meetingDayData } = await supabase.from('app_settings').select('value').eq('key', 's89_meeting_day_by_week').maybeSingle();
    const meetingDays = meetingDayData?.value || {};
    const { data: rawParts } = await supabase.from('workbook_parts').select('*').in('status', ['DESIGNADA', 'PROPOSTA']);
    const { data: publishersRaw } = await supabase.from('publishers').select('id, data');
    const publishers = publishersRaw.map((p) => ({
        id: p.id,
        name: p.data?.name ?? '',
        phone: p.data?.phone ?? '',
    }));
    const count = await runDailyCycle(rawParts, publishers, meetingDays, new Date());
    console.log("Total parts to send:", count);
}
run();
