import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testDailyCycle() {
    console.log("Fetching part fc2521b1-cd45-436e-b8e1-b81c1679af6a...");
    const { data: part } = await supabase.from('workbook_parts').select('*').eq('id', 'fc2521b1-cd45-436e-b8e1-b81c1679af6a').single();
    if (!part) {
        console.log("Part not found");
        return;
    }
    
    const { data: meetingDayData } = await supabase.from('app_settings').select('value').eq('key', 's89_meeting_day_by_week').maybeSingle();
    const meetingDays = meetingDayData?.value || {};
    
    const dow = meetingDays[part.week_id] ?? 4; 
    const dp = part.week_id.split('-');
    const baseDate = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]));
    const daysToMeeting = (dow - baseDate.getDay() + 7) % 7;
    const meetingDate = new Date(baseDate);
    meetingDate.setDate(meetingDate.getDate() + daysToMeeting);
    
    console.log("Week ID:", part.week_id);
    console.log("Meeting Date:", meetingDate.toISOString());
    
    const nowBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const utcToday = Date.UTC(nowBRT.getUTCFullYear(), nowBRT.getUTCMonth(), nowBRT.getUTCDate());
    const utcMeeting = Date.UTC(meetingDate.getFullYear(), meetingDate.getMonth(), meetingDate.getDate());
    const diffDays = Math.round((utcMeeting - utcToday) / (1000 * 60 * 60 * 24));
    
    console.log("nowBRT:", nowBRT.toISOString());
    console.log("utcToday:", new Date(utcToday).toISOString());
    console.log("utcMeeting:", new Date(utcMeeting).toISOString());
    console.log("diffDays:", diffDays);
    
    const { data: logS89 } = await supabase.from('zapi_dispatch_log').select('id')
        .or(`part_id.eq.${part.id},part_id.eq.${part.id}-titular,part_id.eq.${part.id}-ajudante`)
        .eq('dispatch_type', 'PUBLICACAO_S89')
        .eq('status', 'SUCCESS')
        .limit(1).maybeSingle();
        
    console.log("s89Sent:", !!logS89);
    
    const { data: logD9 } = await supabase.from('zapi_dispatch_log').select('id')
        .or(`part_id.eq.${part.id},part_id.eq.${part.id}-titular,part_id.eq.${part.id}-ajudante`)
        .eq('dispatch_type', 'LEMBRETE_D9')
        .eq('status', 'SUCCESS')
        .limit(1).maybeSingle();
        
    console.log("sentD9:", !!logD9);
    
    let dispatchType = '';
    if (diffDays >= 9 && diffDays <= 10 && !logD9) {
        dispatchType = 'LEMBRETE_D9';
    }
    
    console.log("dispatchType:", dispatchType);
}

testDailyCycle();
