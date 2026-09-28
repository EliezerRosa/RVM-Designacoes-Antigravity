import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  console.log('--- RECENT DISPATCHES (zapi_dispatch_logs) ---');
  const { data: zapi } = await supabase.from('zapi_dispatch_logs')
    .select('id, context, recipient_phone, status, created_at, error_details')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log(zapi);
}
check();
