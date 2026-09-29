import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function test() {
    const now = new Date();
    now.setHours(now.getHours() - 2);
    const { data, error } = await supabase.from('zapi_dispatch_log')
        .select('*')
        .gte('dispatched_at', now.toISOString())
        .order('dispatched_at', { ascending: false });
    console.log(error ? error : data);
}
test();
