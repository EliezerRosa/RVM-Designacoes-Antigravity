import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function run() {
  const { data } = await supabase.from('zapi_dispatch_log').select('dispatch_type').limit(100);
  const types = new Set(data?.map(d => d.dispatch_type));
  console.log("Dispatch types:", Array.from(types));
}
run();
