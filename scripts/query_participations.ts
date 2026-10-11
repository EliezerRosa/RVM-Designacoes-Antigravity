import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envFile = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf-8');
let url = '';
let key = '';
envFile.split('\n').forEach(line => {
    if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].replace(/"/g, '').trim();
    if (line.startsWith('VITE_SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].replace(/"/g, '').trim();
});

const SUPABASE_URL = url;
const SUPABASE_KEY = key;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Supabase URL or Key is missing.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    try {
        const { data: parts, error: partsErr } = await supabase
            .from('workbook_parts')
            .select('resolved_publisher_id, tipo_parte, modalidade')
            .gte('date', '2026-01-01')
            .lte('date', new Date().toISOString().split('T')[0])
            .not('resolved_publisher_id', 'is', null);

        if (partsErr) throw partsErr;

        const { data: pubs, error: pubsErr } = await supabase
            .from('publishers')
            .select('id, data');

        if (pubsErr) throw pubsErr;

        const pubMap = new Map();
        pubs.forEach(p => {
            if (p.data && (p.data.condition === 'Ancião' || p.data.condition === 'Servo Ministerial' || p.data.condition === 'Anciao')) {
                pubMap.set(p.id, {
                    name: p.data.name,
                    condition: p.data.condition === 'Anciao' ? 'Ancião' : p.data.condition
                });
            }
        });

        const flatData = [];
        for (const p of parts) {
            const pubId = p.resolved_publisher_id;
            const pubInfo = pubMap.get(pubId);
            if (pubInfo) {
                flatData.push({
                    name: pubInfo.name,
                    group: pubInfo.condition,
                    tipo_parte: p.tipo_parte || p.modalidade || 'Desconhecido'
                });
            }
        }

        const counts = {};
        for(const item of flatData) {
            const key = item.name + '|' + item.group + '|' + item.tipo_parte;
            counts[key] = (counts[key] || 0) + 1;
        }

        const finalData = Object.entries(counts).map(([key, count]) => {
            const [name, group, tipo_parte] = key.split('|');
            return { name, group, tipo_parte, count };
        });

        console.log(JSON.stringify(finalData, null, 2));

    } catch (err) {
        console.error(err);
    }
}

main();
