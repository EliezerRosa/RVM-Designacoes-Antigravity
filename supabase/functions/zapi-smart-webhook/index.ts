// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ============================================================================
// Supabase Client Initialization
// ============================================================================
// @ts-ignore
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
// @ts-ignore
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================================
// Tipos e Helpers
// ============================================================================
interface ZApiPayload {
  phone?: string;
  senderPhone?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  messageId?: string;
  referenceMessageId?: string;
  type?: string;
  text?: { message?: string };
  message?: string;
  quotedMsg?: {
    messageId?: string;
    caption?: string;
    text?: string;
  };
  buttonsResponseMessage?: {
    buttonId?: string;
    message?: string;
  };
  reaction?: {
    value?: string;
    messageId?: string;
  };
  reactionMessage?: {
    value?: string;
    messageId?: string;
  };
}

/** Limpa e normaliza telefone para comparação flexível (últimos 8 ou 9 dígitos) */
function cleanPhoneDigits(raw: string): string {
  if (!raw) return "";
  return raw.replace(/\D/g, "").replace(/^55/, "").replace(/^0+/, "");
}

function phoneMatches(phoneA?: string, phoneB?: string): boolean {
  if (!phoneA || !phoneB) return false;
  const a = cleanPhoneDigits(phoneA);
  const b = cleanPhoneDigits(phoneB);
  if (a === b) return true;
  // Comparação pelos últimos 8 dígitos (ignora variação do 9º dígito móvel)
  if (a.length >= 8 && b.length >= 8) {
    return a.slice(-8) === b.slice(-8);
  }
  return false;
}

serve(async (req: Request) => {
  const startTime = Date.now();

  // Responder OPTIONS para CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const payload: ZApiPayload = await req.json();
    console.log("[zapi-smart-webhook] Payload recebido:", JSON.stringify(payload));

    // Ignora mensagens enviadas pelo próprio bot ou de grupos (a menos que seja menção)
    if (payload.fromMe === true || payload.isGroup === true) {
      return new Response(JSON.stringify({ ignored: true, reason: "fromMe or isGroup" }), { status: 200 });
    }

    const senderPhone = payload.phone || payload.senderPhone || "";
    if (!senderPhone) {
      return new Response(JSON.stringify({ ignored: true, reason: "No sender phone" }), { status: 200 });
    }

    const inboundMessageId = payload.messageId || "";
    let matchedBy = "UNMATCHED";
    let detectedIntent = "OUTRO";
    let confidence = 1.0;
    let actionTaken = "IGNORED";
    let reasonExtracted: string | null = null;
    let outboundReply: string | null = null;

    let targetPartId: string | null = null;
    let targetPart: any = null;
    let publisherData: any = null;

    // --------------------------------------------------------------------------
    // 1. Identificar o Publicador pelo Telefone
    // --------------------------------------------------------------------------
    const { data: allPubs } = await supabase.from("publishers").select("id, data");
    if (allPubs && allPubs.length > 0) {
      for (const p of allPubs) {
        const pPhone = p.data?.phone || p.data?.contact_phone || "";
        if (phoneMatches(senderPhone, pPhone)) {
          publisherData = {
            id: p.id,
            name: p.data?.name || "Irmão(ã)",
            gender: p.data?.gender || "brother",
            phone: pPhone,
          };
          break;
        }
      }
    }

    const pubName = publisherData?.name || "Irmão(ã)";

    // --------------------------------------------------------------------------
    // 2. Resolução do Contexto (Botão, Reação, QuotedMsg ou Janela Temporal)
    // --------------------------------------------------------------------------
    const buttonId = payload.buttonsResponseMessage?.buttonId;
    const buttonMessage = payload.buttonsResponseMessage?.message || "";
    const reactionVal = payload.reaction?.value || payload.reactionMessage?.value;
    const reactionMsgId = payload.reaction?.messageId || payload.reactionMessage?.messageId;
    const quotedMsgId = payload.quotedMsg?.messageId || payload.referenceMessageId;
    const inboundText = (payload.text?.message || payload.message || buttonMessage || "").trim();

    // VIA A: Botão Clicado
    if (buttonId) {
      matchedBy = "BUTTON";
      if (buttonId.startsWith("CONFIRMAR:")) {
        detectedIntent = "CONFIRMAR";
        targetPartId = buttonId.replace("CONFIRMAR:", "").trim();
      } else if (buttonId.startsWith("RECUSAR:")) {
        detectedIntent = "RECUSAR";
        targetPartId = buttonId.replace("RECUSAR:", "").trim();
      } else if (buttonId.startsWith("DISPONIBILIDADE:")) {
        detectedIntent = "DISPONIBILIDADE";
        targetPartId = buttonId.replace("DISPONIBILIDADE:", "").trim();
      }
    }

    // VIA B: Reação com Emoji no S-89
    else if (reactionVal && reactionMsgId) {
      matchedBy = "REACTION";
      // Localiza o part_id em zapi_dispatch_log pelo message_id
      const { data: logEntry } = await supabase
        .from("zapi_dispatch_log")
        .select("part_id")
        .eq("message_id", reactionMsgId)
        .maybeSingle();

      if (logEntry?.part_id) {
        targetPartId = logEntry.part_id.replace(/-(titular|ajudante)$/i, "");
      }

      const positiveEmojis = ["👍", "✅", "❤️", "🙏", "👏", "👌"];
      const negativeEmojis = ["👎", "❌", "🚫", "🙅‍♂️", "🙅‍♀️"];

      if (positiveEmojis.includes(reactionVal)) {
        detectedIntent = "CONFIRMAR";
      } else if (negativeEmojis.includes(reactionVal)) {
        detectedIntent = "RECUSAR";
      }
    }

    // VIA C: Citação de Mensagem (Quoted Message)
    else if (quotedMsgId) {
      matchedBy = "QUOTED_MSG";
      const { data: logEntry } = await supabase
        .from("zapi_dispatch_log")
        .select("part_id")
        .eq("message_id", quotedMsgId)
        .maybeSingle();

      if (logEntry?.part_id) {
        targetPartId = logEntry.part_id.replace(/-(titular|ajudante)$/i, "");
      }
    }

    // VIA D: Resolução por Janela Temporal (Publicador respondeu normalmente)
    if (!targetPartId && publisherData?.id) {
      matchedBy = "TEMPORAL_WINDOW";
      // Busca designações pendentes ('ENVIADA') do publicador
      const { data: pendingParts } = await supabase
        .from("workbook_parts")
        .select("*")
        .eq("resolved_publisher_id", String(publisherData.id))
        .eq("status", "ENVIADA")
        .order("date", { ascending: true })
        .limit(1);

      if (pendingParts && pendingParts.length > 0) {
        targetPart = pendingParts[0];
        targetPartId = targetPart.id;
      }
    }

    // Se encontramos targetPartId mas ainda não carregamos targetPart, carrega do DB
    if (targetPartId && !targetPart) {
      const realId = targetPartId.replace(/-(titular|ajudante)$/i, "");
      const { data: pData } = await supabase
        .from("workbook_parts")
        .select("*")
        .eq("id", realId)
        .maybeSingle();
      if (pData) targetPart = pData;
    }

    // --------------------------------------------------------------------------
    // 3. Classificação de Intenção por Texto (se não foi botão/reação direta)
    // --------------------------------------------------------------------------
    if (detectedIntent === "OUTRO" && inboundText) {
      const lower = inboundText.toLowerCase();

      // Regras heurísticas de alta precisão
      const isConfirm = /\b(confirmo|confirmar|confirmado|estarei|vou fazer|fa[cç]o|pode contar|sim|ok|beleza|certo)\b/i.test(lower);
      const isDecline = /\b(n[aã]o posso|n[aã]o vou|n[aã]o poderei|doente|gripe|dengue|febre|viagem|viajando|plant[aã]o|imposs[ií]vel|recusar|rejeitar)\b/i.test(lower);
      const isAvailability = /\b(disponib\w*|agenda\w*|f[eé]rias|datas|ausente\w*|aus[eê]ncia\w*)/i.test(lower);
      const isSwap = /\b(troc\w*|permut\w*|passar para|substitu\w*)/i.test(lower);

      if (isAvailability) {
        detectedIntent = "DISPONIBILIDADE";
      } else if (isSwap) {
        detectedIntent = "PERMUTA";
      } else if (isDecline) {
        detectedIntent = "RECUSAR";
        // Extrai o motivo do próprio texto
        reasonExtracted = inboundText;
      } else if (isConfirm) {
        detectedIntent = "CONFIRMAR";
      }
    }

    console.log(`[zapi-smart-webhook] Intent: ${detectedIntent}, MatchedBy: ${matchedBy}, PartId: ${targetPartId}`);

    // --------------------------------------------------------------------------
    // 4. Fechamento de Ciclo (Ações e Respostas)
    // --------------------------------------------------------------------------

    // CENÁRIO 1: CONFIRMAÇÃO
    if (detectedIntent === "CONFIRMAR") {
      if (targetPart && targetPart.status === "ENVIADA") {
        // Concorrência segura: atualiza status para DESIGNADA
        await supabase
          .from("workbook_parts")
          .update({
            status: "DESIGNADA",
            status_changed_at: new Date().toISOString(),
          })
          .eq("id", targetPart.id)
          .eq("status", "ENVIADA");

        actionTaken = "STATUS_DESIGNADA";
      } else {
        actionTaken = "ALREADY_PROCESSED";
      }

      const tipoParte = targetPart?.tipo_parte || targetPart?.part_title || "Designação";
      outboundReply = `✅ *Confirmação Registrada!*\n\nFicamos muito felizes, Irmão(ã) *${pubName}*! Sua designação de *${tipoParte}* está confirmada no programa da reunião.\n\nQue Jeová abençoe sua preparação! 🙏`;

      await dispatchTextMessage(senderPhone, outboundReply);
    }

    // CENÁRIO 2: RECUSA
    else if (detectedIntent === "RECUSAR") {
      const reason = reasonExtracted || "Impossibilidade informada via WhatsApp.";

      if (targetPart) {
        await supabase
          .from("workbook_parts")
          .update({
            status: "REJEITADA",
            needs_reassignment: true,
            had_refusal: true,
            rejected_reason: reason,
            status_changed_at: new Date().toISOString(),
          })
          .eq("id", targetPart.id);

        // Grava no log histórico de recusas
        await supabase.from("refusal_logs").insert({
          part_id: targetPart.id,
          publisher_name: pubName,
          reason: reason,
          week_id: targetPart.week_id,
          tipo_parte: targetPart.tipo_parte || targetPart.part_title,
        });

        actionTaken = "STATUS_REJEITADA";
      }

      // Se o motivo ainda não foi informado (veio apenas pelo clique de botão)
      if (!reasonExtracted) {
        outboundReply = `Irmão(ã) *${pubName}*, registramos que você não poderá realizar esta designação.\n\nPor favor, informe em poucas palavras o *motivo* para informarmos ao *Superintendente (SRVM)* e ao *Ajudante do SRVM*.`;
        await dispatchTextMessage(senderPhone, outboundReply);
      } else {
        // Motivo já fornecido: acolhe o publicador
        outboundReply = `Agradecemos por avisar com antecedência, Irmão(ã) *${pubName}*! Registramos sua justificativa e providenciaremos a substituição. Desejamos tudo de bom e uma pronta recuperação! 💛`;
        await dispatchTextMessage(senderPhone, outboundReply);

        // 🚨 DISPARO IMEDIATO DE ALERTA EXCLUSIVO PARA SRVM, AJUDANTE E ADMINS
        await dispatchAlertToLeadership(targetPart, pubName, reason);
      }
    }

    // CENÁRIO 3: DISPONIBILIDADE
    else if (detectedIntent === "DISPONIBILIDADE") {
      actionTaken = "DISPONIBILIDADE_REQUESTED";
      const appUrl = "https://rvm-designacoes-antigravity.vercel.app";
      // Busca ou cria token de disponibilidade
      const token = publisherData?.id ? await getOrCreateAvailabilityToken(publisherData.id, pubName) : "";
      const link = token ? `${appUrl}/?portal=availability&token=${token}` : `${appUrl}/`;

      outboundReply = `📅 *Atualização de Disponibilidade*\n\nIrmão(ã) *${pubName}*, toque no link abaixo para marcar as semanas em que você estará ausente ou disponível nos próximos meses:\n\n👉 ${link}\n\n_As datas marcadas são bloqueadas automaticamente pelo motor de designações do RVM._`;
      await dispatchTextMessage(senderPhone, outboundReply);
    }

    // CENÁRIO 4: PERMUTA (TROCA COM OUTRO IRMÃO)
    else if (detectedIntent === "PERMUTA") {
      actionTaken = "SWAP_REQUESTED";
      outboundReply = `Irmão(ã) *${pubName}*, registramos o seu pedido de troca!\n\nEncaminhamos a solicitação para avaliação de *O Superintendente (SRVM)* e do *Ajudante do SRVM*. Lembramos que toda troca precisa da aprovação deles para ter validade oficial no programa.\n\nAssim que avaliarem no RVM, você será avisado(a)! 🙏`;
      await dispatchTextMessage(senderPhone, outboundReply);

      // Alerta a liderança sobre a tentativa de permuta
      await dispatchSwapAlertToLeadership(targetPart, pubName, inboundText);
    }

    // --------------------------------------------------------------------------
    // 5. Auditoria na Tabela zapi_smart_interactions
    // --------------------------------------------------------------------------
    const processingTimeMs = Date.now() - startTime;
    await supabase.from("zapi_smart_interactions").insert({
      phone: senderPhone,
      publisher_id: publisherData?.id || null,
      publisher_name: pubName,
      workbook_part_id: targetPart?.id || null,
      inbound_message_id: inboundMessageId,
      inbound_text: inboundText,
      raw_payload: payload,
      matched_by: matchedBy,
      detected_intent: detectedIntent,
      confidence: confidence,
      action_taken: actionTaken,
      reason_extracted: reasonExtracted,
      outbound_reply_text: outboundReply,
      processing_time_ms: processingTimeMs,
    });

    return new Response(JSON.stringify({ success: true, intent: detectedIntent, action: actionTaken }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[zapi-smart-webhook] Erro ao processar webhook:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500 });
  }
});

// ============================================================================
// Funções Auxiliares de Envio e Notificação
// ============================================================================

/** Dispara mensagem de texto via Edge Function send-whatsapp */
async function dispatchTextMessage(phone: string, message: string) {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        action: "send-text",
        phone: phone,
        message: message,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("[zapi-smart-webhook] Falha ao enviar mensagem:", err);
    return false;
  }
}

/**
 * Dispara alerta de recusa EXCLUSIVAMENTE para:
 * 1. O Superintendente (SRVM)
 * 2. Ajudante do SRVM
 * 3. Admins
 * (CS - Comissão de Serviço - é estritamente excluída)
 */
async function dispatchAlertToLeadership(part: any, publisherName: string, reason: string) {
  try {
    const { data: publishers } = await supabase.from("publishers").select("data");
    if (!publishers || publishers.length === 0) return;

    const targetPhones = new Set<string>();

    for (const pub of publishers) {
      const data = pub.data || {};
      const funcao = data.funcao || "";
      const role = data.role || "";
      const phone = data.phone || data.contact_phone;

      if (!phone) continue;

      // Invariante Estrito:
      const isSrvm = funcao.includes("Superintendente da Reunião Vida e Ministério") && !funcao.includes("Ajudante");
      const isAjdSrvm = funcao.includes("Ajudante do Superintendente da Reunião Vida e Ministério");
      const isAdmin = role === "admin";

      if (isSrvm || isAjdSrvm || isAdmin) {
        targetPhones.add(phone);
      }
    }

    const tipoParte = part?.tipo_parte || part?.part_title || "Designação";
    const dataPart = part?.date || part?.week_id || "Próxima reunião";

    const alertMessage =
      `🚨 *ALERTA DE RECUSA — REUNIÃO VIDA E MINISTÉRIO*\n\n` +
      `👤 *Publicador:* ${publisherName}\n` +
      `📝 *Parte:* ${tipoParte}\n` +
      `📅 *Data/Semana:* ${dataPart}\n` +
      `💬 *Motivo informado:* "${reason}"\n\n` +
      `⚡ *Ação no Sistema:* A parte foi marcada como REJEITADA e já aguarda novo publicador no Painel de Designações.`;

    for (const phone of targetPhones) {
      await dispatchTextMessage(phone, alertMessage);
    }
  } catch (err) {
    console.error("[zapi-smart-webhook] Falha ao alertar liderança:", err);
  }
}

/** Alerta sobre tentativa de permuta (troca) */
async function dispatchSwapAlertToLeadership(part: any, publisherName: string, swapDetails: string) {
  try {
    const { data: publishers } = await supabase.from("publishers").select("data");
    if (!publishers || publishers.length === 0) return;

    const targetPhones = new Set<string>();

    for (const pub of publishers) {
      const data = pub.data || {};
      const funcao = data.funcao || "";
      const role = data.role || "";
      const phone = data.phone || data.contact_phone;

      if (!phone) continue;

      const isSrvm = funcao.includes("Superintendente da Reunião Vida e Ministério") && !funcao.includes("Ajudante");
      const isAjdSrvm = funcao.includes("Ajudante do Superintendente da Reunião Vida e Ministério");
      const isAdmin = role === "admin";

      if (isSrvm || isAjdSrvm || isAdmin) {
        targetPhones.add(phone);
      }
    }

    const tipoParte = part?.tipo_parte || part?.part_title || "Designação";
    const dataPart = part?.date || part?.week_id || "Próxima reunião";

    const alertMessage =
      `🔄 *PEDIDO DE PERMUTA (TROCA) — RVM*\n\n` +
      `👤 *Publicador:* ${publisherName}\n` +
      `📝 *Parte:* ${tipoParte}\n` +
      `📅 *Data/Semana:* ${dataPart}\n` +
      `💬 *Mensagem do Publicador:* "${swapDetails}"\n\n` +
      `⚠️ *Nota:* Nenhuma alteração foi feita no RVM. A troca aguarda aprovação da comissão no Painel de Designações.`;

    for (const phone of targetPhones) {
      await dispatchTextMessage(phone, alertMessage);
    }
  } catch (err) {
    console.error("[zapi-smart-webhook] Falha ao alertar liderança sobre permuta:", err);
  }
}

/** Gera ou recupera token de disponibilidade existente */
async function getOrCreateAvailabilityToken(publisherId: string, publisherName: string): Promise<string> {
  try {
    const { data: settingsData } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "availability_tokens")
      .maybeSingle();

    let tokens: any[] = settingsData?.value || [];
    if (!Array.isArray(tokens)) tokens = [];

    const existing = tokens.find((t: any) => t.publisherId === publisherId && t.active);
    if (existing?.token) return existing.token;

    // Gera novo token
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    const newToken = Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");

    tokens.push({
      token: newToken,
      publisherId,
      publisherName,
      createdAt: new Date().toISOString(),
      active: true,
    });

    await supabase.from("settings").upsert({
      key: "availability_tokens",
      value: tokens,
    });

    return newToken;
  } catch {
    return "";
  }
}
