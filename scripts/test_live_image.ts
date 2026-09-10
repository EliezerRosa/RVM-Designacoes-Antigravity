import './node-shims.cjs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pevstuyzlewvjidjkmea.supabase.co';
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!).trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const imagePath = 'public/territories/territory_card_01.png';
  const imgBuffer = fs.readFileSync(imagePath);
  const base64 = imgBuffer.toString('base64');
  console.log('Image size:', base64.length, 'bytes');

  const phone = '5527992035302';
  console.log('Invoking send-whatsapp with send-image to', phone);
  const { data, error } = await supabase.functions.invoke('send-whatsapp', {
    body: {
      action: 'send-image',
      phone,
      image: base64,
      caption: '',
    },
  });
  console.log('Result data:', data);
  console.log('Result error:', error);
}

run();
