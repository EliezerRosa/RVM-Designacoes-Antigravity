const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        let val = match[2].trim();
        if (val.startsWith('\'') || val.startsWith('\"')) val = val.slice(1, -1);
        acc[match[1].trim()] = val;
    }
    return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
sb.from('workbook_parts')
  .select('week_id, date, status, resolved_publisher_id')
  .eq('status', 'PROPOSTA')
  .not('resolved_publisher_id', 'is', null)
  .order('date', {ascending: true})
  .limit(1)
  .then(res => console.log(JSON.stringify(res.data)))
  .catch(console.error);
