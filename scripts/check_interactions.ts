import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase URL or Key');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Fetching recent interactions...");
    const { data } = await supabase.from('zapi_smart_interactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);
    
    if (data) {
        for (const item of data) {
            console.log(`\nTime: ${item.created_at}`);
            console.log(`Pub: ${item.publisher_name}`);
            console.log(`Text: ${item.inbound_text}`);
            console.log(`Intent: ${item.detected_intent}`);
            console.log(`Action: ${item.action_taken}`);
            console.log(`Reason: ${item.reason_extracted}`);
        }
    }
}
run();
