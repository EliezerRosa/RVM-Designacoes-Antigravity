// ============================================================================
// Edge Function: cron-web-push
//
// Esta funo despacha as Notificaes Web Push pendentes.
// Ela ofload o processamento de regras (D-15, D-9) para a RPC no Postgres,
// e se concentra apenas no envio via web-push.
//
// Dependncias Deno: 
// web-push via esm.sh
// ============================================================================

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Deno import
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Deno import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Deno import
import webPush from "https://esm.sh/web-push@3.6.7";

declare const Deno: { env: { get(name: string): string | undefined } };

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

serve(async (req: Request) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // FAIL-CLOSED: exige secret configurado
    const expectedSecret = Deno.env.get("CRON_SECRET");
    const isCronRequest = req.headers.get("x-cron-secret") === expectedSecret;
    const authHeader = req.headers.get("authorization");

    // Permite invocações do Frontend (com Authorization) ou do Cron (com secret)
    if (!expectedSecret || (!isCronRequest && !authHeader)) {
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    const publicVapidKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const privateVapidKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@rvm.local";

    if (!publicVapidKey || !privateVapidKey) {
        return new Response("VAPID keys not configured", { status: 500 });
    }

    webPush.setVapidDetails(subject, publicVapidKey, privateVapidKey);

    // 1. O Postgres faz o JOIN: retorna apenas os eventos do zapi_dispatch_log
    // que ainda não foram notificados via Web Push.
    const { data: alerts, error } = await supabase.rpc('get_pending_push_events');
    
    if (error) {
        console.error("Erro ao puxar alertas:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }

    if (!alerts || alerts.length === 0) {
        return new Response(JSON.stringify({ success: true, sent: 0, reason: 'no pending alerts' }), {
            status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
    }

    // 2. A Edge Function  s o "Carteiro": faz os POSTs paralelos para Firebase/Mozilla/Apple
    let sentCount = 0;
    const errors: any[] = [];

    const sendPromises = alerts.map(async (alert: any) => {
        const pushSubscription = {
            endpoint: alert.endpoint,
            keys: {
                p256dh: alert.p256dh,
                auth: alert.auth
            }
        };

        let title = 'RVM Designações';
        let body = `Sua designação:\\n📖 ${alert.part_title}\\n📍 ${alert.section}`;
        let url = '/';

        if (alert.dispatch_type.startsWith('PUBLICACAO')) {
            title = 'Nova designação (Ação necessária)';
            body = `Você tem uma nova parte:\\n📖 ${alert.part_title}\\nPor favor, confirme no aplicativo.`;
            if (alert.token) url = `/?portal=confirm&id=${alert.part_id}&publisherId=${alert.publisher_id}&token=${alert.token}`;
        } else if (alert.dispatch_type.startsWith('COBRANCA')) {
            title = 'Confirmação Pendente!';
            body = `Você ainda não confirmou sua parte:\\n📖 ${alert.part_title}\\nClique aqui para confirmar.`;
            if (alert.token) url = `/?portal=confirm&id=${alert.part_id}&publisherId=${alert.publisher_id}&token=${alert.token}`;
        } else if (alert.dispatch_type.startsWith('LEMBRETE')) {
            title = 'Lembrete de Reunião';
        }

        const payload = JSON.stringify({ title, body, data: { url } });

        try {
            await webPush.sendNotification(pushSubscription, payload);
            sentCount++;
            
            // Registra o envio para não duplicar
            const { error: insertErr } = await supabase.from('push_dispatch_log').insert({
                zapi_log_id: alert.zapi_log_id,
                part_id: alert.part_id,
                dispatch_type: alert.dispatch_type,
                publisher_id: alert.publisher_id,
                endpoint: alert.endpoint
            });
            if (insertErr) console.error('Erro ao registrar push_dispatch_log:', insertErr);
        } catch (err: any) {
            console.error(`Erro ao enviar para ${alert.endpoint}:`, err);
            // Se o usurio revogou ou desinstalou o PWA, o endpoint expira (statusCode 404/410)
            if (err.statusCode === 410 || err.statusCode === 404) {
                await supabase.from('push_subscriptions').delete().eq('endpoint', alert.endpoint);
            }
            errors.push(err.message);
        }
    });

    await Promise.all(sendPromises);

    return new Response(JSON.stringify({ 
        success: true, 
        processed: alerts.length, 
        sent: sentCount,
        errors: errors.length > 0 ? errors : undefined
    }), {
        headers: { 'Content-Type': 'application/json' },
    });
});
