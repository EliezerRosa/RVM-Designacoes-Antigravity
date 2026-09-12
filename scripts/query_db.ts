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
        .eq('detected_intent', 'DISPONIBILIDADE')
        .order('created_at', { ascending: false })
        .limit(10);
    
    if (error) {
        console.error("Error:", error);
    } else {
        const item = data[0];
        if (item) {
            console.log("Raw payload of the first DISPONIBILIDADE match:");
            console.log(JSON.stringify(item.raw_payload, null, 2));
        } else {
            console.log("No data found.");
        }
    }
}

checkLog();
