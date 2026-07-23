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

/** Busca credenciais Z-API via Deno.env com fallback para a tabela app_settings. */
async function getZApiCredentials() {
  // @ts-ignore Deno.env
  let instanceId = Deno.env.get('ZAPI_INSTANCE_ID') || '';
  // @ts-ignore Deno.env
  let instanceToken = Deno.env.get('ZAPI_INSTANCE_TOKEN') || '';
  // @ts-ignore Deno.env
  let clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN') || '';

  if (instanceId && instanceToken && clientToken) {
    return { instanceId, instanceToken, clientToken };
  }

  try {
    // @ts-ignore Deno.env
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    // @ts-ignore Deno.env
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';

    if (supabaseUrl && supabaseKey) {
      const cleanUrl = supabaseUrl.replace(/\/+$/, '');
      const res = await fetch(`${cleanUrl}/rest/v1/app_settings?select=key,value&key=in.(zapi_instance_id,zapi_instance_token,zapi_client_token)`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        }
      });
      if (res.ok) {
        const rows = await res.json();
        const map = new Map<string, string>(rows.map((r: any) => [r.key, r.value]));
        instanceId = instanceId || map.get('zapi_instance_id') || '';
        instanceToken = instanceToken || map.get('zapi_instance_token') || '';
        clientToken = clientToken || map.get('zapi_client_token') || '';
      }
    }
  } catch (err) {
    console.warn('[send-whatsapp] Falha ao carregar credenciais de app_settings:', err);
  }

  if (!instanceId || !instanceToken || !clientToken) {
    return null;
  }
  return { instanceId, instanceToken, clientToken };
}

/** Envia texto via Z-API. */
async function sendViaZApi(phone: string, message: string) {
  const creds = await getZApiCredentials();
  if (!creds) {
    return { success: false, error: 'Z-API não configurada (chaves ausentes no ambiente ou app_settings).' };
  }

  const { instanceId, instanceToken, clientToken } = creds;

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
  const creds = await getZApiCredentials();
  if (!creds) {
    return { success: false, error: 'Z-API não configurada.' };
  }

  const { instanceId, instanceToken, clientToken } = creds;

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
  const creds = await getZApiCredentials();
  if (!creds) return { connected: false, error: 'Z-API não configurada.' };

  const { instanceId, instanceToken, clientToken } = creds;

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
  const creds = await getZApiCredentials();
  if (!creds) return { success: false, error: 'Z-API não configurada.' };

  const { instanceId, instanceToken, clientToken } = creds;

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

/** Enriquece os nomes de perfil (pushName/notifyName) dos participantes usando o cache de chats da Z-API. */
async function enrichZApiParticipants(instanceId: string, instanceToken: string, clientToken: string, participants: any[]) {
  if (!Array.isArray(participants) || participants.length === 0) return [];
  
  const contactsMap = new Map<string, { name?: string; pushName?: string; notifyName?: string }>();
  try {
    const chatsRes = await fetch(
      `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/chats?page=1&pageSize=300`,
      { headers: { 'client-token': clientToken } }
    );
    if (chatsRes.ok) {
      const chats = await chatsRes.json();
      if (Array.isArray(chats)) {
        chats.forEach((c: any) => {
          const rawP = (c.phone || c.id || '').replace(/\D/g, '');
          const cleanP = rawP.startsWith('55') && rawP.length > 11 ? rawP.slice(2) : rawP;
          const info = {
            name: c.name || c.contactName,
            pushName: c.pushName || c.notifyName || c.name,
            notifyName: c.notifyName || c.pushName,
          };
          if (rawP) contactsMap.set(rawP, info);
          if (cleanP) contactsMap.set(cleanP, info);
        });
      }
    }
  } catch (e) {
    console.warn('Falha ao buscar cache de chats Z-API para enriquecimento:', e);
  }

  return participants.map((p: any) => {
    const rawP = (p.phone || p.id || '').replace(/\D/g, '');
    const cleanP = rawP.startsWith('55') && rawP.length > 11 ? rawP.slice(2) : rawP;
    const extra = contactsMap.get(rawP) || contactsMap.get(cleanP);
    const pName = p.name || p.pushName || p.notifyName || extra?.name || extra?.pushName || '';
    const pPush = p.pushName || p.notifyName || extra?.pushName || extra?.notifyName || (typeof pName === 'string' && pName.startsWith('~') ? pName : '');
    return {
      ...p,
      phone: p.phone || p.id || '',
      name: pName || pPush || '',
      pushName: pPush || '',
      notifyName: p.notifyName || extra?.notifyName || '',
    };
  });
}

/** Busca os metadados e membros de um grupo no Z-API por ID ou Nome. */
async function fetchZApiGroupMetadata(groupQuery: string) {
  const creds = await getZApiCredentials();
  if (!creds) {
    return { success: false, error: 'Z-API não configurada (chaves ausentes no ambiente ou app_settings).' };
  }

  const { instanceId, instanceToken, clientToken } = creds;
  const target = (groupQuery || '').trim();

  if (!target) {
    return { success: false, error: 'Nome ou ID do grupo é obrigatório.' };
  }

  // 1. Tentar buscar direto se parecer um ID numérico / @g.us
  try {
    const directRes = await fetch(
      `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/group-metadata/${target}`,
      { headers: { 'client-token': clientToken } }
    );
    if (directRes.ok) {
      const data = await directRes.json();
      const enriched = await enrichZApiParticipants(instanceId, instanceToken, clientToken, data.participants || []);
      return { success: true, groupName: data.name || data.subject || target, participants: enriched };
    }
  } catch (e) {
    // Prossegue para busca na lista de chats
  }

  // 2. Buscar chats para localizar o grupo pelo nome
  try {
    const targetLower = target.toLowerCase();
    for (let page = 1; page <= 10; page++) {
      const chatsRes = await fetch(
        `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/chats?page=${page}&pageSize=100`,
        { headers: { 'client-token': clientToken } }
      );
      if (!chatsRes.ok) break;
      const chats = await chatsRes.json();
      if (!Array.isArray(chats) || chats.length === 0) break;

      const found = chats.find((c: any) =>
        (c.isGroup === true || c.isGroup === 'true') &&
        ((c.name || '').toLowerCase().includes(targetLower) || c.phone === target || c.id === target)
      );

      if (found?.phone || found?.id) {
        const groupId = found.phone || found.id;
        const metaRes = await fetch(
          `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/group-metadata/${groupId}`,
          { headers: { 'client-token': clientToken } }
        );
        if (metaRes.ok) {
          const data = await metaRes.json();
          const enriched = await enrichZApiParticipants(instanceId, instanceToken, clientToken, data.participants || []);
          return { success: true, groupName: data.name || found.name || target, participants: enriched };
        }
      }

      if (chats.length < 100) break;
    }
  } catch (e) {
    return { success: false, error: `Erro ao buscar grupo no Z-API: ${(e as Error).message}` };
  }

  return { success: false, error: `Grupo "${target}" não foi encontrado no Z-API.` };
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
      const status = await checkZApiConnection();
      return new Response(JSON.stringify(status), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── List groups ──
    if (body.action === 'list-groups') {
      const result = await listZApiGroups();
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Fetch group metadata & participants ──
    if (body.action === 'fetch-group-metadata') {
      const groupQuery = body.groupQuery || body.group || '';
      const result = await fetchZApiGroupMetadata(groupQuery);
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
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
      result = await sendImageViaZApi(normalizedPhone, image, caption || '');
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

