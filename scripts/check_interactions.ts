import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data } = await supabase.from('zapi_smart_interactions')
        .select('*')
        .not('inbound_text', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10);
    
    if (data) {
        for (const item of data) {
            console.log(`Time: ${item.created_at} | Pub: ${item.publisher_name} | Intent: ${item.detected_intent} | Action: ${item.action_taken}`);
            console.log(`Text: ${item.inbound_text}`);
            if (item.reason_extracted) console.log(`Reason: ${item.reason_extracted}`);
            console.log('---');
        }
    }
}
run();
