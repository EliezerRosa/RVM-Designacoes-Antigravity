require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  const { data, error } = await supabase
    .schema('rm')
    .from('monthly_reports')
    .select('publisher_id, has_preached, hours, bible_studies, publishers!inner(name, id), v_publishers_status!inner(field_service_status)')
    .eq('service_year', 2026)
    .eq('congregation_id', '40a1feb0-25eb-4290-9083-31c771248c5f')
    .limit(10);
    
  console.log('Error:', error);
  if (data?.length) console.log(data);
}
test();
