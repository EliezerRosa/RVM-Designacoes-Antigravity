/**
 * Vercel Serverless Function - Proxy Multi-Provider para IA
 * Protege as API Keys mantendo-as apenas no servidor.
 *
 * 2026-05-23: Multi-provider fallback — Gemini → Mistral → DeepSeek → Cloudflare Workers AI
 *  - Cada provider tem adapter próprio que normaliza request/response para o
 *    formato Gemini (usado pelo frontend).
 *  - Loop percorre a lista do nível de pensamento escolhido e avança ao próximo
 *    provider/modelo em caso de 429, 5xx ou timeout.
 */

export const config = {
    runtime: 'edge',
};

// ─── TIPOS ────────────────────────────────────────────────────────────────────

type ThinkingLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type Provider = 'gemini' | 'mistral' | 'deepseek' | 'cloudflare';

interface ModelEntry {
    provider: Provider;
    model: string;
}

interface CallResult {
    data: unknown;
    ok: boolean;
    status: number;
    errorText: string;
}

// ─── ESTRATÉGIA MULTI-PROVIDER ────────────────────────────────────────────────

const MODEL_STRATEGY: Record<ThinkingLevel, ModelEntry[]> = {
    // LOW: Tarefas rápidas — free pools em cascata
    LOW: [
        { provider: 'gemini',     model: 'gemini-2.0-flash-lite' },             // Ultra rápido, free
        { provider: 'mistral',    model: 'mistral-small-latest' },               // Free tier Mistral
        { provider: 'cloudflare', model: '@cf/meta/llama-3.1-8b-instruct' },    // Free CF Workers AI
        { provider: 'gemini',     model: 'gemini-2.5-flash' },                  // Pool independente
        { provider: 'gemini',     model: 'gemini-1.5-flash' },                  // Legacy free
    ],
    // MEDIUM: Raciocínio padrão — melhor qualidade free
    MEDIUM: [
        { provider: 'gemini',     model: 'gemini-2.5-flash' },                             // Workhorse atual
        { provider: 'mistral',    model: 'mistral-small-latest' },                          // Free Mistral
        { provider: 'deepseek',   model: 'deepseek-chat' },                                // V3, ~$0.27/Mtok
        { provider: 'gemini',     model: 'gemini-2.0-flash' },                             // Pool free clássico
        { provider: 'cloudflare', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },    // CF 70B free
        { provider: 'gemini',     model: 'gemini-1.5-pro' },                               // Legacy Pro
    ],
    // HIGH: Raciocínio complexo — modelos premium
    HIGH: [
        { provider: 'gemini',     model: 'gemini-2.5-pro' },                       // Top-tier Google
        { provider: 'deepseek',   model: 'deepseek-reasoner' },                    // R1 raciocínio
        { provider: 'mistral',    model: 'mistral-large-latest' },                 // Mistral Large
        { provider: 'gemini',     model: 'gemini-2.0-flash-thinking-exp-01-21' }, // Deep Think
        { provider: 'gemini',     model: 'gemini-1.5-pro' },                       // Fallback Pro
    ],
};

// ─── TIMEOUTS ─────────────────────────────────────────────────────────────────

// Vercel Edge runtime tem limite de 25s wall-clock; reservamos 22s para o loop
// e 18s por modelo individual (com Abort) para não estourar e devolver 504 genérico.
const PER_MODEL_TIMEOUT_MS = 18_000;
const GLOBAL_BUDGET_MS     = 22_000;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Converte o body Gemini (frontend) para array de mensagens OpenAI-compatible. */
function extractMessages(body: Record<string, unknown>): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    const sys = body.systemInstruction as { parts?: Array<{ text?: string }> } | undefined;
    if (sys?.parts) {
        const sysText = sys.parts.map(p => p.text ?? '').join('\n').trim();
        if (sysText) messages.push({ role: 'system', content: sysText });
    }

    const contents = body.contents as Array<{ role?: string; parts?: Array<{ text?: string }> }> | undefined;
    for (const c of (contents ?? [])) {
        const text = c.parts?.map(p => p.text ?? '').join('') ?? '';
        messages.push({ role: c.role === 'model' ? 'assistant' : 'user', content: text });
    }

    return messages;
}

/** Normaliza qualquer resposta textual de volta ao formato Gemini esperado pelo frontend. */
function toGeminiResponse(text: string, usage?: { input: number; output: number }): unknown {
    return {
        candidates: [{
            content: { parts: [{ text }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
        }],
        usageMetadata: {
            promptTokenCount:     usage?.input  ?? 0,
            candidatesTokenCount: usage?.output ?? 0,
            totalTokenCount:      (usage?.input ?? 0) + (usage?.output ?? 0),
        },
    };
}

// ─── ADAPTERS ─────────────────────────────────────────────────────────────────

async function callGemini(
    model: string,
    body: Record<string, unknown>,
    apiKey: string,
    signal: AbortSignal,
): Promise<CallResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const { thinking_level, ...geminiBody } = body;
    void thinking_level; // campo RVM — não enviar para a API Gemini

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
        signal,
    });
    if (res.ok) return { data: await res.json(), ok: true, status: 200, errorText: '' };
    return { data: null, ok: false, status: res.status, errorText: await res.text() };
}

async function callOpenAICompat(
    baseUrl: string,
    model: string,
    body: Record<string, unknown>,
    apiKey: string,
    signal: AbortSignal,
): Promise<CallResult> {
    const messages  = extractMessages(body);
    const genConfig = (body.generationConfig as Record<string, unknown>) ?? {};

    const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
            model,
            messages,
            temperature: (genConfig.temperature    as number) ?? 0.7,
            max_tokens:  (genConfig.maxOutputTokens as number) ?? 8192,
        }),
        signal,
    });

    if (res.ok) {
        type OAIResp = { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        const raw = await res.json() as OAIResp;
        const text  = raw.choices?.[0]?.message?.content ?? '';
        const usage = raw.usage
            ? { input: raw.usage.prompt_tokens ?? 0, output: raw.usage.completion_tokens ?? 0 }
            : undefined;
        return { data: toGeminiResponse(text, usage), ok: true, status: 200, errorText: '' };
    }
    return { data: null, ok: false, status: res.status, errorText: await res.text() };
}

async function callCloudflare(
    model: string,
    body: Record<string, unknown>,
    token: string,
    accountId: string,
    signal: AbortSignal,
): Promise<CallResult> {
    const messages = extractMessages(body);
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ messages }),
        signal,
    });

    if (res.ok) {
        type CFResp = { result?: { response?: string }; success?: boolean };
        const raw = await res.json() as CFResp;
        return { data: toGeminiResponse(raw.result?.response ?? ''), ok: true, status: 200, errorText: '' };
    }
    return { data: null, ok: false, status: res.status, errorText: await res.text() };
}

// ─── DISPATCHER ───────────────────────────────────────────────────────────────

async function callProvider(
    entry: ModelEntry,
    body: Record<string, unknown>,
    env: Record<string, string | undefined>,
    signal: AbortSignal,
): Promise<CallResult> {
    switch (entry.provider) {
        case 'gemini': {
            const key = env.GEMINI_API_KEY;
            if (!key) return { data: null, ok: false, status: 500, errorText: 'GEMINI_API_KEY missing' };
            return callGemini(entry.model, body, key, signal);
        }
        case 'mistral': {
            const key = env.MISTRAL_API_KEY;
            if (!key) return { data: null, ok: false, status: 500, errorText: 'MISTRAL_API_KEY missing' };
            return callOpenAICompat('https://api.mistral.ai/v1', entry.model, body, key, signal);
        }
        case 'deepseek': {
            const key = env.DEEPSEEK_API_KEY;
            if (!key) return { data: null, ok: false, status: 500, errorText: 'DEEPSEEK_API_KEY missing' };
            return callOpenAICompat('https://api.deepseek.com', entry.model, body, key, signal);
        }
        case 'cloudflare': {
            const token     = env.CF_AI_TOKEN;
            const accountId = env.CF_ACCOUNT_ID;
            if (!token || !accountId) return { data: null, ok: false, status: 500, errorText: 'CF_AI_TOKEN or CF_ACCOUNT_ID missing' };
            return callCloudflare(entry.model, body, token, accountId, signal);
        }
    }
}

export default async function handler(request: Request) {
    // CORS Headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*', // Ou defina o domínio específico do GH Pages
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-RVM-App-Version',
    };

    // Handle OPTIONS (Pre-flight)
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
    }

    try {
        const body = await request.json() as Record<string, unknown>;

        // Env vars consolidadas (sanitizadas)
        const env: Record<string, string | undefined> = {
            GEMINI_API_KEY:  process.env.GEMINI_API_KEY?.replace(/['"]/g, '').trim(),
            MISTRAL_API_KEY: process.env.MISTRAL_API_KEY?.replace(/['"]/g, '').trim(),
            DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY?.replace(/['"]/g, '').trim(),
            CF_AI_TOKEN:     process.env.CF_AI_TOKEN?.replace(/['"]/g, '').trim(),
            CF_ACCOUNT_ID:   process.env.CF_ACCOUNT_ID?.replace(/['"]/g, '').trim(),
        };

        // Determinar nível de pensamento (Default: MEDIUM)
        const thinkingLevel: ThinkingLevel = ((body.thinking_level as string) || 'MEDIUM').toUpperCase() as ThinkingLevel;
        const modelsToTry = MODEL_STRATEGY[thinkingLevel] ?? MODEL_STRATEGY.MEDIUM;

        console.log(`[Orchestrator] Level: ${thinkingLevel} -> ${modelsToTry.map(e => `${e.provider}/${e.model}`).join(', ')}`);

        // --- CACHE LAYER (Intention Cache) ---
        // Calcular hash do prompt para servir de chave
        const promptText = JSON.stringify(body);
        let promptHash = '';
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(promptText);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            promptHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            console.warn('[Cache] Erro ao gerar hash:', e);
        }

        // Tentar recuperar do Supabase
        if (promptHash && process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) {
            try {
                const { createClient } = await import('@supabase/supabase-js');
                const supabase = createClient(
                    process.env.VITE_SUPABASE_URL,
                    process.env.VITE_SUPABASE_ANON_KEY
                );

                const { data: cached, error } = await supabase
                    .from('ai_intent_cache')
                    .select('response, thinking_level, model_used')
                    .eq('prompt_hash', promptHash)
                    .maybeSingle();

                if (cached && !error) {
                    console.log(`[Cache] HIT! (${promptHash.substring(0, 8)})`);
                    return new Response(JSON.stringify(cached.response), {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/json',
                            'X-RVM-Cache-Hit': 'true',
                            'X-RVM-Model-Used': cached.model_used || 'cached',
                            ...corsHeaders
                        },
                    });
                }
            } catch (err) {
                console.warn('[Cache] Falha ao verificar cache (prosseguindo sem cache):', err);
            }
        }

        let lastStatus = 500;
        // Loop de Tentativas (Circuit Breaker) com budget global
        let lastError = null;
        const errorTrace: string[] = [];
        const startedAt = Date.now();

        for (const entry of modelsToTry) {
            const elapsed   = Date.now() - startedAt;
            const remaining = GLOBAL_BUDGET_MS - elapsed;
            if (remaining <= 2_000) {
                errorTrace.push(`[${entry.provider}/${entry.model}]: skipped (global budget exhausted, elapsed=${elapsed}ms)`);
                console.warn(`[Proxy] Pulando ${entry.provider}/${entry.model}: orçamento global esgotado (${elapsed}ms).`);
                break;
            }
            const perModelTimeout = Math.min(PER_MODEL_TIMEOUT_MS, remaining - 500);
            const abortController = new AbortController();
            const abortTimer = setTimeout(() => abortController.abort(), perModelTimeout);

            try {
                const result = await callProvider(entry, body, env, abortController.signal);
                clearTimeout(abortTimer);

                // Se sucesso (200), retorna imediatamente
                if (result.ok) {
                    const data = result.data;

                    // --- CACHE SAVE ---
                    if (promptHash && process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) {
                        try {
                            const { createClient } = await import('@supabase/supabase-js');
                            const supabase = createClient(
                                process.env.VITE_SUPABASE_URL,
                                process.env.VITE_SUPABASE_ANON_KEY
                            );
                            const usage = (data as Record<string, unknown>)?.usageMetadata as Record<string, number> | undefined;
                            await supabase.from('ai_intent_cache').upsert({
                                prompt_hash:    promptHash,
                                prompt_preview: promptText.substring(0, 200),
                                thinking_level: thinkingLevel,
                                model_used:     `${entry.provider}/${entry.model}`,
                                response:       data,
                                input_tokens:   usage?.promptTokenCount     ?? 0,
                                output_tokens:  usage?.candidatesTokenCount ?? 0,
                                total_tokens:   usage?.totalTokenCount      ?? 0,
                                created_at:     new Date().toISOString(),
                            });
                        } catch (saveErr) {
                            console.warn('[Cache] Erro ao salvar:', saveErr);
                        }
                    }

                    const isFallback = entry !== modelsToTry[0];
                    return new Response(JSON.stringify(data), {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/json',
                            'X-RVM-Model-Used':     `${entry.provider}/${entry.model}`,
                            'X-RVM-Model-Fallback': isFallback ? 'true' : 'false',
                            ...corsHeaders,
                        },
                    });
                }

                // Erro: captura para analisar
                const { status, errorText } = result;
                let errorData: unknown;
                try { errorData = JSON.parse(errorText); } catch { errorData = { error: { message: errorText } }; }

                lastStatus = status;
                const failureMsg = `[${entry.provider}/${entry.model}]: ${status} - ${(errorData as Record<string, unknown>)?.error?.toString() ?? errorText}`;
                errorTrace.push(failureMsg);
                console.warn(`[Proxy] Falha:`, failureMsg);

                const isRetryable = status === 429 || status >= 500 ||
                    (status === 403 && errorText.includes('quota')) ||
                    status === 404 || status === 500; // 500 missing key → pula para próximo

                if (!isRetryable) {
                    return new Response(JSON.stringify(errorData), {
                        status: lastStatus,
                        headers: { 'Content-Type': 'application/json', ...corsHeaders },
                    });
                }

            } catch (networkError) {
                clearTimeout(abortTimer);
                const isAbort = (networkError as Error)?.name === 'AbortError';
                const netMsg  = isAbort
                    ? `[${entry.provider}/${entry.model}]: Aborted after ${perModelTimeout}ms`
                    : `[${entry.provider}/${entry.model}]: Network Error - ${networkError}`;
                console.error(netMsg);
                errorTrace.push(netMsg);
            }
        }

        // Se chegou aqui, todos os modelos falharam
        console.error('[Proxy] Todos os modelos/providers falharam.');

        // --- SYSTEM LOGGING (Centralized Alerts) ---
        if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) {
            try {
                const { createClient } = await import('@supabase/supabase-js');
                const supabase = createClient(
                    process.env.VITE_SUPABASE_URL,
                    process.env.VITE_SUPABASE_ANON_KEY
                );
                await supabase.from('ai_system_logs').insert({
                    level: 'ERROR',
                    message: `Todos os providers falharam`,
                    details: { errorTrace, thinkingLevel, promptPreview: promptText.substring(0, 100) }
                });
            } catch (logErr) {
                console.error('[Proxy] Falha ao registrar log de sistema:', logErr);
            }
        }

        // Se a falha foi puramente por timeout (Abort) ou esgotamento de budget,
        // retornamos 503 Service Unavailable com mensagem clara — evita o 504 genérico
        // do Vercel Edge runtime.
        const allTimedOut = errorTrace.length > 0 &&
            errorTrace.every(t => t.includes('Aborted') || t.includes('budget exhausted'));

        const allQuotaExhausted = errorTrace.length > 0 &&
            errorTrace.every(t => t.includes('429') || /resource exhausted|quota/i.test(t));

        let finalStatus: number;
        let friendly: string;
        if (allTimedOut) {
            finalStatus = 503;
            friendly = '⏱️ A IA demorou demais para responder (todos os providers). Tente novamente em alguns segundos ou reduza o escopo da pergunta.';
        } else if (allQuotaExhausted) {
            finalStatus = 429;
            friendly = '🚦 Cota esgotada em todos os providers da chain (429). '
                + 'Aguarde alguns minutos. Para aumentar quota do Gemini, habilite billing no Google AI Studio '
                + '(https://aistudio.google.com/apikey).';
        } else {
            finalStatus = lastStatus || 500;
            friendly = `⚠️ Erro técnico em todos os providers. Detalhes: ${errorTrace.join(' | ')}`;
        }

        return new Response(JSON.stringify({
            error: { message: friendly, trace: errorTrace }
        }), {
            status: finalStatus,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });

    } catch (error) {
        console.error('Error in chat proxy:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }, // Fallback sem cors se crashar antes
        });
    }
}
