import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  console.log('--- WORKBOOK PARTS (RECENT) ---');
  const { data: parts } = await supabase.from('workbook_parts')
    .select('id, week_id, tipo_parte, resolved_publisher_id, is_substitution, substituted_publisher_name, needs_reassignment, status, updated_at')
    .not('updated_at', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(5);
  console.log(parts);

  console.log('--- RECENT DISPATCHES (communication_logs) ---');
  const { data: comms } = await supabase.from('communication_logs')
    .select('id, type, phone, status, error, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log(comms);
}
check();
