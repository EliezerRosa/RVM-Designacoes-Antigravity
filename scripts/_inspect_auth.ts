import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://pevstuyzlewvjidjkmea.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
for (const t of ['auth_logs','transaction_logs','auth_requests']) {
  const { data, error, count } = await sb.from(t).select('*', { count: 'exact' }).order('created_at',{ascending:false}).limit(3);
  console.log('===', t, 'count=', count, 'err=', error?.message);
  console.log(JSON.stringify(data, null, 2));
}
