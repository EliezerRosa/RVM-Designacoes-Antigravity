export interface TruthAnalysis {
  percentual_verdade: number;
  classificacao: 'ALTA_PLAUSIBILIDADE' | 'MEDIANA' | 'INCONSISTENTE' | 'DIVERGENCIA_CRITICA';
  fatores_convergentes: string[];
  fatores_divergentes: string[];
  analise_sintetica: string;
  sugestao_acao: 'APROVAR_AUTOMATICO' | 'SOLICITAR_CONFIRMACAO' | 'NOTIFICAR_COORDENADOR' | 'RECUSAR';
}

/**
 * PROTOCOLO B: MOTOR DETERMINÍSTICO (JEV AI - System One)
 * Calcula um score de veracidade e coerência com o banco.
 */
async function verifyIntentWithAI(
  inboundText: string,
  detectedIntent: string,
  publisherName: string,
  partDate: string,
  partTitle: string,
  chatHistory: string[] = []
): Promise<TruthAnalysis> {
  // @ts-ignore
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    console.log("[zapi-smart-webhook] OPENROUTER_API_KEY não encontrada, pulando Protocolo B.");
    return {
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
      ? \\n\n--- HISTÓRICO DE MENSAGENS RECENTES (Cronológico) ---\n\\n--------------------------------------------------------------\n\ 
      : "";

    const payload = {
      mensagemRecebida: inboundText,
      remetenteTelefone: "Oculto para Privacidade",
      contexto: {
        nomePublicador: publisherName,
        designacaoAtiva: {
          data: partDate,
          parteTitulo: partTitle
        },
        intencaoPrimaria: detectedIntent
      }
    };

    const SYSTEM_PROMPT = \Você atua como Jev AI, um motor determinístico de verificação de coerência factual e plausibilidade para justificativas e mensagens no WhatsApp.

TAREFA: Compare o conteúdo da mensagem do usuário com os dados contextuais fornecidos e calcule o percentual de plausibilidade e correspondência fática (0 a 100%).

REGRAS:
- Retorne EXCLUSIVAMENTE um objeto JSON estrito com os seguintes campos (tipos exatos):
  - percentual_verdade (number 0 a 100)
  - classificacao ("ALTA_PLAUSIBILIDADE" | "MEDIANA" | "INCONSISTENTE" | "DIVERGENCIA_CRITICA")
  - fatores_convergentes (array de strings)
  - fatores_divergentes (array de strings)
  - analise_sintetica (string max 200 chars)
  - sugestao_acao ("APROVAR_AUTOMATICO" | "SOLICITAR_CONFIRMACAO" | "NOTIFICAR_COORDENADOR" | "RECUSAR")
- Analise repasse de recados de terceiros (proxy).
- Analise datas conflitantes (ex: alegar viagem em data diferente da designação).\
- percentual_verdade:
  - 85 a 100: Totalmente compatível com contexto, sem inconsistências.
  - 60 a 84: Plausível, mas sem suporte documental ou ligeiramente vago.
  - 30 a 59: Parcialmente incompatível ou com inconsistências temporais.
  - 0 a 29: Contradição direta ou repasse de terceiro explícito.
- PROIBIDO incluir texto antes ou depois do JSON.\;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \Bearer \\
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash", 
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
        percentual_verdade: typeof parsed.percentual_verdade === "number" ? parsed.percentual_verdade : 0,
        classificacao: parsed.classificacao || "DIVERGENCIA_CRITICA",
        fatores_convergentes: Array.isArray(parsed.fatores_convergentes) ? parsed.fatores_convergentes : [],
        fatores_divergentes: Array.isArray(parsed.fatores_divergentes) ? parsed.fatores_divergentes : [],
        analise_sintetica: parsed.analise_sintetica || "Falha ao gerar análise sintética",
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
    percentual_verdade: 100, 
    classificacao: "ALTA_PLAUSIBILIDADE", 
    fatores_convergentes: [], 
    fatores_divergentes: ["Falha na API da IA"], 
    analise_sintetica: "Fallback Heurístico de Resiliência", 
    sugestao_acao: "APROVAR_AUTOMATICO" 
  };
}
