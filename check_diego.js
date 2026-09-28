import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function check() {
  const { data } = await supabase.from('publishers').select('*');
  const pub = data.find(p => p.data && p.data.name && p.data.name.includes('Diego Resmann'));
  console.log(JSON.stringify(pub, null, 2));
}
check();
