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

/**
 * Normaliza o destino. Para telefones BR aplica as regras usuais (55 + DDD).
 * Para destinos de GRUPO do WhatsApp, preserva o ID — a função permanece
 * desacoplada (não sabe o que envia), só não mutila um destino de grupo:
 *  - "<id>@g.us"  -> mantém apenas o ID numérico (formato aceito pela Z-API)
 *  - "<id>-group" / "<id>-<ts>" (formato legado) -> mantém como veio
 *  - ID numérico longo (>13 dígitos) -> é grupo, não é telefone BR
 */
function normalizePhone(phone: string): string {
  const raw = (phone || '').trim();
  if (raw.includes('@g.us')) return raw.split('@')[0].replace(/\D/g, '');
  if (raw.includes('-')) return raw;

  let digits = raw.replace(/\D/g, '');
  if (digits.length > 13) return digits; // ID de grupo numérico, não telefone BR
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

/** Envia texto via Z-API. */
async function sendViaZApi(phone: string, message: string) {
  // @ts-ignore Deno.env
  const instanceId = Deno.env.get('ZAPI_INSTANCE_ID') || '';
  // @ts-ignore Deno.env
  const instanceToken = Deno.env.get('ZAPI_INSTANCE_TOKEN') || '';
  // @ts-ignore Deno.env
  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN') || '';

  if (!instanceId || !instanceToken || !clientToken) {
    return { success: false, error: 'Z-API não configurada (faltam ZAPI_INSTANCE_ID, TOKEN ou CLIENT_TOKEN).' };
  }

  const res = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/send-text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'client-token': clientToken,
    },
    body: JSON.stringify({ phone, message }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { success: false, error: `Z-API ${res.status}: ${body}` };
  }

  const data = await res.json();
  return { success: true, messageId: data.messageId, provider: 'z-api' };
}

/** Envia imagem via Z-API. */
async function sendImageViaZApi(phone: string, imageBase64: string, caption: string) {
  // @ts-ignore Deno.env
  const instanceId = Deno.env.get('ZAPI_INSTANCE_ID') || '';
  // @ts-ignore Deno.env
  const instanceToken = Deno.env.get('ZAPI_INSTANCE_TOKEN') || '';
  // @ts-ignore Deno.env
  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN') || '';

  if (!instanceId || !instanceToken || !clientToken) {
    return { success: false, error: 'Z-API não configurada.' };
  }

  // Se vier "data:image/png;base64,xxxxx", extrai o xxxxx
  const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;

  const res = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/send-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'client-token': clientToken,
    },
    body: JSON.stringify({
      phone,
      image: `data:image/png;base64,${base64Data}`,
      caption,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { success: false, error: `Z-API ${res.status}: ${body}` };
  }

  const data = await res.json();
  return { success: true, messageId: data.messageId, provider: 'z-api' };
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

/** Verifica conexão da Z-API. */
async function checkZApiConnection() {
  // @ts-ignore Deno.env
  const instanceId = Deno.env.get('ZAPI_INSTANCE_ID') || '';
  // @ts-ignore Deno.env
  const instanceToken = Deno.env.get('ZAPI_INSTANCE_TOKEN') || '';
  // @ts-ignore Deno.env
  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN') || '';

  if (!instanceId) return { connected: false, error: 'ZAPI_INSTANCE_ID não configurado.' };

  const res = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/status`, {
    headers: { 'client-token': clientToken },
  });

  if (!res.ok) {
    const rawBody = await res.text();
    return { connected: false, error: `HTTP ${res.status}`, zapiBody: rawBody };
  }

  const data = await res.json();
  return {
    connected: data.connected ?? false,
    phoneNumber: data.phone,
  };
}

/** Lista os grupos do WhatsApp via Z-API (capability genérica do provider). */
async function listZApiGroups() {
  // @ts-ignore Deno.env
  const instanceId = Deno.env.get('ZAPI_INSTANCE_ID') || '';
  // @ts-ignore Deno.env
  const instanceToken = Deno.env.get('ZAPI_INSTANCE_TOKEN') || '';
  // @ts-ignore Deno.env
  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN') || '';

  if (!instanceId) return { success: false, error: 'ZAPI_INSTANCE_ID não configurado.' };

  const groups: Array<{ id: string; name: string }> = [];
  // Pagina os chats e filtra isGroup. pageSize alto para reduzir chamadas.
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(
      `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/chats?page=${page}&pageSize=100`,
      { headers: { 'client-token': clientToken } }
    );
    if (!res.ok) {
      const rawBody = await res.text();
      return { success: false, error: `HTTP ${res.status}`, zapiBody: rawBody };
    }
    const chats = await res.json();
    if (!Array.isArray(chats) || chats.length === 0) break;
    for (const c of chats) {
      const isGroup = c.isGroup === true || c.isGroup === 'true';
      if (isGroup) groups.push({ id: c.phone, name: c.name });
    }
    if (chats.length < 100) break;
  }
  return { success: true, groups };
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
      if (provider === 'z-api') {
        const status = await checkZApiConnection();
        return new Response(JSON.stringify(status), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ connected: true, provider }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── List groups (capability genérica; usada p/ descobrir o ID do grupo "Avisos") ──
    if (body.action === 'list-groups') {
      if (provider !== 'z-api') {
        return new Response(
          JSON.stringify({ success: false, error: `list-groups só suportado no provider z-api (atual: ${provider}).` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const result = await listZApiGroups();
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { phone, message, image, caption, action } = body;

    if (!phone) {
      return new Response(
        JSON.stringify({ success: false, error: 'Campo "phone" é obrigatório.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedPhone = normalizePhone(phone);
    let result;

    if (action === 'send-image' || image) {
      if (!image) {
        return new Response(
          JSON.stringify({ success: false, error: 'Campo "image" é obrigatório para envio de imagem.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (provider === 'z-api') {
        result = await sendImageViaZApi(normalizedPhone, image, caption || '');
      } else {
        return new Response(
          JSON.stringify({ success: false, error: `Provedor ${provider} ainda não suporta send-image na Edge Function.` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      if (!message) {
        return new Response(
          JSON.stringify({ success: false, error: 'Campo "message" é obrigatório para envio de texto.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (provider === 'meta-cloud') {
        result = await sendViaMeta(normalizedPhone, message);
      } else if (provider === 'z-api') {
        result = await sendViaZApi(normalizedPhone, message);
      } else {
        result = await sendViaEvolution(normalizedPhone, message);
      }
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
