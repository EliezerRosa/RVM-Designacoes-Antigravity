/**
 * Vercel Serverless Function - Proxy para Gemini API
 * Protege a API Key mantendo-a apenas no servidor.
 */

export const config = {
    runtime: 'edge', // Usa Vercel Edge Runtime (mais rápido/barato)
};

// Modelo de Estratégia (Resilience Architecture)
// Duplicado de src/lib/ai/types.ts para garantir independência da Serverless Function
//
// 2026-04-29: Diversificação anti-429.
//  - Pools de quota distintos por modelo (flash vs pro vs lite vs 1.5).
//    Se 2.0-flash bate 429, 2.5-flash e 1.5-flash provavelmente ainda têm quota.
//  - Modelos "pro" só ajudam se a API key tiver billing habilitado em AI Studio
//    (Tier 1+). Sem billing, dão 429 também — mas o loop pula adiante.
//  - 2.5-pro / 1.5-pro são fallbacks "premium" — o usuário com billing ganha
//    qualidade superior e quota muito maior; sem billing, custo zero (são
//    pulados rápido pelo Abort).
const MODEL_STRATEGY = {
    // LOW: Tarefas rápidas (High Efficiency)
    LOW: [
        'gemini-2.0-flash-lite',  // Ultra fast, free pool
        'gemini-2.5-flash',       // Next-gen flash, pool independente
        'gemini-1.5-flash'        // Pool legacy, último recurso free
    ],
    // MEDIUM: Raciocínio padrão (Standard)
    MEDIUM: [
        'gemini-2.5-flash',       // Workhorse atual, pool independente
        'gemini-2.0-flash',       // Pool free clássico
        'gemini-1.5-pro'          // Pool Pro legacy (precisa billing p/ quota alta)
    ],
    // HIGH: Arquitetura & Raciocínio
    HIGH: [
        'gemini-2.5-pro',                       // Top-tier raciocínio (billing recomendado)
        'gemini-2.0-flash-thinking-exp-01-21',  // Deep Think experimental
        'gemini-1.5-pro'                        // Fallback Pro estável
    ]
};

// Vercel Edge runtime tem limite de 25s wall-clock; reservamos 22s para o loop
// e 18s por modelo individual (com Abort) para não estourar e devolver 504 genérico.
const PER_MODEL_TIMEOUT_MS = 18_000;
const GLOBAL_BUDGET_MS = 22_000;

type ThinkingLevel = 'LOW' | 'MEDIUM' | 'HIGH';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

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
        const body = await request.json();
        // Sanitize API Key
        const apiKey = process.env.GEMINI_API_KEY?.replace(/['"]/g, '').trim();

        // Determinar nível de pensamento (Default: MEDIUM)
        const thinkingLevel: ThinkingLevel = (body.thinking_level || 'MEDIUM').toUpperCase();
        const modelsToTry = MODEL_STRATEGY[thinkingLevel] || MODEL_STRATEGY.MEDIUM;

        console.log(`[Orchestrator] Level: ${thinkingLevel} -> Models: ${modelsToTry.join(', ')}`);

        if (!apiKey) {
            return new Response(JSON.stringify({ error: 'Server misconfiguration: API Key not found' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
        }

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

        for (const model of modelsToTry) {
            const elapsed = Date.now() - startedAt;
            const remaining = GLOBAL_BUDGET_MS - elapsed;
            if (remaining <= 2_000) {
                errorTrace.push(`[${model}]: skipped (global budget exhausted, elapsed=${elapsed}ms)`);
                console.warn(`[Proxy] Pulando ${model}: orçamento global esgotado (${elapsed}ms).`);
                break;
            }
            const perModelTimeout = Math.min(PER_MODEL_TIMEOUT_MS, remaining - 500);
            const abortController = new AbortController();
            const abortTimer = setTimeout(() => abortController.abort(), perModelTimeout);

            try {
                // console.log(`[Proxy] Tentando modelo: ${model}...`); // Verbose off
                const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: abortController.signal,
                });
                clearTimeout(abortTimer);

                // Se sucesso (200), retorna imediatamente
                if (response.ok) {
                    const data = await response.json();

                    // --- CACHE SAVE ---
                    // Salvar resposta no cache para o futuro (Fire & Forget)
                    if (promptHash && process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) {
                        try {
                            const { createClient } = await import('@supabase/supabase-js');
                            const supabase = createClient(
                                process.env.VITE_SUPABASE_URL,
                                process.env.VITE_SUPABASE_ANON_KEY
                            );

                            // Não precisamos esperar o insert (Edge function tem tempo curto, mas fire-and-forget ajuda)
                            // Nota: Edge functions as vezes matam promessas pendentes. O ideal é ctx.waitUntil, 
                            // mas handler padrão web não tem isso fácil. Vamos tentar await rápido ou ignorar erro.
                            // Extract Usage Metadata (if available)
                            const usage = data.usageMetadata || {};
                            const inputTokens = usage.promptTokenCount || 0;
                            const outputTokens = usage.candidatesTokenCount || 0;
                            const totalTokens = usage.totalTokenCount || 0;

                            await supabase.from('ai_intent_cache').upsert({
                                prompt_hash: promptHash,
                                prompt_preview: promptText.substring(0, 200),
                                thinking_level: thinkingLevel,
                                model_used: model,
                                response: data,
                                input_tokens: inputTokens,
                                output_tokens: outputTokens,
                                total_tokens: totalTokens,
                                created_at: new Date().toISOString()
                            });
                        } catch (saveErr) {
                            console.warn('[Cache] Erro ao salvar:', saveErr);
                        }
                    }

                    // Adicionar header indicando se houve fallback (se não for o primeiro modelo)
                    const isFallback = model !== modelsToTry[0];
                    const headers = {
                        'Content-Type': 'application/json',
                        'X-RVM-Model-Used': model,
                        'X-RVM-Model-Fallback': isFallback ? 'true' : 'false'
                    };

                    return new Response(JSON.stringify(data), {
                        status: 200,
                        headers: { ...headers, ...corsHeaders },
                    });
                }

                // Se erro, captura para analisar
                const errorText = await response.text();
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch {
                    errorData = { error: { message: errorText } };
                }

                lastStatus = response.status;
                const failureMsg = `[${model}]: ${response.status} - ${errorData.error?.message || errorText}`;
                errorTrace.push(failureMsg);

                // Masked Key for debug
                const maskedKey = apiKey ? `...${apiKey.slice(-4)}` : 'MISSING';

                // Log do erro (interno Vercel)
                console.warn(`[Proxy] Falha no modelo ${model} (Key: ${maskedKey}):`, failureMsg);

                // Se for erro de cliente (ex: Bad Request 400), NÃO adianta tentar outro modelo.
                // Erros de cota geralmente são 429 ou 403 (com mensagem específica)
                // Vamos tentar o próximo apenas se for 429 (Too Many Requests) ou 5xx (Server Error) ou 404 (Model Not Found)
                const isRetryable = response.status === 429 || response.status >= 500 ||
                    (response.status === 403 && errorText.includes('quota')) ||
                    response.status === 404;

                if (!isRetryable) {
                    // Erro fatal (ex: payload inválido), retorna erro para o cliente
                    return new Response(JSON.stringify(errorData), {
                        status: lastStatus,
                        headers: { 'Content-Type': 'application/json', ...corsHeaders },
                    });
                }

                // Se for retryable, o loop continua para o próximo modelo...

            } catch (networkError) {
                clearTimeout(abortTimer);
                const isAbort = (networkError as Error)?.name === 'AbortError';
                const netMsg = isAbort
                    ? `[${model}]: Aborted after ${perModelTimeout}ms (per-model timeout)`
                    : `[${model}]: Network Error - ${networkError}`;
                console.error(netMsg);
                errorTrace.push(netMsg);
            }
        }

        // Se chegou aqui, todos os modelos falharam
        console.error('[Proxy] Todos os modelos falharam.');
        const maskedKeyFinal = apiKey ? `...${apiKey.slice(-4)}` : 'UNKNOWN';

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
                    message: `Todos os modelos falharam para a Key ${maskedKeyFinal}`,
                    details: {
                        errorTrace,
                        thinkingLevel,
                        promptPreview: promptText.substring(0, 100)
                    }
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
        // 2026-04-29: detectar quota Gemini esgotada em TODOS os modelos da chain.
        // Sinal: cada entrada do trace contém "429" ou "Resource exhausted" ou "quota".
        const allQuotaExhausted = errorTrace.length > 0 &&
            errorTrace.every(t => t.includes('429') || /resource exhausted|quota/i.test(t));

        let finalStatus: number;
        let friendly: string;
        if (allTimedOut) {
            finalStatus = 503;
            friendly = '⏱️ A IA demorou demais para responder. Tente novamente em alguns segundos ou reduza o escopo da pergunta.';
        } else if (allQuotaExhausted) {
            finalStatus = 429;
            friendly = '🚦 Cota da IA esgotada (todos os modelos da chain bateram 429). '
                + 'Aguarde alguns minutos ou habilite billing na sua API key do Google AI Studio '
                + '(https://aistudio.google.com/apikey) para liberar quota Tier 1+.';
        } else {
            finalStatus = lastStatus || 500;
            friendly = `⚠️ Ocorreu um erro técnico na comunicação com a IA. Detalhes: ${errorTrace.join(' | ')}`;
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
