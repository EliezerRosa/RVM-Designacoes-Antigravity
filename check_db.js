import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const today = new Date().toISOString().split('T')[0];

  console.log('--- RECENT WORKBOOK PARTS ---');
  const { data: parts } = await supabase.from('workbook_parts')
    .select('id, week_id, tipo_parte, resolved_publisher_id, is_substitution, substituted_publisher_name, needs_reassignment, status, updated_at')
    .order('updated_at', { ascending: false })
    .limit(5);
  console.log(parts);

  console.log('--- RECENT WEBHOOK LOGS ---');
  const { data: logs } = await supabase.from('webhook_logs')
    .select('id, event_type, payload, processed, created_at, error')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log(logs);

  console.log('--- RECENT REFUSAL LOGS ---');
  const { data: refusals } = await supabase.from('refusal_logs')
    .select('id, publisher_name, week_id, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log(refusals);

  console.log('--- SYSTEM HEALTH ---');
  const { data: system } = await supabase.from('system_health')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(5);
  console.log(system);
}
check();
