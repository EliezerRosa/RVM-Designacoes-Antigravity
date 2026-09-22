import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function run() {
  const { data } = await supabase.from('workbook_parts').select('week_id, date, tipo_parte, status, needs_reassignment').order('date', {ascending: false}).limit(30);
  console.log(data);
}
run();
