import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Searching for parts...");
    const { data: parts } = await supabase
        .from('workbook_parts')
        .select('*')
        .eq('needs_reassignment', true)
        .order('date', { ascending: false })
        .limit(10);
        
    console.log("Matched parts:", JSON.stringify(parts, null, 2));

    const { data: logs } = await supabase
        .from('zapi_smart_interactions')
        .select('*')
        .ilike('publisher_name', '%Edmardo%')
        .limit(5);
    console.log("Edmardo logs:", JSON.stringify(logs, null, 2));
}
run();
