/**
 * Supabase Edge Function: send-whatsapp
 *
 * Proxy seguro para envio de WhatsApp via Evolution API ou Meta Cloud API.
 * As chaves de API ficam no servidor (Supabase Secrets), nunca no frontend.
 *
 * Deploy:
 *   supabase functions deploy send-whatsapp --no-verify-jwt
 *
 * Secrets necessárias (configurar via supabase secrets set):
 *   WHATSAPP_PROVIDER         — 'evolution' | 'meta-cloud'
 *   EVOLUTION_BASE_URL        — URL da Evolution API
 *   EVOLUTION_API_KEY         — Chave da Evolution API
 *   EVOLUTION_INSTANCE        — Nome da instância
 *   META_WA_ACCESS_TOKEN      — Token da Meta Cloud API
 *   META_WA_PHONE_NUMBER_ID   — Phone Number ID da Meta
 *
 * Endpoints:
 *   POST /send-whatsapp  { phone, message }            → envia mensagem
 *   POST /send-whatsapp  { action: "check-connection" } → verifica conexão
 */

// @ts-ignore Deno import
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Normaliza telefone BR. */
function normalizePhone(phone: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  digits = digits.replace(/^0+/, '');
  if (digits.length <= 11 && !digits.startsWith('55')) {
    digits = '55' + digits;
  }
  return digits;
}

/** Envia via Evolution API. */
async function sendViaEvolution(phone: string, message: string) {
  // @ts-ignore Deno.env
  const baseUrl = (Deno.env.get('EVOLUTION_BASE_URL') || '').replace(/\/+$/, '');
  // @ts-ignore Deno.env
  const apiKey = Deno.env.get('EVOLUTION_API_KEY') || '';
  // @ts-ignore Deno.env
  const instance = Deno.env.get('EVOLUTION_INSTANCE') || 'default';

  if (!baseUrl || !apiKey) {
    return { success: false, error: 'Evolution API não configurada (faltam EVOLUTION_BASE_URL ou EVOLUTION_API_KEY).' };
  }

  const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({ number: phone, text: message }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { success: false, error: `Evolution ${res.status}: ${body}` };
  }

  const data = await res.json();
  return {
    success: true,
    messageId: data.key?.id || data.messageId || undefined,
    provider: 'evolution',
  };
}

/** Envia via Meta Cloud API. */
async function sendViaMeta(phone: string, message: string) {
  // @ts-ignore Deno.env
  const accessToken = Deno.env.get('META_WA_ACCESS_TOKEN') || '';
  // @ts-ignore Deno.env
  const phoneNumberId = Deno.env.get('META_WA_PHONE_NUMBER_ID') || '';

  if (!accessToken || !phoneNumberId) {
    return { success: false, error: 'Meta Cloud API não configurada (faltam META_WA_ACCESS_TOKEN ou META_WA_PHONE_NUMBER_ID).' };
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { body: message },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { success: false, error: `Meta API ${res.status}: ${body}` };
  }

  const data = await res.json();
  return {
    success: true,
    messageId: data.messages?.[0]?.id,
    provider: 'meta-cloud',
  };
}

/** Verifica conexão da Evolution API. */
async function checkEvolutionConnection() {
  // @ts-ignore Deno.env
  const baseUrl = (Deno.env.get('EVOLUTION_BASE_URL') || '').replace(/\/+$/, '');
  // @ts-ignore Deno.env
  const apiKey = Deno.env.get('EVOLUTION_API_KEY') || '';
  // @ts-ignore Deno.env
  const instance = Deno.env.get('EVOLUTION_INSTANCE') || 'default';

  if (!baseUrl) return { connected: false, error: 'EVOLUTION_BASE_URL não configurada.' };

  const res = await fetch(`${baseUrl}/instance/connectionState/${instance}`, {
    headers: { apikey: apiKey },
  });

  if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };

  const data = await res.json();
  const state = data.instance?.state || data.state;
  return {
    connected: state === 'open',
    instanceName: instance,
    phoneNumber: data.instance?.phoneNumber,
  };
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    // @ts-ignore Deno.env
    const provider = Deno.env.get('WHATSAPP_PROVIDER') || 'evolution';

    // ── Check connection ──
    if (body.action === 'check-connection') {
      if (provider === 'evolution') {
        const status = await checkEvolutionConnection();
        return new Response(JSON.stringify(status), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ connected: true, provider }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Send message ──
    const { phone, message } = body;

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Campos "phone" e "message" são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedPhone = normalizePhone(phone);

    let result;
    if (provider === 'meta-cloud') {
      result = await sendViaMeta(normalizedPhone, message);
    } else {
      result = await sendViaEvolution(normalizedPhone, message);
    }

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
