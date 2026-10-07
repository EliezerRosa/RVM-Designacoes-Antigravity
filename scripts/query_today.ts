import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const today = new Date().toISOString().split('T')[0];
    const { data: logs } = await supabase
        .from('zapi_smart_interactions')
        .select('*')
        .gte('created_at', today)
        .order('created_at', { ascending: false })
        .limit(30);
    console.log(JSON.stringify(logs, null, 2));
}
run();
