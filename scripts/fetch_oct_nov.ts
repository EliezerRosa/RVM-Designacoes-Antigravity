import { config } from 'dotenv';
config({ path: '.env.local' });

// Polyfill para o Vite import.meta.env
// @ts-ignore
globalThis.import = { meta: { env: process.env } };

import { fetchWorkbookFromJwOrg } from '../src/services/jwOrgService';

async function run() {
    const dates = [
        '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26',
        '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'
    ];
    for (const d of dates) {
        const res = await fetchWorkbookFromJwOrg(new Date(d + 'T12:00:00Z'));
        console.log(`\n=== Semana ${d} ===`);
        if (res.success) {
            for (const p of res.parts) {
                if (p.descricao) {
                    console.log(`[${p.partTitle}] - ${p.descricao}`);
                }
            }
        } else {
            console.log(`Falha: ${res.error}`);
        }
    }
}
run().catch(console.error);
