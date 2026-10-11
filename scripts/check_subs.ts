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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    const { data, error } = await supabase
        .from('workbook_parts')
        .select('id, resolved_publisher_id, substituted_publisher_name, is_substitution, is_manual_override')
        .gte('date', '2026-01-01');
    console.log(data?.filter(d => d.substituted_publisher_name || d.is_substitution).slice(0,10));
}
main();
