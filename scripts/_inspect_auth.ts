import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://pevstuyzlewvjidjkmea.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc3NzM1NiwiZXhwIjoyMDgxMzUzMzU2fQ.N-vb7L0PVsMoLh1pu495g3XkTY8AqNhgyWuK6U4Awn4');
for (const t of ['auth_logs','transaction_logs','auth_requests']) {
  const { data, error, count } = await sb.from(t).select('*', { count: 'exact' }).order('created_at',{ascending:false}).limit(3);
  console.log('===', t, 'count=', count, 'err=', error?.message);
  console.log(JSON.stringify(data, null, 2));
}
