import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: logs } = await supabase
        .from('zapi_smart_interactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
    for (const log of logs || []) {
        console.log(`[${log.created_at}] Name: ${log.publisher_name} | Intent: ${log.detected_intent} | Action: ${log.action_taken} | Text: ${log.inbound_text}`);
    }
}
run();
