import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkStatus() {
    const { data, error } = await supabase.from('workbook_parts').select('status');
    const statuses = new Set(data.map(d => d.status));
    console.log("Status encontrados:", Array.from(statuses));
}
checkStatus().catch(console.log);
