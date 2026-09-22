import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function run() {
  const { data: parts } = await supabase.from('workbook_parts').select('id, tipo_parte').eq('week_id', '2026-09-21').eq('status', 'DESIGNADA');
  if (parts && parts.length > 0) {
     const ids = parts.map(p => p.id);
     const { data: logs } = await supabase.from('zapi_dispatch_log').select('part_id, dispatch_type, status').in('part_id', ids).eq('dispatch_type', 'PUBLICACAO_S89');
     console.log("Parts with S89 sent:", logs?.length, "/", parts.length);
  }
}
run();
