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
    const { data: sched, error: schedErr } = await supabase
        .from('scheduled_assignments')
        .select('id, publisher_name, part_type, week_display, status');
    console.log("Scheduled Assignments:", sched?.length || 0, "parts.");
    if (sched && sched.length > 0) {
        console.log(sched.slice(0, 5));
    }
}
main();
