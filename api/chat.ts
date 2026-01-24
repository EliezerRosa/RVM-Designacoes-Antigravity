/**
 * Vercel Serverless Function - Proxy para Gemini API
 * Protege a API Key mantendo-a apenas no servidor.
 */

export const config = {
    runtime: 'edge', // Usa Vercel Edge Runtime (mais rápido/barato)
};

// Modelo de Estratégia (Resilience Architecture)
// Duplicado de src/lib/ai/types.ts para garantir independência da Serverless Function
const MODEL_STRATEGY = {
    // LOW: Tarefas rápidas (High Efficiency)
    LOW: [
        'gemini-2.0-flash-lite',  // Ultra fast (New)
        'gemini-2.0-flash',       // Fast Standard, often free
        'gemini-2.0-flash-lite-001' // Fallback
    ],
    // MEDIUM: Raciocínio padrão (Standard)
    MEDIUM: [
        'gemini-2.0-flash',       // Standard Workhorse
        'gemini-2.5-flash',       // Next-Gen Speed
        'gemini-2.0-flash-001'    // Fallback
    ],
    // HIGH: Arquitetura (High Intellect)
    HIGH: [
        'gemini-2.5-pro',         // Next-Gen Intellect
        'gemini-2.0-flash-exp',   // Experimental SOTA
        'gemini-2.5-pro-preview-tts' // Fallback
    ]
};

type ThinkingLevel = 'LOW' | 'MEDIUM' | 'HIGH';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export default async function handler(request: Request) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
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
                headers: { 'Content-Type': 'application/json' },
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
                            'X-RVM-Model-Used': cached.model_used || 'cached'
                        },
                    });
                }
            } catch (err) {
                console.warn('[Cache] Falha ao verificar cache (prosseguindo sem cache):', err);
            }
        }

        let lastStatus = 500;
        // Loop de Tentativas (Circuit Breaker)
        let lastError = null;
        const errorTrace: string[] = [];

        for (const model of modelsToTry) {
            try {
                // console.log(`[Proxy] Tentando modelo: ${model}...`); // Verbose off
                const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });

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
                            await supabase.from('ai_intent_cache').upsert({
                                prompt_hash: promptHash,
                                prompt_preview: promptText.substring(0, 200),
                                thinking_level: thinkingLevel,
                                model_used: model,
                                response: data,
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
                        headers: headers,
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
                        headers: { 'Content-Type': 'application/json' },
                    });
                }

                // Se for retryable, o loop continua para o próximo modelo...

            } catch (networkError) {
                const netMsg = `[${model}]: Network Error - ${networkError}`;
                console.error(netMsg);
                errorTrace.push(netMsg);
            }
        }

        // Se chegou aqui, todos os modelos falharam
        console.error('[Proxy] Todos os modelos falharam.');
        const maskedKeyFinal = apiKey ? `...${apiKey.slice(-4)}` : 'UNKNOWN';

        // TENTATIVA DE DIAGNÓSTICO FINAL: Listar modelos disponíveis
        let availableModelsList = 'Não foi possível listar modelos.';
        try {
            const listModelsUrl = `${BASE_URL}?key=${apiKey}`;
            const listResponse = await fetch(listModelsUrl);
            const listData = await listResponse.json();
            if (listData.models) {
                const modelNames = listData.models.map((m: any) => m.name.replace('models/', ''));
                availableModelsList = `Modelos Disponíveis para sua Key: [${modelNames.join(', ')}]`;
                console.warn('[Proxy Diagnostics]', availableModelsList);
            }
        } catch (diagErr) {
            console.error('[Proxy Diagnostics Error]', diagErr);
        }

        return new Response(JSON.stringify({
            error: {
                message: `Todos os modelos falharam (Key: ${maskedKeyFinal}). Detalhes: ` + errorTrace.join(' | ') + ` | DIAGNÓSTICO: ${availableModelsList}`
            }
        }), {
            status: lastStatus,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in chat proxy:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
