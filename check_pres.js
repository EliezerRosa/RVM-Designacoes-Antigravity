import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function check() {
  const { data } = await supabase.from('workbook_parts').select('*').eq('week_id', '2026-09-28');
  const pres = data.find(p => p.section === 'Início da Reunião' || p.tipo_parte === 'Presidente' || p.tipo_parte?.toLowerCase().includes('presidente'));
  console.log(JSON.stringify(pres, null, 2));
}
check();
