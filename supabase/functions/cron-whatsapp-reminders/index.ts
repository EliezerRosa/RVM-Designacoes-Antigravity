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
    // Proteção do endpoint (verify_jwt=false → público). Se CRON_SECRET estiver
    // configurado como secret da função, exige o header x-cron-secret correspondente.
    // Se não estiver configurado, segue (retrocompatível, não trava o agendador).
    const expectedSecret = Deno.env.get("CRON_SECRET");
    if (expectedSecret) {
        const provided = req.headers.get("x-cron-secret");
        if (provided !== expectedSecret) {
            console.log('[cron-whatsapp-reminders] Acesso negado: x-cron-secret inválido.');
            return new Response("Forbidden", { status: 403 });
        }
    }

    console.log('[cron-whatsapp-reminders] Iniciando rotina...');

    const { data: activeData } = await supabase.from('settings').select('value').eq('key', 'zapi_automation_active').single();
    const isActive = activeData?.value === 'true' || activeData?.value === true;
    
    if (!isActive) {
        console.log('Automação Z-API está desativada.');
        return new Response("Automation is disabled.", { status: 200 });
    }

    // Carrega o dia da reunião por semana a partir de app_settings
    // (tabela onde o modal zap-s-89 salva). Formato: { "2026-06-15": 5 } onde 5 = sexta.
    const { data: meetingDayData } = await supabase.from('app_settings').select('value').eq('key', 's89_meeting_day_by_week').maybeSingle();
    const meetingDays: Record<string, number> = meetingDayData?.value || {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Buscar partes designadas. Identidade atual: workbook_parts.resolved_publisher_id
    // (FK workbook_parts_resolved_publisher_id_fkey -> publishers.id). NÃO existe FK
    // para profiles, então não dá para embutir profiles aqui.
    const { data: parts, error } = await supabase
        .from('workbook_parts')
        .select(`
            id, 
            tipo_parte, 
            part_title, 
            week_id, 
            status, 
            raw_publisher_name,
            resolved_publisher_id
        `)
        .eq('status', 'DESIGNADA');

    if (error || !parts) {
        return new Response("Failed to fetch parts", { status: 500 });
    }

    const { data: publishersRaw } = await supabase.from('publishers').select('id, data');
    if (!publishersRaw) return new Response("Failed to fetch publishers", { status: 500 });

    // Modelo id-only: name/phone vivem dentro de publishers.data (jsonb).
    const publishers = publishersRaw.map((p: any) => ({
        id: p.id,
        name: p.data?.name ?? '',
        phone: p.data?.phone ?? ''
    }));

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
        }

        if (!dispatchType) continue;

        // Verificar idempotência
        if (await checkDispatched(part.id, dispatchType)) continue;

        // Descobrir telefone do designado
        let phone = '';
        let pubName = part.raw_publisher_name || '';

        // 1) Via resolved_publisher_id (FK -> publishers). Fonte de verdade atual.
        if (part.resolved_publisher_id) {
            const pub = publishers.find(p => p.id === part.resolved_publisher_id);
            if (pub?.phone) {
                phone = pub.phone;
                pubName = pub.name;
            }
        }
        // 2) Fallback: match por nome (partes sem resolved_publisher_id).
        if (!phone && pubName) {
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

        // Construir mensagem com dia real da reunião
        const DIAS_PT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
        const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        const meetingDayLabel = `${DIAS_PT[meetingDate.getDay()]}, ${meetingDate.getDate()} de ${MESES_PT[meetingDate.getMonth()]}`;

        const msg = `⏳ *Lembrete de Designação*\n\nOlá, ${pubName}!\nLembrando que ${reminderLabel} para sua parte na reunião de *${meetingDayLabel}*:\n\n📖 *${part.tipo_parte}*\n${part.part_title ? `🎯 *${part.part_title}*\n` : ''}\nPor favor, garanta que seu preparo ou ensaio estejam em dia. ✨`;

        const success = await sendWhatsApp(phone, msg);
        await logDispatch(part.id, dispatchType, phone, success ? 'SUCCESS' : 'ERROR');
        
        if (success) sentCount++;
    }

    return new Response(JSON.stringify({ success: true, sentCount }), {
        headers: { 'Content-Type': 'application/json' }
    });
});
