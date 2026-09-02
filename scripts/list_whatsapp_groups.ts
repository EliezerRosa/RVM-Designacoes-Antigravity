import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key);

async function listGroups() {
  console.log('Invoking send-whatsapp with action: list-groups');
  const { data, error } = await supabase.functions.invoke('send-whatsapp', {
    body: { action: 'list-groups' }
  });

  if (error) {
    console.error('Error invoking function:', error);
    return;
  }

  if (data?.groups) {
    console.log('Groups/Broadcast Lists found:');
    data.groups.forEach((g: any) => {
      console.log(`- ${g.name}: ${g.id}`);
    });
  } else {
    console.log('Response:', data);
  }
}

listGroups();
