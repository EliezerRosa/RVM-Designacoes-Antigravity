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
        .select('date')
        .order('date', { ascending: false })
        .limit(1);
    
    const { data: minData } = await supabase
        .from('workbook_parts')
        .select('date')
        .order('date', { ascending: true })
        .limit(1);

    console.log("Max date:", data);
    console.log("Min date:", minData);
}
main();
