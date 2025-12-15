// Vercel Serverless Function (Node.js runtime, not Edge)
// Path: /api/save

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { block_id, content } = req.body;

        if (!block_id || content === undefined) {
            return res.status(400).json({ error: 'Missing block_id or content' });
        }

        const token = process.env.GITHUB_TOKEN;
        if (!token) {
            return res.status(500).json({ error: 'Server misconfiguration: No token' });
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
            return res.status(200).json({
                status: 'accepted',
                message: 'Transação enfileirada no Atomic Writer',
                block_id,
            });
        } else {
            const errorText = await githubResponse.text();
            return res.status(githubResponse.status).json({ error: `GitHub API error: ${errorText}` });
        }
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
