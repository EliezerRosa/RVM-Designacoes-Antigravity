import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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

async function debug() {
    const { data: meetingDayData } = await supabase.from('app_settings').select('value').eq('key', 's89_meeting_day_by_week').maybeSingle();
    const meetingDays = meetingDayData?.value || {};
    const { data: publishers } = await supabase.from('publishers').select('*');
    const { data: parts } = await supabase.from('workbook_parts').select('*').in('status', ['PROPOSTA', 'DESIGNADA', 'APROVADA']);
    const { data: zapiLogs } = await supabase.from('zapi_dispatch_log').select('*').eq('status', 'SUCCESS').order('dispatched_at', { ascending: false });
    const { data: zapiLogsManual } = await supabase.from('zapi_dispatch_log').select('*').in('status', ['SUCCESS', 'SUCCESS_MANUAL']).order('dispatched_at', { ascending: false });


    function checkDispatched(partId, type) {
        return zapiLogs.some(log => 
            (log.part_id === partId || log.part_id === `${partId}-titular` || log.part_id === `${partId}-ajudante`) 
            && log.dispatch_type === type
        );
    }
    
    function checkS89(partId) {
        return zapiLogsManual.some(log => 
            (log.part_id === partId || log.part_id === `${partId}-titular` || log.part_id === `${partId}-ajudante`) 
            && log.dispatch_type === 'PUBLICACAO_S89'
        );
    }

    const nowBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const utcToday = Date.UTC(nowBRT.getUTCFullYear(), nowBRT.getUTCMonth(), nowBRT.getUTCDate());
    
    console.log(`\nBase Date (Hoje BRT): ${nowBRT.toISOString().split('T')[0]}\n`);
    
    let outputs = [];

    for (const part of parts) {
        if (part.week_id !== '2026-09-28' && part.week_id !== '2026-10-05') continue;
        const tipo = (part.tipo_parte || '').toLowerCase();
        if (tipo.includes('cântico') || tipo.includes('cantico') || tipo.includes('oração') || tipo.includes('oracao')) continue;

        const meetingDate = calculateMeetingDate(part.week_id, meetingDays);
        let pub = null;
        if (part.resolved_publisher_id) pub = publishers.find(p => String(p.id) === String(part.resolved_publisher_id));
        if (!pub && part.raw_publisher_name) pub = publishers.find(p => p.name.trim() === part.raw_publisher_name.trim());
        
        if (!pub || !pub.phone) continue;

        const utcMeeting = Date.UTC(meetingDate.getFullYear(), meetingDate.getMonth(), meetingDate.getDate());
        const diffDaysMeeting = Math.round((utcMeeting - utcToday) / (1000 * 60 * 60 * 24));

        const s89Sent = checkS89(part.id); // No cron ele pesquisa apenas 'SUCCESS' para PUBLICACAO_S89! A menos que tenham consertado. No meu fix anterior eu mudei o 'part.id' mas não o 'status'.

        if (['DESIGNADA', 'PROPOSTA'].includes(part.status)) {
            const sentD2 = checkDispatched(part.id, 'LEMBRETE_D2');
            const sentD9 = checkDispatched(part.id, 'LEMBRETE_D9');
            
            if (diffDaysMeeting >= 1 && diffDaysMeeting <= 3 && !sentD2 && s89Sent) {
                outputs.push(`[18:00] D-2 será disparado para: ${pub.name} (${part.tipo_parte}) - Faltam ${diffDaysMeeting} dias`);
            }
            if (diffDaysMeeting >= 9 && diffDaysMeeting <= 10 && !sentD9 && s89Sent) {
                outputs.push(`[18:00] D-9 será disparado para: ${pub.name} (${part.tipo_parte}) - Faltam ${diffDaysMeeting} dias`);
            }
        }
        
        if (part.status === 'PROPOSTA') {
            if (s89Sent) {
                const latestDispatch = zapiLogsManual.find(log => 
                    (log.part_id === part.id || log.part_id === `${part.id}-titular` || log.part_id === `${part.id}-ajudante`) &&
                    log.recipient_phone === pub.phone
                );

                if (latestDispatch) {
                    const dispatchTime = new Date(latestDispatch.dispatched_at);
                    const dispatchBRT = new Date(dispatchTime.getTime() - 3 * 60 * 60 * 1000);
                    const utcDispatch = Date.UTC(dispatchBRT.getUTCFullYear(), dispatchBRT.getUTCMonth(), dispatchBRT.getUTCDate());
                    const diffDaysPing = Math.round((utcToday - utcDispatch) / (1000 * 60 * 60 * 24));

                    if (diffDaysPing >= 3) {
                        outputs.push(`[18:00] PING 72H será disparado para: ${pub.name} (${part.tipo_parte}) - Última msg foi há ${diffDaysPing} dias`);
                    }
                }
            }
        }
    }
    
    if (outputs.length > 0) {
        console.log(outputs.join('\n'));
    } else {
        console.log("Ninguém será notificado às 18:00. O Log Canônico não tem s89Sent=true (apenas SUCCESS, não SUCCESS_MANUAL), ou não há partes no prazo.");
    }
}

debug();
