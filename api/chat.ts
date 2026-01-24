/**
 * Vercel Serverless Function - Proxy para Gemini API
 * Protege a API Key mantendo-a apenas no servidor.
 */

export const config = {
    runtime: 'edge', // Usa Vercel Edge Runtime (mais rápido/barato)
};

const MODELS = [
    'gemini-1.5-flash',       // Primary
    'gemini-1.5-flash-002',   // Alternate 1: Specific version
    'gemini-1.5-flash-001',   // Alternate 2: Older specific version
    'gemini-2.0-flash-exp',   // Fallback 3: Experimental (often quota limited)
    'gemini-1.5-pro',         // Fallback 4: Standard Pro
    'gemini-pro'              // Fallback 5: Legacy 1.0 (Emergency)
];

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
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return new Response(JSON.stringify({ error: 'Server misconfiguration: API Key not found' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        let lastStatus = 500;
        const errorTrace: string[] = [];

        // Tentar modelos em sequência (Circuit Breaker / Fallback)
        for (const model of MODELS) {
            try {
                // console.log(`[Proxy] Tentando modelo: ${model}...`);

                const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });

                // Se sucesso (200), retorna imediatamente
                if (response.ok) {
                    const data = await response.json();

                    // Adicionar header indicando se houve fallback (se não for o primeiro modelo)
                    const isFallback = model !== MODELS[0];
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

                // Log do erro (interno Vercel)
                console.warn(`[Proxy] Falha no modelo ${model}:`, failureMsg);

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
        return new Response(JSON.stringify({
            error: {
                message: 'Todos os modelos de IA falharam (Fallback esgotado). Detalhes: ' + errorTrace.join(' | ')
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
