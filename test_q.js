import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function test() {
    const { data } = await supabase.from('whatsapp_queue').select('*').eq('type', 'LEMBRETE_D9').order('created_at', { ascending: false }).limit(5);
    console.log(JSON.stringify(data, null, 2));
}
setTimeout(test, 5000);
