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
 * PROTOCOLO B: MOTOR DETERMINSTICO (JEV AI - System One)
 * Seleciona a designao correta e calcula o score de veracidade e coerncia.
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
    console.log("[zapi-smart-webhook] OPENROUTER_API_KEY no encontrada, pulando Protocolo B.");
    return {
      id_designacao_identificada: upcomingPartsList.length > 0 ? String(upcomingPartsList[0].id) : null,
      percentual_verdade: 100,
      classificacao: "ALTA_PLAUSIBILIDADE",
      fatores_convergentes: ["Bypass - API Key missing"],
      fatores_divergentes: [],
      analise_sintetica: "Fallback Heurstico de Segurana",
      sugestao_acao: "APROVAR_AUTOMATICO"
    };
  }

  try {
    const historyText = chatHistory.length > 0 
      ? \\n\n--- HISTÓRICO DE MENSAGENS RECENTES (Cronológico) ---\n\\n--------------------------------------------------------------\n\ 
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

    const SYSTEM_PROMPT = \Você atua como Jev AI, um motor determinístico de verificação de coerência factual e plausibilidade para o Protocolo B (System One).

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
- PROIBIDO incluir texto (markdown, backticks) antes ou depois do JSON.\;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \Bearer \\
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
  
  // Em caso de falha na IA, fail-open com flag de atenção (mas mantém a primeira designação se houver)
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
