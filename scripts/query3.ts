import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function run() {
  const { data } = await supabase.from('zapi_dispatch_log').select('*').ilike('dispatch_type', '%LEMBRETE%').order('created_at', {ascending: false}).limit(10);
  console.log("Reminders:", data);
}
run();
