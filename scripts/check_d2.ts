import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkD2() {
  const { data: weekData } = await supabase
    .from('workbook_parts')
    .select('week_id, date, tipo_parte, publisher_id, status, needs_reassignment')
    .eq('week_id', '2026-09-21')
    .limit(5);

  if (weekData && weekData.length > 0) {
      const targetDateStr = weekData[0].date;
      const targetDate = new Date(targetDateStr + "T00:00:00-03:00");
      
      const today = new Date();
      const ptBrDateStr = today.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
      const spDate = new Date(ptBrDateStr);
      
      const tDateOnly = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      const spDateOnly = new Date(spDate.getFullYear(), spDate.getMonth(), spDate.getDate());

      const diffTime = tDateOnly.getTime() - spDateOnly.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      console.log(`Diff days calculated using America/Sao_Paulo: ${diffDays}`);
  }

  const { data: logs } = await supabase
    .from('zapi_dispatch_log')
    .select('*')
    .gte('created_at', '2026-09-22T00:00:00Z')
    .ilike('dispatch_type', '%LEMBRETE%')
    .order('created_at', { ascending: false });

  console.log("Recent reminders sent today:", logs?.length);
  if (logs && logs.length > 0) console.log(logs.slice(0, 2));
}

checkD2();
