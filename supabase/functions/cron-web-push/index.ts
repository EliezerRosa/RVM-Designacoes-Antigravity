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

serve(async (req: Request) => {
    // FAIL-CLOSED: exige secret configurado
    const expectedSecret = Deno.env.get("CRON_SECRET");
    if (!expectedSecret || req.headers.get("x-cron-secret") !== expectedSecret) {
        return new Response("Forbidden", { status: 403 });
    }

    const publicVapidKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const privateVapidKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@rvm.local";

    if (!publicVapidKey || !privateVapidKey) {
        return new Response("VAPID keys not configured", { status: 500 });
    }

    webPush.setVapidDetails(subject, publicVapidKey, privateVapidKey);

    // 1. O Postgres faz a fora bruta: retorna apenas as endpoints que precisam receber alerta hoje.
    const { data: alerts, error } = await supabase.rpc('get_pending_push_alerts');
    
    if (error) {
        console.error("Erro ao puxar alertas:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!alerts || alerts.length === 0) {
        return new Response(JSON.stringify({ success: true, sent: 0, reason: 'no pending alerts' }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
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

        const payload = JSON.stringify({
            title: `RVM Designaes: Alerta ${alert.alert_type}`,
            body: alert.message,
            data: { url: '/?portal=my-assignments' }
        });

        try {
            await webPush.sendNotification(pushSubscription, payload);
            sentCount++;
            // TODO: Inserir em alert_notification_log marcando o alert_key como enviado para evitar duplicata.
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
