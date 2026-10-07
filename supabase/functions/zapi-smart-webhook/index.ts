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

/** Saudação dinâmica pelo fuso horário de Brasília (UTC-3) */
function getGreeting(): string {
    const now = new Date();
    const brasiliaHour = (now.getUTCHours() - 3 + 24) % 24;
    if (brasiliaHour >= 5 && brasiliaHour < 12) return 'Bom dia';
    if (brasiliaHour >= 12 && brasiliaHour < 18) return 'Boa tarde';
    return 'Boa noite';
}

/** Pronome pelo gênero do publisher */
function getHonorific(gender?: string): string {
    return gender === 'sister' ? 'Irmã' : 'Irmão';
}

/** 
 * PROTOCOLO B: Verificação JEV AI via OpenRouter 
 * Evita Ejeto Incorreto de Repasses (Proxies) e Datas Incompatíveis.
 */
export interface TruthAnalysis {
  id_designacao_identificada: string | null;
  percentual_verdade: number;
  classificacao: 'ALTA_PLAUSIBILIDADE' | 'MEDIANA' | 'INCONSISTENTE' | 'DIVERGENCIA_CRITICA' | 'FALSO_ALUCINACAO';
  fatores_convergentes: string[];
  fatores_divergentes: string[];
  analise_sintetica: string;
  sugestao_acao: 'APROVAR_AUTOMATICO' | 'SOLICITAR_CONFIRMACAO' | 'NOTIFICAR_COORDENADOR' | 'RECUSAR';
}

/**
 * PROTOCOLO B: MOTOR DETERMINÍSTICO (JEV AI - System One)
 * Seleciona a designação correta e calcula o score de veracidade e coerência.
 */
async function verifyIntentWithAI(
  inboundText: string,
  detectedIntent: string,
  publisherName: string,
  upcomingPartsList: any[],
  chatHistory: string[] = []
): Promise<TruthAnalysis> {
  // @ts-ignore
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    console.log("[zapi-smart-webhook] OPENROUTER_API_KEY não encontrada, pulando Protocolo B.");
    return {
      id_designacao_identificada: upcomingPartsList.length > 0 ? String(upcomingPartsList[0].id) : null,
      percentual_verdade: 100,
      classificacao: "ALTA_PLAUSIBILIDADE",
      fatores_convergentes: ["Bypass - API Key missing"],
      fatores_divergentes: [],
      analise_sintetica: "Fallback Heurístico de Segurança",
      sugestao_acao: "APROVAR_AUTOMATICO"
    };
  }

  try {
    const historyText = chatHistory.length > 0 
      ? `\n\n--- HISTÓRICO DE MENSAGENS RECENTES (Cronológico) ---\n${chatHistory.join("\n")}\n--------------------------------------------------------------\n` 
      : "";

    // Mapeamento simplificado para a IA consumir
    const listaDesignacoes = upcomingPartsList.map(p => ({
      id: String(p.id),
      data: p.date,
      semana: p.week_display,
      titulo: p.part_title,
      tipo_parte: p.tipo_parte
    }));

    const payload = {
      mensagemRecebida: inboundText,
      contexto: {
        nomePublicador: publisherName,
        intencaoPrimariaDetectada: detectedIntent,
        designacoesAgendadas: listaDesignacoes
      },
      historicoChat: historyText || "Nenhum histórico recente."
    };

    const SYSTEM_PROMPT = `Você atua como Jev AI, um motor determinístico de verificação de coerência factual e plausibilidade para o Protocolo B (System One).

TAREFA: Leia a mensagem avulsa do publicador e cruze-a com a lista de "designacoesAgendadas".
Primeiro: Identifique a qual designação (id) ele está se referindo com base em datas, meses ou tipo de parte mencionados no texto.
Segundo: Calcule o percentual de plausibilidade e correspondência fática (0 a 100%) da mensagem em relação à designação identificada.

REGRAS ESTRITAS:
- Retorne EXCLUSIVAMENTE um objeto JSON estrito com os seguintes campos (tipos exatos):
  - id_designacao_identificada (string do ID ou null se a mensagem fala de uma data inexistente na lista)
  - percentual_verdade (number 0 a 100)
  - classificacao ("ALTA_PLAUSIBILIDADE" | "MEDIANA" | "INCONSISTENTE" | "DIVERGENCIA_CRITICA" | "FALSO_ALUCINACAO")
  - fatores_convergentes (array de strings curtas)
  - fatores_divergentes (array de strings curtas indicando por que a data não bate ou se parece recado de terceiro)
  - analise_sintetica (string fria com max 20 palavras explicando a decisão)
  - sugestao_acao ("APROVAR_AUTOMATICO" | "NOTIFICAR_COORDENADOR" | "RECUSAR")

DIRETRIZES DE PONTUAÇÃO:
- Se ele menciona uma data ou semana que não bate com NENHUMA das designações da lista, retorne id_designacao_identificada: null e percentual_verdade baixo (veto automático).
- Analise se parece um repasse de terceiro (ex: "fulano pediu pra avisar que não vai", "meu marido não pode"). Isso reduz o percentual.
- PROIBIDO incluir texto (markdown, backticks) antes ou depois do JSON.`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: Deno.env.get("JEV_MODEL_ID") || "typesafe/jev-router", 
        temperature: 0.0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) }
        ]
      })
    });
    
    if (res.ok) {
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content || "";
      const parsed = JSON.parse(content);
      
      // Validação defensiva (Deno runtime duck typing)
      return {
        id_designacao_identificada: parsed.id_designacao_identificada || null,
        percentual_verdade: typeof parsed.percentual_verdade === "number" ? parsed.percentual_verdade : 0,
        classificacao: parsed.classificacao || "DIVERGENCIA_CRITICA",
        fatores_convergentes: Array.isArray(parsed.fatores_convergentes) ? parsed.fatores_convergentes : [],
        fatores_divergentes: Array.isArray(parsed.fatores_divergentes) ? parsed.fatores_divergentes : [],
        analise_sintetica: parsed.analise_sintetica || "Análise gerada.",
        sugestao_acao: parsed.sugestao_acao || "NOTIFICAR_COORDENADOR"
      };
    } else {
      console.error("[zapi-smart-webhook] OpenRouter falhou com status:", res.status, await res.text());
    }
  } catch (e) {
    console.error("[zapi-smart-webhook] OpenRouter Error:", e);
  }
  
  // Em caso de falha na IA, fail-open com flag de atenção
  return { 
    id_designacao_identificada: upcomingPartsList.length > 0 ? String(upcomingPartsList[0].id) : null,
    percentual_verdade: 100, 
    classificacao: "ALTA_PLAUSIBILIDADE", 
    fatores_convergentes: [], 
    fatores_divergentes: ["Falha na API da IA"], 
    analise_sintetica: "Fallback Heurístico de Resiliência", 
    sugestao_acao: "APROVAR_AUTOMATICO" 
  };
}

serve(async (req: Request) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers });
  }

  try {
    const body: any = await req.json();
    console.log("[zapi-smart-webhook] Payload recebido:", JSON.stringify(body).slice(0, 400));

    // Aguardar o processamento COMPLETAMENTE antes de retornar.
    // Em Serverless/Edge, retornar a Response precocemente congela a CPU (Isolate suspend),
    // o que mata chamadas assíncronas (como fetch pro OpenRouter) no meio do voo!
    await processWebhookPayload(body);

    return new Response(JSON.stringify({ success: true }), { headers, status: 200, headers: { "Content-Type": "application/json", ...headers } });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { headers, status: 400 });
  }
});

async function processWebhookPayload(body: any) {
  const startTime = Date.now();
  try {
    const payload = body.data || body;
    const dataObj = payload.data || payload;

    // 1. Filtrar eventos puramente de status/presença que NÃO são mensagens nem ações de usuários
    const eventType = payload.type || (payload as any).event;
    if (eventType && ["DeliveryCallback", "MessageStatusCallback", "PresenceChatCallback", "ConnectedCallback", "DisconnectedCallback"].includes(eventType)) {
      return;
    }

    const rawPollVote = (payload as any).pollVote || dataObj.pollVote || (payload as any).poll || dataObj.poll;
    const isPoll = Boolean(rawPollVote);

    const buttonId = payload.buttonsResponseMessage?.buttonId || 
                     payload.buttonsResponseMessage?.selectedButtonId ||
                     (payload as any).buttonReply?.buttonId ||
                     (payload as any).data?.buttonsResponseMessage?.buttonId ||
                     (payload as any).data?.buttonsResponseMessage?.selectedButtonId ||
                     (payload as any).data?.buttonReply?.buttonId ||
                     (payload as any).selectedButtonId ||
                     (payload as any).buttonId;
    const buttonMessage = payload.buttonsResponseMessage?.message || 
                          (payload as any).buttonReply?.message ||
                          (payload as any).data?.buttonsResponseMessage?.message || 
                          (payload as any).data?.buttonReply?.message ||
                          (payload as any).buttonText ||
                          "";
    const reactionVal = payload.reaction?.value || payload.reactionMessage?.value;
    const reactionMsgId = payload.reaction?.messageId || payload.reactionMessage?.messageId;
    const quotedMsgId = payload.quotedMsg?.messageId || 
                        payload.referenceMessageId || 
                        (payload as any).referencedMessage?.messageId ||
                        (payload as any).contextInfo?.stanzaId;
    const inboundText = (payload.text?.message || payload.message || buttonMessage || (payload as any).body || "").trim();

    const hasQuotedMsg = Boolean(quotedMsgId);
    const isInteraction = Boolean(buttonId || reactionVal || rawPollVote || hasQuotedMsg);

    // Ignora absolutamente mensagens disparadas por nossa própria API
    if (payload.fromApi === true) {
      return;
    }

    // Ignora mensagens enviadas pelo dono do celular no WhatsApp Web, exceto se for interação ou resposta com palavra-chave
    if (payload.fromMe === true && !isInteraction) {
      const lower = inboundText.toLowerCase();
      const hasKeyword = /\b(confirmar|confirmo|sim|não|recusar|poderei|disponibilidade)\b/i.test(lower);
      if (!hasKeyword) {
        return;
      }
    }
    if (payload.isGroup === true && !isPoll) {
      return;
    }

    // Bloqueio de Segurança para "Proxy Assumido" (Evitar que o bot analise mensagens encaminhadas e puna a parte de quem encaminhou)
    if (payload.isForwarded === true || dataObj.isForwarded === true) {
      console.log(`[zapi-smart-webhook] SECURITY LOCK: Ignorando mensagem porque é um texto ENCAMINHADO (isForwarded=true).`);
      return;
    }

    let senderPhone = payload.phone || 
                      payload.senderPhone || 
                      (payload as any).participantPhone || 
                      dataObj.phone || 
                      dataObj.senderPhone || 
                      (dataObj.sender ? String(dataObj.sender).replace(/@.*$/, "") : "") || 
                      "";

    // Se o senderPhone for um LID (@lid), tenta obter o telefone numérico real de outros campos
    if (senderPhone.includes("@lid")) {
      const realPhone = payload.senderPhone || (payload as any).participantPhone || dataObj.phone || "";
      if (realPhone && !realPhone.includes("@lid")) {
        senderPhone = realPhone;
      }
    }
    senderPhone = senderPhone.replace(/@.*$/, "").replace(/\D/g, "");

    const inboundMessageId = payload.messageId || "";
    
    // ========================================================================
    // DEDUPLICAÇÃO DE WEBHOOKS
    // Verifica se a mensagem já foi processada anteriormente para evitar duplo processamento
    // causado por retentativas de entrega de webhook da Z-API.
    // ========================================================================
    if (inboundMessageId) {
      // Usamos INSERT inicial com tratamento de erro de unicidade para evitar race conditions!
      const { error: insertLockError } = await supabase
        .from("zapi_smart_interactions")
        .insert({
          inbound_message_id: inboundMessageId,
          action_taken: "PROCESSING",
          raw_payload: payload
        });
      
      if (insertLockError) {
        console.log(`[zapi-smart-webhook] Webhook ignorado (Race Condition Lock): mensagem ${inboundMessageId} já processada ou em processamento concorrente.`);
        return new Response(JSON.stringify({ success: true, message: "Ignored duplicate" }), { headers, status: 200 });
      }
    }

    let matchedBy = "UNMATCHED";
    let detectedIntent = "OUTRO";
    let confidence = 1.0;
    let actionTaken = "IGNORED";
    let reasonExtracted: string | null = null;
    let outboundReply: string | null = null;

    let targetPartId: string | null = null;
    let targetPart: any = null;
    let publisherData: any = null;
    let possiblePublishers: any[] = [];

    // Se temos quotedMsgId, tenta resolver a parte imediatamente pelo histórico de despachos
    if (quotedMsgId) {
      const { data: logEntry } = await supabase
        .from("zapi_dispatch_log")
        .select("part_id, recipient_phone")
        .eq("message_id", quotedMsgId)
        .maybeSingle();

      if (logEntry?.part_id) {
        targetPartId = logEntry.part_id.replace(/-(titular|ajudante)$/i, "");
        matchedBy = "QUOTED_MSG";
        if (!senderPhone && logEntry.recipient_phone) {
          senderPhone = logEntry.recipient_phone.replace(/\D/g, "");
        }
      }
    }

    // --------------------------------------------------------------------------
    // 1. Identificar possíveis Publicadores pelo Telefone (Casais/Famílias compartilham número)
    // --------------------------------------------------------------------------
    if (senderPhone) {
      const { data: allPubs } = await supabase.from("publishers").select("id, data");
      if (allPubs && allPubs.length > 0) {
        for (const p of allPubs) {
          const pPhone = p.data?.phone || p.data?.contact_phone || "";
          if (phoneMatches(senderPhone, pPhone)) {
            possiblePublishers.push({
              id: p.id,
              name: p.data?.name || "Irmão(ã)",
              gender: p.data?.gender || "brother",
              phone: pPhone,
            });
          }
        }
      }
    }

    if (possiblePublishers.length > 0) {
      // Pick the first one as default for now. We will refine this if we find a targetPart.
      publisherData = possiblePublishers[0];
    }

    let pubName = publisherData?.name || "Irmão(ã)";

    // 🚨 INVARIANTE 1: Bloqueio estrito para não-publicadores
    if (!publisherData) {
      console.log(`[zapi-smart-webhook] IGNORED: Telefone ${senderPhone} não pertence a nenhum publicador cadastrado.`);
      return;
    }

    // --------------------------------------------------------------------------
    // 2. Resolução do Contexto (Botão, Reação, QuotedMsg ou Janela Temporal)
    // --------------------------------------------------------------------------

    // VIA A: Botão Clicado
    if (buttonId) {
      matchedBy = "BUTTON";
      const bIdUpper = String(buttonId).toUpperCase().trim();
      if (bIdUpper.includes("CONFIRM") || bIdUpper === "SIM") {
        detectedIntent = "CONFIRMAR";
        if (buttonId.includes(":")) targetPartId = buttonId.split(":")[1].trim();
      } else if (bIdUpper.includes("RECUS") || bIdUpper.includes("NAO") || bIdUpper.includes("NÃO") || bIdUpper.includes("CANCEL")) {
        detectedIntent = "RECUSAR";
        if (buttonId.includes(":")) targetPartId = buttonId.split(":")[1].trim();
      } else if (bIdUpper.includes("DISP")) {
        detectedIntent = "DISPONIBILIDADE";
        if (buttonId.includes(":")) targetPartId = buttonId.split(":")[1].trim();
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

    // VIA E: Voto em Enquete (Poll Vote)
    if (rawPollVote) {
      matchedBy = "POLL_VOTE";
      let votedOption = "";
      let pollMsgId = (payload as any).pollMessageId || 
                      dataObj.pollMessageId || 
                      payload.referenceMessageId || 
                      (payload as any).referencedMessage?.messageId ||
                      (payload as any).messageId ||
                      "";

      if (Array.isArray(rawPollVote)) {
        votedOption = (rawPollVote[0]?.name || rawPollVote[0] || "").toLowerCase();
      } else if (typeof rawPollVote === "object") {
        pollMsgId = rawPollVote.pollMessageId || pollMsgId;
        if (Array.isArray(rawPollVote.options) && rawPollVote.options.length > 0) {
          votedOption = (rawPollVote.options[0]?.name || rawPollVote.options[0] || "").toLowerCase();
        } else if (Array.isArray(rawPollVote.votes) && rawPollVote.votes.length > 0) {
          votedOption = (rawPollVote.votes[0]?.name || rawPollVote.votes[0] || "").toLowerCase();
        } else if (Array.isArray(rawPollVote.selectedOptions) && rawPollVote.selectedOptions.length > 0) {
          votedOption = (rawPollVote.selectedOptions[0]?.name || rawPollVote.selectedOptions[0] || "").toLowerCase();
        } else if (rawPollVote.name) {
          votedOption = String(rawPollVote.name).toLowerCase();
        } else if (rawPollVote.vote) {
          votedOption = String(rawPollVote.vote).toLowerCase();
        } else if (rawPollVote.option) {
          votedOption = String(rawPollVote.option).toLowerCase();
        }
      }

      if (pollMsgId) {
        const { data: logEntry } = await supabase
          .from("zapi_dispatch_log")
          .select("part_id")
          .eq("message_id", pollMsgId)
          .maybeSingle();

        if (logEntry?.part_id) {
          targetPartId = logEntry.part_id.replace(/-(titular|ajudante)$/i, "");
        }
      }

      // Se ainda não achou targetPartId por pollMsgId, busca última enquete disparada para este telefone
      if (!targetPartId && senderPhone) {
        const cleanPhone = senderPhone.replace(/\D/g, "");
        const { data: recentDispatch } = await supabase
          .from("zapi_dispatch_log")
          .select("part_id")
          .like("phone", `%${cleanPhone.slice(-8)}%`)
          .order("dispatched_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recentDispatch?.part_id) {
          targetPartId = recentDispatch.part_id.replace(/-(titular|ajudante)$/i, "");
        }
      }

      if (votedOption.includes("confirmar") || votedOption.includes("confirm") || votedOption.includes("participa")) {
        detectedIntent = "CONFIRMAR";
      } else if (votedOption.includes("não poderei") || votedOption.includes("recusar") || votedOption.includes("nao") || votedOption.includes("poderei")) {
        detectedIntent = "RECUSAR";
      } else if (votedOption.includes("disponibilidade") || votedOption.includes("disp")) {
        detectedIntent = "DISPONIBILIDADE";
      }
    }

    // VIA D: Resolução por Janela Temporal (Publicador respondeu por texto)
    // INVARIANTE IMPOSTA: Imediatamente antes da msg/texto DEVE TER HAVIDO o envio de msg-do-app(z-api) relativa à designação.
    let recentDispatch = null;
    
    if (senderPhone) {
      const cleanPhone = senderPhone.replace(/\D/g, "");
      // Janela de resposta causal: até 72 horas após o envio de mensagem pelo app via Z-API
      const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

      const { data } = await supabase
        .from("zapi_dispatch_log")
        .select("part_id, dispatched_at, status")
        .like("recipient_phone", `%${cleanPhone.slice(-8)}%`)
        .eq("status", "SUCCESS")
        .gte("dispatched_at", seventyTwoHoursAgo)
        .order("dispatched_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        // INVARIANTE: O texto puro só é válido se não houve NENHUMA outra mensagem do publicador 
        // após o disparo (ou seja, se a resposta foi IMEDIATAMENTE vinculada ao disparo sem mensagens no meio).
        const { count } = await supabase
          .from("zapi_smart_interactions")
          .select("id", { count: "exact", head: true })
          .like("phone", `%${cleanPhone.slice(-8)}%`)
          .gte("created_at", data.dispatched_at)
          .neq("inbound_message_id", inboundMessageId);
        
        if (count === 0) {
          recentDispatch = data;
        } else {
          console.log(`[zapi-smart-webhook] TEXT IGNORED: Intervening messages found after dispatch at ${data.dispatched_at}`);
        }
      }
    }

    if (!targetPartId && recentDispatch?.part_id) {
      const candidatePartId = recentDispatch.part_id.replace(/-(titular|ajudante)$/i, "");
      // Verifica se a designação associada ao dispatch ainda está pendente de resposta (ENVIADA)
      const { data: partCheck } = await supabase
        .from("workbook_parts")
        .select("*")
        .eq("id", candidatePartId)
        .maybeSingle();

      if (partCheck && partCheck.status !== "CONCLUIDA" && partCheck.status !== "CANCELADA") {
        targetPartId = candidatePartId;
        targetPart = partCheck;
        matchedBy = "TEMPORAL_WINDOW";
        if (partCheck.resolved_publisher_name) {
          pubName = partCheck.resolved_publisher_name;
        }
      }
    }

    const hasExplicitInteraction = Boolean(buttonId || reactionVal || rawPollVote || quotedMsgId);
    
    // HEURÍSTICA DE FALLBACK (Busca na agenda do publicador)
    const lower = inboundText.toLowerCase();
    const isConfirmKeyword = /\b(confirmo|confirmar|confirmado|estarei|vou fazer|fa[cç]o|pode contar|sim|ok|beleza|certo)\b/i.test(lower) || lower.includes("confirmar");
    const isDeclineKeyword = /\b(n[aã]o posso|n[aã]o vou|n[aã]o poderei|doente|gripe|dengue|febre|viagem|viajando|plant[aã]o|imposs[ií]vel|recusar|rejeitar|motivo|particular|imprevisto|compromisso|sa[uú]de|m[eé]dic|cirurgia)\b/i.test(lower) || lower.includes("não poderei") || lower.includes("nao poderei") || lower.includes("recusar");
    const hasIntentKeyword = isConfirmKeyword || isDeclineKeyword;

    let upcomingPartsList: any[] = [];
    if (!targetPartId && publisherData && hasIntentKeyword) {
      const { data: upcomingParts } = await supabase
        .from("workbook_parts")
        .select("*")
        .eq("resolved_publisher_id", publisherData.id)
        .in("status", ["ENVIADA", "DESIGNADA"])
        .gte("date", new Date().toISOString().split("T")[0])
        .order("date", { ascending: true })
        .limit(5);

      if (upcomingParts && upcomingParts.length > 0) {
        upcomingPartsList = upcomingParts;
      }
    }
    
    // 🚨 INVARIANTE 2: Ação estrita para Texto Livre sem resposta a envio recente E sem palavra-chave
    if (!hasExplicitInteraction && !recentDispatch && !hasIntentKeyword) {
      console.log(`[zapi-smart-webhook] INVARIANTE 2: Texto livre ignorado por falta de envio recente para ${senderPhone}`);
      
      const processingTimeMs = Date.now() - startTime;
      const finalPayload = {
        phone: senderPhone,
        publisher_id: publisherData?.id || null,
        publisher_name: pubName,
        workbook_part_id: null,
        inbound_message_id: inboundMessageId,
        inbound_text: inboundText,
        raw_payload: payload,
        matched_by: "UNMATCHED_NO_CONTEXT",
        detected_intent: "OUTRO",
        confidence: 0,
        action_taken: "IGNORED_DUE_TO_INVARIANT",
        reason_extracted: null,
        outbound_reply_text: null,
        processing_time_ms: processingTimeMs,
      };

      if (inboundMessageId) {
        await supabase.from("zapi_smart_interactions").update(finalPayload).eq("inbound_message_id", inboundMessageId);
      } else {
        await supabase.from("zapi_smart_interactions").insert(finalPayload);
      }

      return;
    }

    // Se encontramos targetPartId mas ainda não carregamos targetPart, carrega do DB
    if (targetPartId && !targetPart) {
      const realId = targetPartId.replace(/-(titular|ajudante)$/i, "");
      const { data: pData } = await supabase
        .from("workbook_parts")
        .select("*")
        .eq("id", realId)
        .maybeSingle();
      if (pData) {
        targetPart = pData;

        // Agora que temos a parte, vamos refinar o publisherData caso o celular seja compartilhado
        if (possiblePublishers.length > 1 && pData.resolved_publisher_id) {
          const exactMatch = possiblePublishers.find(p => p.id === pData.resolved_publisher_id);
          if (exactMatch) {
            publisherData = exactMatch;
            pubName = exactMatch.name;
          }
        }

        if (pData.resolved_publisher_name) {
          pubName = pData.resolved_publisher_name;
        }
      }
    }

    // 3. Classificação de Intenção por Texto (se não foi botão/reação direta)
    // --------------------------------------------------------------------------
    if (detectedIntent === "OUTRO" && inboundText) {
      // Memória de Conversação: Verifica se o publicador acabou de clicar em RECUSAR (nos últimos 20 minutos)
      const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      const { data: recentRefusal } = await supabase
        .from("zapi_smart_interactions")
        .select("*")
        .eq("phone", senderPhone)
        .eq("detected_intent", "RECUSAR")
        .is("reason_extracted", null)
        .gte("created_at", twentyMinsAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentRefusal) {
        detectedIntent = "RECUSAR";
        reasonExtracted = inboundText;
        if (recentRefusal.workbook_part_id) {
          targetPartId = recentRefusal.workbook_part_id;
        }
        matchedBy = "QUOTED_MSG";
      } else {
        const lower = inboundText.toLowerCase();

        // Regras heurísticas de alta precisão (usando word boundaries para evitar falsos positivos)
        const isConfirm = /\b(confirmo|confirmar|confirmado|estarei|vou fazer|fa[cç]o|pode contar|sim|ok|beleza|certo)\b/i.test(lower) || lower.includes("confirmar");
        const isDecline = /\b(n[aã]o posso|n[aã]o vou|n[aã]o poderei|doente|gripe|dengue|febre|viagem|viajando|plant[aã]o|imposs[ií]vel|recusar|rejeitar|motivo|particular|imprevisto|compromisso|sa[uú]de|m[eé]dic|cirurgia)\b/i.test(lower) || lower.includes("não poderei") || lower.includes("nao poderei") || lower.includes("recusar");
        const isAvailability = /\b(disponibilidade|agenda|f[eé]rias|datas|ausente|aus[eê]ncia)\b/i.test(lower);
        const isSwap = /\b(troca|trocar|permuta|permutar|passar para|substituir)\b/i.test(lower);

        if (isAvailability) {
          detectedIntent = "DISPONIBILIDADE";
        } else if (isSwap) {
          detectedIntent = "PERMUTA";
        } else if (isDecline) {
          detectedIntent = "RECUSAR";
          reasonExtracted = inboundText;
        } else if (isConfirm) {
          detectedIntent = "CONFIRMAR";
        }
      }
    }

    console.log(`[zapi-smart-webhook] Intent: ${detectedIntent}, MatchedBy: ${matchedBy}, PartId: ${targetPartId}`);

    const isExplicitButtonOrReaction = matchedBy === "BUTTON" || matchedBy === "REACTION" || matchedBy === "POLL_VOTE";

    // ========================================================================
    // PROTOCOLO B: JEV AI (OpenRouter)
    // Verifica se a heurística não caiu em uma armadilha de proxy/repasse
    // ========================================================================
    if (!isExplicitButtonOrReaction && (detectedIntent === "RECUSAR" || detectedIntent === "CONFIRMAR") && inboundText && (targetPart || upcomingPartsList.length > 0)) {
      console.log(`[zapi-smart-webhook] Protocolo B: Invocando JEV AI para dupla checagem e roteamento...`);
      
      let chatHistory: string[] = [];
      if (senderPhone) {
        // Busca as últimas interações deste telefone para dar contexto à IA
        const { data: recentMsgs } = await supabase
          .from("zapi_smart_interactions")
          .select("inbound_text, created_at")
          .eq("phone", senderPhone)
          .order("created_at", { ascending: false })
          .limit(5);
          
        if (recentMsgs && recentMsgs.length > 0) {
          // Reverte para ficar em ordem cronológica (mais antiga -> mais nova)
          chatHistory = recentMsgs.reverse().map(m => `[${m.created_at}] Usuário: "${m.inbound_text}"`);
        }
      }

      const partsToPass = targetPart ? [targetPart] : upcomingPartsList;
      const aiResult = await verifyIntentWithAI(
        inboundText,
        detectedIntent,
        pubName || "Desconhecido",
        partsToPass,
        chatHistory
      );
      
      console.log(`[zapi-smart-webhook] JEV AI Result:`, aiResult);

      if (aiResult.id_designacao_identificada && !targetPart) {
        targetPartId = aiResult.id_designacao_identificada;
        targetPart = upcomingPartsList.find(p => String(p.id) === targetPartId);
        matchedBy = "JEV_AI_ROUTER";
      }
      
      const isRejectedByJev = aiResult.percentual_verdade < 60 || aiResult.sugestao_acao === "NOTIFICAR_COORDENADOR" || aiResult.sugestao_acao === "RECUSAR" || !targetPart;
      
      if (isRejectedByJev) {
        console.log(`[zapi-smart-webhook] JEV AI VETOU A AÇÃO: ${aiResult.analise_sintetica} (Certeza: ${aiResult.percentual_verdade}%)`);
        detectedIntent = "OUTRO"; // Reverte a intenção para OUTRO para forçar moderação manual
        const divergentReason = aiResult.fatores_divergentes.length > 0 ? aiResult.fatores_divergentes.join(" | ") : (targetPart ? "Incompatibilidade temporal/factual" : "Nenhuma data válida encontrada na lista");
        reasonExtracted = `[BLOQUEADO JEV AI (${aiResult.percentual_verdade}% verdade)] ${aiResult.analise_sintetica} | Fatores: ${divergentReason} - Original: ${inboundText}`;
      } else {
        // Enriquecer o reasonExtracted com a análise da IA se foi validado com sucesso!
        if (detectedIntent === "RECUSAR") {
          const enrichScore = aiResult.percentual_verdade;
          const enrichFactors = aiResult.fatores_convergentes.length > 0 ? aiResult.fatores_convergentes.join(" | ") : "Plenamente justificado";
          reasonExtracted = `${inboundText} (Aprovado JEV AI - Score: ${enrichScore}% - ${enrichFactors})`;
        }
      }
    }

    // --------------------------------------------------------------------------
    // 4. Fechamento de Ciclo (Ações e Respostas)
    // --------------------------------------------------------------------------
    const replyPhone = publisherData?.phone || targetPart?.phone || (senderPhone ? senderPhone.replace(/@.*$/, "") : "");
    const greeting = getGreeting();
    const honorific = getHonorific(publisherData?.gender || targetPart?.gender || "brother");

    // CENÁRIO 1: CONFIRMAÇÃO
    if (detectedIntent === "CONFIRMAR") {
      if (!targetPart) {
        actionTaken = "IGNORED_NO_PRECEDING_DISPATCH";
        console.log(`[zapi-smart-webhook] Texto de confirmação ignorado: nenhum dispatch prévio recente para ${senderPhone}`);
      } else if (targetPart.status === "CONCLUIDA" || targetPart.status === "CANCELADA") {
        actionTaken = "ALREADY_PROCESSED";
      } else if (targetPart.status === "DESIGNADA" && targetPart.resolved_publisher_id === publisherData?.id) {
        const changedAt = new Date(targetPart.status_changed_at || targetPart.updated_at || 0).getTime();
        const now = Date.now();
        const minutesSinceChange = (now - changedAt) / (1000 * 60);

        if (minutesSinceChange < 5) {
          actionTaken = "IGNORED_RECENT_DUPLICATE";
          console.log(`[zapi-smart-webhook] Confirmação ignorada silenciosamente (Duplo clique em menos de 5 min)`);
        } else {
          actionTaken = "ALREADY_PROCESSED_SPAM_LOCKED";
          outboundReply = `✅ ${greeting}, ${honorific} *${pubName}*! Vimos que sua designação já constava como confirmada. Muito obrigado pela sua disposição!`;
          console.log(`[zapi-smart-webhook] Confirmação ignorada (Duplo Clique): Parte já estava DESIGNADA para ${pubName}`);
          await dispatchTextMessage(replyPhone, outboundReply);
        }
      } else if (targetPart.resolved_publisher_id && targetPart.resolved_publisher_id !== publisherData?.id) {
        actionTaken = "ALREADY_REASSIGNED";
        outboundReply = `⚠️ ${greeting}, ${honorific} *${pubName}*. Como esta parte já foi repassada para outro publicador, não é mais possível confirmá-la. Agradecemos imensamente a sua disposição e o seu espírito voluntário!`;
        console.log(`[zapi-smart-webhook] Confirmação negada: Parte já repassada para outro publicador.`);
        await dispatchTextMessage(replyPhone, outboundReply);
      } else {
        // Concorrência segura: assegura status DESIGNADA em workbook_parts
        await supabase
          .from("workbook_parts")
          .update({
            status: "DESIGNADA",
            status_changed_at: new Date().toISOString(),
          })
          .eq("id", targetPart.id);

        // Registra em confirmation_portal_responses para o modal S-89 carimbar como ACEITA!
        await supabase
          .from("confirmation_portal_responses")
          .insert({
            part_id: String(targetPart.id),
            publisher_id: String(targetPart.resolved_publisher_id || targetPart.publisher_id || publisherData?.id || "0"),
            response: "confirmed",
            part_status_after: "DESIGNADA",
            trust_level: "zapi",
            created_at: new Date().toISOString(),
          });

        actionTaken = "STATUS_CONFIRMADA";

        const tipoParte = targetPart.tipo_parte || targetPart.part_title || "Designação";
        outboundReply = `✅ *Confirmação Registrada!*\n\n${greeting}, ${honorific} *${pubName}*, ficamos muito felizes! Sua designação de *${tipoParte}* está confirmada no programa da reunião.\n\nQue Jeová abençoe ricamente a sua preparação! 🙏`;
        console.log(`[zapi-smart-webhook] Despachando resposta cordial de confirmação para ${replyPhone}...`);
        await dispatchTextMessage(replyPhone, outboundReply);
      }
    }

    // CENÁRIO 2: RECUSA
    else if (detectedIntent === "RECUSAR") {
      if (!targetPart) {
        actionTaken = "IGNORED_NO_PRECEDING_DISPATCH";
        console.log(`[zapi-smart-webhook] Texto de recusa ignorado: nenhum dispatch prévio recente para ${senderPhone}`);
      } else if (targetPart.status === "REJEITADA" || targetPart.status === "EM_SUBSTITUICAO") {
        const changedAt = new Date(targetPart.status_changed_at || targetPart.updated_at || 0).getTime();
        const now = Date.now();
        const minutesSinceChange = (now - changedAt) / (1000 * 60);

        if (minutesSinceChange < 5) {
          actionTaken = "IGNORED_RECENT_DUPLICATE";
          console.log(`[zapi-smart-webhook] Recusa ignorada silenciosamente (Duplo clique em menos de 5 min)`);
        } else {
          actionTaken = "ALREADY_REJECTED_SPAM_LOCKED";
          outboundReply = `⚠️ ${greeting}, ${honorific} *${pubName}*. Identificamos que você já havia recusado esta parte. Fique tranquilo(a), o responsável já foi notificado.`;
          console.log(`[zapi-smart-webhook] Recusa ignorada (Duplo Clique): Parte já estava REJEITADA/EM_SUBSTITUICAO`);
          await dispatchTextMessage(replyPhone, outboundReply);
        }
      } else {
        const reason = reasonExtracted || "Impossibilidade informada via WhatsApp.";

        // Ler a chave zapi_automation_active da app_settings (mesma da UI)
        const { data: settingsData } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", "zapi_automation_active")
          .maybeSingle();
        
        const isAutoReassignON = settingsData?.value === "ON" || settingsData?.value === "true" || settingsData?.value === true;

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

        await supabase
          .from("confirmation_portal_responses")
          .insert({
            part_id: String(targetPart.id),
            publisher_id: String(targetPart.resolved_publisher_id || targetPart.publisher_id || publisherData?.id || "0"),
            response: "refused",
            response_reason: reason,
            part_status_after: "REJEITADA",
            trust_level: "zapi",
            created_at: new Date().toISOString(),
          });

        await supabase.from("refusal_logs").insert({
          part_id: targetPart.id,
          publisher_name: pubName,
          reason: reason,
          week_id: targetPart.week_id,
          tipo_parte: targetPart.tipo_parte || targetPart.part_title,
        });

        actionTaken = "STATUS_REJEITADA";

        if (isAutoReassignON) {
          console.log(`[zapi-smart-webhook] AUTOMAÇÃO ON: Disparando GitHub Action (repository_dispatch) para a parte ${targetPart.id}`);
          outboundReply = `Muito obrigado por avisar, ${honorific} *${pubName}*! Já registramos e o sistema providenciará a substituição automaticamente. Desejamos tudo de bom! 💛`;
          await dispatchTextMessage(replyPhone, outboundReply);

          // Disparar o GitHub Actions webhook com fallback defensivo para a liderança
          try {
            await dispatchGitHubAction(targetPart, pubName, reason);
          } catch (ghErr: any) {
            console.error('[zapi-smart-webhook] Erro não tratado ao disparar GitHub Action:', ghErr);
            
            // Injeta o alerta de infraestrutura no Log Canônico da Liderança
            await supabase.from("zapi_dispatch_log").insert({
              dispatch_type: "SYSTEM_ERROR",
              phone: "Sistema",
              status: "FAILED",
              message_id: ghErr.message || "Erro desconhecido",
              part_id: targetPart.id
            });
          }
          
          // Nota: dispatchAlertToLeadership não é chamado aqui porque o robô headless assumirá o comando e alertará a liderança após trocar.
        } else {
          console.log(`[zapi-smart-webhook] AUTOMAÇÃO OFF: Fluxo semi-automático tradicional.`);
          if (!reasonExtracted) {
            outboundReply = `${greeting}, ${honorific} *${pubName}*, já registramos que não será possível realizar esta designação.\n\nPor favor, poderia nos informar brevemente o *motivo* para podermos repassar aos irmãos responsáveis?`;
            await dispatchTextMessage(replyPhone, outboundReply);
          } else {
            outboundReply = `Muito obrigado por nos avisar com antecedência, ${honorific} *${pubName}*! Já registramos sua justificativa e iremos providenciar a substituição. Desejamos tudo de bom e, se for o caso, uma pronta recuperação! 💛`;
            await dispatchTextMessage(replyPhone, outboundReply);
            await dispatchAlertToLeadership(targetPart, pubName, reason);
          }
        }
      }
    }

    // CENÁRIO 3: DISPONIBILIDADE
    else if (detectedIntent === "DISPONIBILIDADE") {
      actionTaken = "DISPONIBILIDADE_REQUESTED";
      const appUrl = "https://rvm-designacoes-antigravity.vercel.app";
      const token = publisherData?.id ? await getOrCreateAvailabilityToken(publisherData.id, pubName) : "";
      const link = token ? `${appUrl}/?portal=availability&token=${token}` : `${appUrl}/`;

      if (matchedBy === "TEMPORAL_WINDOW" || matchedBy === "UNMATCHED") {
        // Soft Confirmation para texto livre: evita enviar o painel intrusivamente
        outboundReply = `${greeting}, ${honorific} *${pubName}*, notamos que mencionou algo sobre sua agenda ou disponibilidade.\n\nDeseja acessar seu painel para atualizar suas datas ausentes?`;
        const btnSent = await dispatchButtonActionUrl(replyPhone, outboundReply, "📅 Sim, Abrir Painel", link);
        if (!btnSent) await dispatchTextMessage(replyPhone, `${outboundReply}\n\nAcesse aqui: ${link}`);
      } else {
        // Disparo direto via Botão explícito
        const promptMsg = `📅 *Painel de Disponibilidade*\n\n${greeting}, ${honorific} *${pubName}*, por favor, toque no botão abaixo para abrir o seu painel e indicar as semanas em que estará ausente:`;
        const buttonSent = await dispatchButtonActionUrl(replyPhone, promptMsg, "📅 Abrir Painel", link);
        
        if (!buttonSent) {
          outboundReply = `📅 *Atualização de Disponibilidade*\n\n${greeting}, ${honorific} *${pubName}*, por favor, toque no link abaixo para marcar as semanas em que estará ausente ou disponível nos próximos meses:\n\n👉 ${link}\n\n_As datas marcadas são bloqueadas automaticamente nas próximas designações._`;
          await dispatchTextMessage(replyPhone, outboundReply);
        } else {
          outboundReply = `[Botão CTA de Disponibilidade enviado: ${link}]`;
        }
      }
    }

    // CENÁRIO 4: PERMUTA (TROCA COM OUTRO IRMÃO)
    else if (detectedIntent === "PERMUTA") {
      actionTaken = "SWAP_REQUESTED";
      outboundReply = `${greeting}, ${honorific} *${pubName}*, registramos o seu pedido de troca!\n\nJá encaminhamos a sua solicitação para avaliação dos irmãos responsáveis. Lembramos que toda troca precisa da aprovação deles para ter validade oficial no programa da reunião.\n\nAssim que eles analisarem, você será avisado(a)! 🙏`;
      await dispatchTextMessage(replyPhone, outboundReply);

      // Alerta a liderança sobre a tentativa de permuta
      await dispatchSwapAlertToLeadership(targetPart, pubName, inboundText);
    }

    // --------------------------------------------------------------------------
    // 5. Auditoria na Tabela zapi_smart_interactions
    // --------------------------------------------------------------------------
    const processingTimeMs = Date.now() - startTime;
    const finalPayload = {
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
    };
    
    if (inboundMessageId) {
      await supabase.from("zapi_smart_interactions").update(finalPayload).eq("inbound_message_id", inboundMessageId);
    } else {
      await supabase.from("zapi_smart_interactions").insert(finalPayload);
    }

    return;
  } catch (err: any) {
    console.error("[zapi-smart-webhook] Erro ao processar webhook:", err);
    return;
  }
}

// ============================================================================
// Funções Auxiliares de Envio e Notificação
// ============================================================================

/** Dispara botão de ação (CTA URL) via Edge Function send-whatsapp */
async function dispatchButtonActionUrl(phone: string, message: string, buttonLabel: string, url: string): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
        "x-bot-token": "rvm_bot_8f4a1c9e2b7d3f5a0e6c8b1d4e7a9f2c",
      },
      body: JSON.stringify({
        action: "send-button-actions",
        phone: phone,
        message: message,
        buttonActions: [
          {
            id: "1",
            type: "URL",
            url: url,
            label: buttonLabel,
          }
        ]
      }),
    });
    const data = await res.json().catch(() => ({}));
    console.log(`[zapi-smart-webhook] dispatchButtonActionUrl to ${phone}: status=${res.status}, res=${JSON.stringify(data)}`);
    return Boolean(data?.success);
  } catch (err) {
    console.error("[zapi-smart-webhook] Falha ao enviar button-actions:", err);
    return false;
  }
}

/** Dispara mensagem de texto via Edge Function send-whatsapp */
async function dispatchTextMessage(phone: string, message: string) {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
        "x-bot-token": "rvm_bot_8f4a1c9e2b7d3f5a0e6c8b1d4e7a9f2c",
      },
      body: JSON.stringify({
        action: "send-text",
        phone: phone,
        message: message,
      }),
    });
    const data = await res.json().catch(() => ({}));
    console.log(`[zapi-smart-webhook] dispatchTextMessage to ${phone}: status=${res.status}, res=${JSON.stringify(data)}`);
    return Boolean(data?.success);
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
      const success = await dispatchTextMessage(phone, alertMessage);
      
      // LOG CANÔNICO (Outbound para a liderança)
      await supabase.from("zapi_dispatch_log").insert({
        part_id: part?.id || null,
        dispatch_type: 'ALERTA_RECUSA_LIDERANCA',
        recipient_phone: phone,
        status: success ? 'SUCCESS' : 'ERROR',
        message_id: null
      });
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
      const success = await dispatchTextMessage(phone, alertMessage);
      
      // LOG CANÔNICO (Outbound para a liderança)
      await supabase.from("zapi_dispatch_log").insert({
        part_id: part?.id || null,
        dispatch_type: 'ALERTA_PERMUTA_LIDERANCA',
        recipient_phone: phone,
        status: success ? 'SUCCESS' : 'ERROR',
        message_id: null
      });
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

/** Dispara o Workflow Assíncrono no GitHub Actions com Fallback Defensivo */
async function dispatchGitHubAction(targetPart: any, pubName: string, reason: string): Promise<boolean> {
  const partId = targetPart?.id;
  try {
    const githubToken = Deno.env.get("GITHUB_DISPATCH_TOKEN") || Deno.env.get("GITHUB_PAT");
    const githubRepo = Deno.env.get("GITHUB_REPO") || "EliezerRosa/RVM-Designacoes-Antigravity";

    if (!githubToken) {
      console.error("[zapi-smart-webhook] Erro: GITHUB_DISPATCH_TOKEN ou GITHUB_REPO ausente. Acionando fallback para liderança.");
      await dispatchAlertToLeadership(
        targetPart, 
        pubName, 
        `${reason} (Aviso do Sistema: Automação em background indisponível - GITHUB_DISPATCH_TOKEN/REPO não configurados. Ação manual necessária.)`
      );
      return false;
    }

    const res = await fetch(`https://api.github.com/repos/${githubRepo}/dispatches`, {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": `token ${githubToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "trigger-auto-reassign",
        client_payload: { part_id: partId }
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[zapi-smart-webhook] Erro disparando GitHub Action: ${res.status} ${errorText}. Acionando fallback para liderança.`);
      await dispatchAlertToLeadership(
        targetPart, 
        pubName, 
        `${reason} (Aviso do Sistema: Falha ao acionar GitHub Action [status ${res.status}]. Ação manual necessária.)`
      );
      return false;
    } else {
      console.log(`[zapi-smart-webhook] GitHub Action disparada com sucesso para part_id: ${partId}`);
      return true;
    }
  } catch (err) {
    console.error("[zapi-smart-webhook] Falha no disparo do GitHub Action:", err);
    await dispatchAlertToLeadership(
      targetPart, 
      pubName, 
      `${reason} (Aviso do Sistema: Erro inesperado ao acionar automação. Ação manual necessária.)`
    );
    return false;
  }
}

