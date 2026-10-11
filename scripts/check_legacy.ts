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

const supabase = createClient(url, key);

async function main() {
    const { data, error } = await supabase
        .from('workbook_parts')
        .select('date, year, resolved_publisher_name, tipo_parte')
        .eq('batch_id', '8bf0fec5-1a12-47a2-a6bb-d1553b024640')
        .limit(10);
    console.log("Legacy Parts:", error ? error.message : JSON.stringify(data, null, 2));
}
main();
