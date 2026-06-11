// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDispatched(partId: string, dispatchType: string) {
    const { data } = await supabase
        .from('zapi_dispatch_log')
        .select('id')
        .eq('part_id', partId)
        .eq('dispatch_type', dispatchType)
        .eq('status', 'SUCCESS')
        .maybeSingle();
    return !!data;
}

async function logDispatch(partId: string, dispatchType: string, phone: string, status: string) {
    await supabase.from('zapi_dispatch_log').insert({
        part_id: partId,
        dispatch_type: dispatchType,
        recipient_phone: phone,
        status: status
    });
}

async function sendWhatsApp(phone: string, message: string) {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({ phone, message })
    });
    return res.ok;
}

serve(async (req: Request) => {
    console.log('[cron-whatsapp-reminders] Iniciando rotina...');

    const { data: activeData } = await supabase.from('settings').select('value').eq('key', 'zapi_automation_active').single();
    const isActive = activeData?.value === 'true' || activeData?.value === true;
    
    if (!isActive) {
        console.log('Automação Z-API está desativada.');
        return new Response("Automation is disabled.", { status: 200 });
    }

    // Carrega o offset de dia da reunião (padrão 4 = quinta)
    const { data: meetingDayData } = await supabase.from('settings').select('value').eq('key', 's89_meeting_day_by_week').maybeSingle();
    const meetingDays = meetingDayData?.value || {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Buscar partes designadas
    const { data: parts, error } = await supabase
        .from('workbook_parts')
        .select(`
            id, 
            tipo_parte, 
            titulo_parte, 
            week_id, 
            status, 
            raw_publisher_name,
            profiles (
                id, email, full_name, publisher_id
            )
        `)
        .eq('status', 'DESIGNADA');

    if (error || !parts) {
        return new Response("Failed to fetch parts", { status: 500 });
    }

    const { data: publishers } = await supabase.from('publishers').select('id, name, phone');
    if (!publishers) return new Response("Failed to fetch publishers", { status: 500 });

    let sentCount = 0;

    for (const part of parts) {
        // Calcular a data exata da reunião para esta parte
        const dp = part.week_id.split('-');
        if (dp.length !== 3) continue;
        
        const baseDate = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]));
        const dow = meetingDays[part.week_id] ?? 4;
        const daysToMeeting = (dow - baseDate.getDay() + 7) % 7;
        
        const meetingDate = new Date(baseDate);
        meetingDate.setDate(meetingDate.getDate() + daysToMeeting);
        
        // Calcular diff em dias
        const diffTime = meetingDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        let dispatchType = '';
        let reminderLabel = '';
        
        if (diffDays === 7) {
            dispatchType = 'LEMBRETE_D7';
            reminderLabel = 'faltam apenas 7 dias';
        } else if (diffDays === 2) {
            dispatchType = 'LEMBRETE_D2';
            reminderLabel = 'faltam 2 dias';
        } else if (diffDays === 1) {
            dispatchType = 'LEMBRETE_D1';
            reminderLabel = 'é amanhã';
        }

        if (!dispatchType) continue;

        // Verificar idempotência
        if (await checkDispatched(part.id, dispatchType)) continue;

        // Descobrir telefone do designado
        let phone = '';
        let pubName = part.raw_publisher_name || '';

        // Tenta achar via profile associado
        if (part.profiles && Array.isArray(part.profiles) && part.profiles.length > 0) {
            const pubId = part.profiles[0].publisher_id;
            const pub = publishers.find(p => p.id === pubId);
            if (pub?.phone) {
                phone = pub.phone;
                pubName = pub.name;
            }
        } else if (pubName) {
            // Tenta match por nome
            const pub = publishers.find(p => p.name.trim() === pubName.trim());
            if (pub?.phone) {
                phone = pub.phone;
                pubName = pub.name;
            }
        }

        if (!phone) {
            console.log(`[cron] Sem telefone para o publicador da parte ${part.id}`);
            continue;
        }

        // Construir mensagem
        const msg = `⏳ *Lembrete de Designação*\n\nOlá, ${pubName}!\nLembrando que ${reminderLabel} para sua parte na reunião:\n\n📖 *${part.tipo_parte}*\n${part.titulo_parte ? `🎯 *${part.titulo_parte}*\n` : ''}\nPor favor, garanta que seu preparo ou ensaio estejam em dia. ✨`;

        const success = await sendWhatsApp(phone, msg);
        await logDispatch(part.id, dispatchType, phone, success ? 'SUCCESS' : 'ERROR');
        
        if (success) sentCount++;
    }

    return new Response(JSON.stringify({ success: true, sentCount }), {
        headers: { 'Content-Type': 'application/json' }
    });
});
