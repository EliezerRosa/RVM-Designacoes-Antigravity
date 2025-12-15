export const config = {
    runtime: 'edge',
};

export default async function handler(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }

    try {
        const data = await request.json();
        const { block_id, content } = data;

        if (!block_id || content === undefined) {
            return new Response(JSON.stringify({ error: 'Missing block_id or content' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        }

        const token = process.env.GITHUB_TOKEN;
        if (!token) {
            return new Response(JSON.stringify({ error: 'Server misconfiguration: No token' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        }

        const owner = process.env.REPO_OWNER || 'EliezerRosa';
        const repo = process.env.REPO_NAME || 'RVM-Designacoes-Antigravity';

        const githubResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/dispatches`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'RVM-Gateway',
                },
                body: JSON.stringify({
                    event_type: 'atomic_write',
                    client_payload: { block_id, content },
                }),
            }
        );

        if (githubResponse.status === 204) {
            return new Response(JSON.stringify({
                status: 'accepted',
                message: 'Transação enfileirada no Atomic Writer',
                block_id,
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        } else {
            const errorText = await githubResponse.text();
            return new Response(JSON.stringify({ error: `GitHub API error: ${errorText}` }), {
                status: githubResponse.status,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        }
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
}
