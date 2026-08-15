// ============================================================================
// Edge Function: push-subscribe
//
// Parte da funcionalidade "Notificações de Alertas e Agendas" (desacoplada).
// Gerencia inscrições Web Push (notificações nativas do SO):
//   GET  ? { publicKey }                          (chave VAPID pública p/ o frontend)
//   POST { action:'subscribe', subscription }     (upsert por endpoint)
//   POST { action:'unsubscribe', endpoint }       (remove)
//
// Secrets necessárias:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  (gerar com: npx web-push generate-vapid-keys)
// ============================================================================

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Deno import
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Deno import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

declare const Deno: { env: { get(name: string): string | undefined } };

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    if (req.method === 'GET') {
        const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
        if (!publicKey) return json({ error: 'VAPID não configurado.' }, 503);
        return json({ publicKey });
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let body: {
        action?: string;
        endpoint?: string;
        publisherId?: string;
        userAgent?: string;
        subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'JSON inválido.' }, 400);
    }

    if (body.action === 'subscribe') {
        const sub = body.subscription;
        if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
            return json({ error: 'Subscription incompleta.' }, 400);
        }
        const { error } = await supabase.from('push_subscriptions').upsert({
            endpoint: sub.endpoint,
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
            publisher_id: body.publisherId || null,
            user_agent: body.userAgent || null,
        }, { onConflict: 'endpoint' });
        if (error) return json({ error: error.message }, 500);
        return json({ success: true });
    }

    if (body.action === 'unsubscribe') {
        if (!body.endpoint) return json({ error: 'endpoint obrigatório.' }, 400);
        const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', body.endpoint);
        if (error) return json({ error: error.message }, 500);
        return json({ success: true });
    }

    return json({ error: 'action inválida.' }, 400);
});
