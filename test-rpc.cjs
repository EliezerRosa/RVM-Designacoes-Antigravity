const fs = require('fs');
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function test() {
  const adminClient = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  const sql = `
    CREATE OR REPLACE FUNCTION public.test_rpc() RETURNS int LANGUAGE plpgsql AS $$
    DECLARE
      c int;
    BEGIN
      EXECUTE 'set local role authenticated';
      EXECUTE 'set local request.jwt.claims = ''{"sub": "11111111-1111-1111-1111-111111111111", "email": "test@test.com", "role": "authenticated"}''';
      SELECT count(*) INTO c FROM public.rm_get_service_year_stats(2026, '40a1feb0-25eb-4290-9083-31c771248c5f'::uuid);
      RETURN c;
    END;
    $$;
  `;
  
  let res = await adminClient.rpc('exec_sql', { sql });
  if (res.error) {
    console.error('Create error:', res.error);
    return;
  }
  
  res = await adminClient.rpc('test_rpc');
  console.log('Test RPC result:', res);
}

test();
