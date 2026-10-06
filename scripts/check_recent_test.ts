import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
    const { data } = await supabase.from('zapi_smart_interactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);
    console.log(JSON.stringify(data, null, 2));
}
run();
