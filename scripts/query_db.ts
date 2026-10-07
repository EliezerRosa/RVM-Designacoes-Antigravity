import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLog() {
    console.log("Querying zapi_smart_interactions...");
    const { data, error } = await supabase
        .from('zapi_smart_interactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
    
    if (error) {
        console.error("Error:", error);
    } else {
        console.log(`Found ${data?.length} interactions for Eliezer:`);
        data?.forEach(item => {
            console.log(`- [${item.created_at}] Intent: ${item.detected_intent} | Action: ${item.action_taken} | Text: ${item.inbound_text}`);
        });
    }
}

checkLog();
