import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function test() {
    const { data } = await supabase.from('zapi_dispatch_log').select('*').limit(20).order('created_at', { ascending: false });
    console.log(data);
}
test();
