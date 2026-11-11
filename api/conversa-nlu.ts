/**
 * Vercel Serverless Edge Function - Classificador NLU L2 para Conversa RVM
 *
 * Recebe uma expressão em linguagem natural do usuário e classifica
 * dentro do catálogo estrito e fechado de intenções (ConversaIntentId).
 * Garante payload JSON estrito ou fallback gracioso para 'fallback.unknown'.
 */

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_INTENTS = [
  'query-my-assignments',
  'query-week-assignments',
  'query-vacant-parts',
  'query-last-participation',
  'query-eligibility',
  'query-pending-weeks',
  'view-s140',
  'view-s89',
  'view-s4',
  'view-s1-consolidation',
  'explain-ranking',
  'explain-engine-rules',
  'register-absence',
  'approve-week-proposal',
  'reassign-part-assignee',
  'undo-last-action',
  'proactive-briefing',
  'clarify-ambiguity',
  'query-sync-status',
  'fallback.unknown',
] as const;

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const body = await req.json().catch(() => null);
    const utterance = typeof body?.utterance === 'string' ? body.utterance.trim() : '';

    if (!utterance) {
      return new Response(
        JSON.stringify({
          intentId: 'fallback.unknown',
          slots: {},
          confidence: 0,
          reason: 'Utterance vazia',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      // Sem chave configurada na runtime: fallback gracioso sem erro 500
      return new Response(
        JSON.stringify({
          intentId: 'fallback.unknown',
          slots: {},
          confidence: 0,
          reason: 'Sem chave GEMINI_API_KEY no ambiente serverless',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const systemPrompt = `Você é o classificador semântico NLU de uma aplicação teocrática (RVM Designações).
Sua função ÚNICA é classificar o texto do usuário no catálogo fechado de intenções e extrair parâmetros.
NUNCA invente intenções fora da lista permitida.

Intenções permitidas:
- query-my-assignments (ex: "o que eu tenho para fazer", "minhas designações")
- query-week-assignments (ex: "quem faz a leitura dia 20", "quem está escalado", "o que tem na reunião")
- query-vacant-parts (ex: "quais partes estão vagas?", "tem vaga?", "o que falta preencher")
- query-last-participation (ex: "quando o João participou por último?")
- query-eligibility (ex: "o Pedro pode fazer joias?", "a irmã Ana pode ser ajudante?")
- query-pending-weeks (ex: "quais semanas ainda não foram publicadas?", "semanas em rascunho")
- view-s140 (ex: "mostrar s-140", "ver programa s140")
- view-s89 (ex: "mostrar s-89", "ver folhinha", "meu s89")
- view-s4 (ex: "mostrar s-4", "cartão de relatório")
- view-s1-consolidation (ex: "mostrar s-1", "fechamento do mês")
- explain-ranking (ex: "por que o Paulo foi escolhido?", "como foi calculada a nota?")
- explain-engine-rules (ex: "por que não posso designar?", "qual a regra de oração?", "regras do s-38")
- register-absence (ex: "vou viajar de 18 a 25", "estarei fora dia 20")
- approve-week-proposal (ex: "aprovar semana 47", "aprovar rascunho")
- reassign-part-assignee (ex: "troque o Pedro pelo Tiago na oração", "mudar leitor")
- undo-last-action (ex: "desfazer", "desfaz última alteração")
- proactive-briefing (ex: "quais minhas pendências?", "o que tenho que fazer?", "briefing")
- clarify-ambiguity (ex: "opção 1", "o primeiro", "sim", "não")
- query-sync-status (ex: "status do hg", "como está a sincronização?")
- fallback.unknown (qualquer outra coisa fora do escopo)

Responda SOMENTE um objeto JSON com formato:
{
  "intentId": "nome_da_intencao",
  "slots": {
    "targetDate": "string ou null",
    "publisherName": "string ou null",
    "partTitle": "string ou null",
    "formType": "string ou null",
    "ruleId": "string ou null"
  },
  "confidence": 0.0 a 1.0
}`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;

    const geminiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\nTexto do usuário: "${utterance}"` }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
    });

    if (!geminiRes.ok) {
      return new Response(
        JSON.stringify({
          intentId: 'fallback.unknown',
          slots: {},
          confidence: 0,
          reason: `Gemini HTTP ${geminiRes.status}`,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = rawText ? JSON.parse(rawText) : null;

    if (parsed && ALLOWED_INTENTS.includes(parsed.intentId)) {
      return new Response(
        JSON.stringify({
          intentId: parsed.intentId,
          slots: parsed.slots || {},
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    return new Response(
      JSON.stringify({
        intentId: 'fallback.unknown',
        slots: {},
        confidence: 0,
        reason: 'Classificação inválida ou fora do catálogo',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        intentId: 'fallback.unknown',
        slots: {},
        confidence: 0,
        reason: message,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
}
