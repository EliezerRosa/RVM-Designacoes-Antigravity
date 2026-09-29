import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DIAS_PT = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const MESES_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function calculateMeetingDate(weekId, meetingDays) {
    const dp = weekId.split('-');
    if (dp.length !== 3) return null;
    const baseDate = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]));
    const dow = meetingDays[weekId] ?? 4; // fallback quinta-feira
    const daysToMeeting = (dow - baseDate.getDay() + 7) % 7;
    const meetingDate = new Date(baseDate);
    meetingDate.setDate(meetingDate.getDate() + daysToMeeting);
    return meetingDate;
}

async function dryRun() {
    console.log('--- PREVISÃO DO CRON DAS 18:00 ---');
    
    // Fetch meeting days
    const { data: meetingDayData } = await supabase.from('app_settings').select('value').eq('key', 's89_meeting_day_by_week').maybeSingle();
    const meetingDays = meetingDayData?.value || {};

    // Fetch publishers
    const { data: publishers } = await supabase.from('publishers').select('*');

    // Fetch active parts
    const { data: parts } = await supabase
        .from('workbook_parts')
        .select('*')
        .in('status', ['PROPOSTA', 'DESIGNADA', 'APROVADA']);

    // Fetch all relevant zapi logs
    const { data: zapiLogs } = await supabase
        .from('zapi_dispatch_log')
        .select('*')
        .eq('status', 'SUCCESS')
        .order('dispatched_at', { ascending: false });

    function checkDispatched(partId, type) {
        return zapiLogs.some(log => 
            (log.part_id === partId || log.part_id === `${partId}-titular` || log.part_id === `${partId}-ajudante`) 
            && log.dispatch_type === type
        );
    }

    const nowBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const utcToday = Date.UTC(nowBRT.getUTCFullYear(), nowBRT.getUTCMonth(), nowBRT.getUTCDate());

    console.log(`\nBase Date (Hoje BRT): ${nowBRT.toISOString().split('T')[0]}`);

    const pings72h = [];
    const lembretesD9 = [];
    const lembretesD7 = [];
    const lembretesD2 = [];

    for (const part of parts) {
        // Ignora ruído
        const tipo = (part.tipo_parte || '').toLowerCase();
        if (tipo.includes('cântico') || tipo.includes('cantico') || tipo.includes('oração') || tipo.includes('oracao')) continue;

        const meetingDate = calculateMeetingDate(part.week_id, meetingDays);
        if (!meetingDate) continue;

        let pub = null;
        if (part.resolved_publisher_id) pub = publishers.find(p => p.id === part.resolved_publisher_id);
        if (!pub && part.raw_publisher_name) pub = publishers.find(p => p.name.trim() === part.raw_publisher_name.trim());
        if (!pub || !pub.phone) continue;

        const pubName = pub.name;

        // ----------------------------------------------------
        // 1. Lembretes D-9, D-7, D-2
        // ----------------------------------------------------
        const utcMeeting = Date.UTC(meetingDate.getFullYear(), meetingDate.getMonth(), meetingDate.getDate());
        const diffDaysMeeting = Math.round((utcMeeting - utcToday) / (1000 * 60 * 60 * 24));

        if (['DESIGNADA', 'PROPOSTA'].includes(part.status)) {
            const sentD9 = checkDispatched(part.id, 'LEMBRETE_D9');
            const sentD7 = checkDispatched(part.id, 'LEMBRETE_D7');
            const sentD2 = checkDispatched(part.id, 'LEMBRETE_D2');

            if (diffDaysMeeting >= 9 && diffDaysMeeting <= 10 && !sentD9) {
                lembretesD9.push(`- ${pubName} (${part.tipo_parte}) -> Reunião em ${diffDaysMeeting} dias (${meetingDate.toISOString().split('T')[0]})`);
            } else if (diffDaysMeeting >= 6 && diffDaysMeeting <= 8 && !sentD7) {
                lembretesD7.push(`- ${pubName} (${part.tipo_parte}) -> Reunião em ${diffDaysMeeting} dias (${meetingDate.toISOString().split('T')[0]})`);
            } else if (diffDaysMeeting >= 1 && diffDaysMeeting <= 3 && !sentD2) {
                lembretesD2.push(`- ${pubName} (${part.tipo_parte}) -> Reunião em ${diffDaysMeeting} dias (${meetingDate.toISOString().split('T')[0]})`);
            }
        }

        // ----------------------------------------------------
        // 2. Ping 72h
        // ----------------------------------------------------
        if (part.status === 'PROPOSTA') {
            const s89Sent = checkDispatched(part.id, 'PUBLICACAO_S89');
            if (s89Sent) {
                // Find latest dispatch for this part to this phone
                const latestDispatch = zapiLogs.find(log => 
                    (log.part_id === part.id || log.part_id === `${part.id}-titular` || log.part_id === `${part.id}-ajudante`) &&
                    log.recipient_phone === pub.phone
                );

                if (latestDispatch) {
                    const dispatchTime = new Date(latestDispatch.dispatched_at);
                    const dispatchBRT = new Date(dispatchTime.getTime() - 3 * 60 * 60 * 1000);
                    const utcDispatch = Date.UTC(dispatchBRT.getUTCFullYear(), dispatchBRT.getUTCMonth(), dispatchBRT.getUTCDate());
                    const diffDaysPing = Math.round((utcToday - utcDispatch) / (1000 * 60 * 60 * 24));

                    if (diffDaysPing >= 3) {
                        pings72h.push(`- ${pubName} (${part.tipo_parte}) -> Último contato há ${diffDaysPing} dias (${dispatchBRT.toISOString().split('T')[0]})`);
                    }
                }
            }
        }
    }

    console.log('\n=== LEMBRETES D-9 (Faltam 9-10 dias) ===');
    if (lembretesD9.length) console.log(lembretesD9.join('\n')); else console.log("Nenhum previsto.");
    
    console.log('\n=== LEMBRETES D-7 (Faltam 6-8 dias) ===');
    if (lembretesD7.length) console.log(lembretesD7.join('\n')); else console.log("Nenhum previsto.");
    
    console.log('\n=== LEMBRETES D-2 (Faltam 1-3 dias) ===');
    if (lembretesD2.length) console.log(lembretesD2.join('\n')); else console.log("Nenhum previsto.");
    
    console.log('\n=== COBRANÇAS 72H (Pings para quem está mudo) ===');
    if (pings72h.length) console.log(pings72h.join('\n')); else console.log("Nenhum previsto.");
}

dryRun();
