/**
 * Vercel Serverless Function - Proxy para Gemini API
 * Protege a API Key mantendo-a apenas no servidor.
 */

export const config = {
    runtime: 'edge', // Usa Vercel Edge Runtime (mais rápido/barato)
};

const MODELS = [
    'gemini-1.5-flash',       // Primary: Stable, Free Tier
    'gemini-2.0-flash-exp',   // Fallback 1: Experimental, usually higher limits
    'gemini-1.5-flash-8b'     // Fallback 2: Smaller, faster, backup
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

        let lastError = null;
        let lastStatus = 500;

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
                    return new Response(JSON.stringify(data), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
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
                lastError = errorData;

                // Log do erro (interno Vercel)
                console.warn(`[Proxy] Falha no modelo ${model} (${response.status}):`, errorData.error?.message || errorText);

                // Se for erro de cliente (ex: Bad Request 400), NÃO adianta tentar outro modelo.
                // Erros de cota geralmente são 429 ou 403 (com mensagem específica)
                // Vamos tentar o próximo apenas se for 429 (Too Many Requests) ou 5xx (Server Error)
                const isRetryable = response.status === 429 || response.status >= 500 ||
                    (response.status === 403 && errorText.includes('quota'));

                if (!isRetryable) {
                    // Erro fatal (ex: payload inválido), retorna erro para o cliente
                    return new Response(JSON.stringify(lastError), {
                        status: lastStatus,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }

                // Se for retryable, o loop continua para o próximo modelo...

            } catch (networkError) {
                console.error(`[Proxy] Erro de rede com ${model}:`, networkError);
                lastError = { error: { message: 'Network error connecting to Gemini API' } };
            }
        }

        // Se chegou aqui, todos os modelos falharam
        console.error('[Proxy] Todos os modelos falharam.');
        return new Response(JSON.stringify(lastError || { error: 'All models failed' }), {
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
