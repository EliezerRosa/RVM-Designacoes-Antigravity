import './node-shims.cjs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pevstuyzlewvjidjkmea.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function findPublisher() {
  const { data, error } = await supabase.from('publishers').select('id, data');
  if (error) {
    console.error('Error fetching publishers:', error);
    return;
  }
  console.log(`Total publishers: ${data?.length}`);
  const matches = data.filter(p => {
    const s = JSON.stringify(p.data || {});
    return s.includes('2035302') || s.includes('992035302') || s.includes('92035302');
  });

  console.log('Matches by phone:');
  for (const m of matches) {
    console.log(`ID: ${m.id} | Name: ${m.data?.name} | Phone: ${m.data?.phone || m.data?.contact_phone}`);
    // Check tokens
    const { data: tokens } = await supabase
      .from('publisher_tokens')
      .select('*')
      .eq('publisher_id', m.id);
    console.log(`Tokens for ${m.data?.name}:`, tokens);
  }

  // Também verificar se o Fictício Teste tem token
  const ficticio = data.find(p => /fict[íi]cio/i.test(p.data?.name || ''));
  if (ficticio) {
    console.log(`\nFictício: ID=${ficticio.id} | Name=${ficticio.data?.name}`);
    const { data: fTokens } = await supabase
      .from('publisher_tokens')
      .select('*')
      .eq('publisher_id', ficticio.id);
    console.log('Tokens for Fictício:', fTokens);
  }
}

findPublisher();
