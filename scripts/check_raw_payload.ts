import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data } = await supabase.from('zapi_smart_interactions')
        .select('*')
        .gte('created_at', '2026-10-06T15:50:00')
        .order('created_at', { ascending: false });
    
    if (data) {
        for (const item of data) {
            console.log(`\n=======================`);
            console.log(`Time: ${item.created_at} | Action: ${item.action_taken}`);
            console.log(`Text: ${item.inbound_text}`);
            console.log(`Payload: ${JSON.stringify(item.raw_payload, null, 2)}`);
        }
    }
}
run();
