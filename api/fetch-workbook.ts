/**
 * Vercel Edge Function — Proxy para buscar apostila do wol.jw.org
 * Evita CORS e retorna o HTML da reunião para parsing no client.
 */

export const config = {
    runtime: 'edge',
};

const WOL_BASE = 'https://wol.jw.org/pt/wol';

export default async function handler(request: Request) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        const url = new URL(request.url);
        const year = url.searchParams.get('year');
        const week = url.searchParams.get('week');

        if (!year || !week) {
            return new Response(
                JSON.stringify({ error: 'Parâmetros year e week são obrigatórios' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validar inputs para evitar SSRF
        const yearNum = parseInt(year);
        const weekNum = parseInt(week);
        if (isNaN(yearNum) || isNaN(weekNum) || yearNum < 2020 || yearNum > 2040 || weekNum < 1 || weekNum > 53) {
            return new Response(
                JSON.stringify({ error: 'Parâmetros inválidos' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 1. Busca a página de reunião da semana para encontrar o link do artigo
        const meetingsUrl = `${WOL_BASE}/meetings/r5/lp-t/${yearNum}/${weekNum}`;
        const meetingsRes = await fetch(meetingsUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RVM-Designacoes/1.0)' },
        });

        if (!meetingsRes.ok) {
            return new Response(
                JSON.stringify({ error: `Erro ao buscar índice: HTTP ${meetingsRes.status}` }),
                { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const meetingsHtml = await meetingsRes.text();

        // 2. Extrair link do artigo da apostila (ex: /pt/wol/d/r5/lp-t/202026083)
        const articleMatch = meetingsHtml.match(/href="(\/pt\/wol\/d\/r5\/lp-t\/\d+)"/);
        if (!articleMatch) {
            return new Response(
                JSON.stringify({ error: 'Artigo da apostila não encontrado para esta semana' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 3. Busca o artigo completo
        const articleUrl = `https://wol.jw.org${articleMatch[1]}`;
        const articleRes = await fetch(articleUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RVM-Designacoes/1.0)' },
        });

        if (!articleRes.ok) {
            return new Response(
                JSON.stringify({ error: `Erro ao buscar artigo: HTTP ${articleRes.status}` }),
                { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const articleHtml = await articleRes.text();

        return new Response(
            JSON.stringify({ success: true, html: articleHtml, articleUrl }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
