import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  console.log('--- RECENT WEBHOOK LOGS ---');
  const { data: webhooks } = await supabase.from('webhook_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log(webhooks);

  console.log('--- RECENT NOTIFICATIONS ---');
  // I don't know the exact name of the table for notifications, let's check table names
  const { data: tables } = await supabase.rpc('get_tables'); // maybe?
}
check();
