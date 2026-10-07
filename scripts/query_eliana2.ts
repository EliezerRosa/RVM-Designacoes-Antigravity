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
        .ilike('publisher_name', '%Eliana%')
        .order('created_at', { ascending: false })
        .limit(10);
    console.log("Eliana logs: ", JSON.stringify(logs, null, 2));
}
run();
