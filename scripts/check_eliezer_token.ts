import './node-shims.cjs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pevstuyzlewvjidjkmea.supabase.co';
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!).trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkEliezerToken() {
  // 1. Check settings availability_tokens
  const { data: setRes, error: setErr } = await supabase
    .from('settings')
    .select('*')
    .eq('key', 'availability_tokens')
    .maybeSingle();

  console.log('settings availability_tokens:', setRes, setErr);

  // 2. Check publisher_tokens
  const { data: pubTokens, error: ptErr } = await supabase
    .from('publisher_tokens')
    .select('*')
    .eq('publisher_id', '3');

  console.log('publisher_tokens for publisher_id 3:', pubTokens, ptErr);

  // 3. Check all tokens in publisher_tokens
  const { data: allPt } = await supabase.from('publisher_tokens').select('*').limit(5);
  console.log('Sample publisher_tokens:', allPt);
}

checkEliezerToken();
