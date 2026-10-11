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
    const { data: zapi, error: zapiErr } = await supabase
        .from('zapi_smart_interactions')
        .select('*')
        .ilike('publisher_name', '%Israel%');
    console.log("Israel interactions:", zapiErr ? zapiErr.message : zapi);
}
main();
