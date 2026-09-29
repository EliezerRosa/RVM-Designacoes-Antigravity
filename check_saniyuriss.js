import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSaniyuriss() {
    const { data: logs, error } = await supabase
        .from('zapi_dispatch_log')
        .select('*')
        // Filtrar pelo part_id do Saniyuriss (108e103a-33e2-44a7-85eb-cc7d8f69ba43)
        .eq('part_id', '108e103a-33e2-44a7-85eb-cc7d8f69ba43')
        .order('dispatched_at', { ascending: false });

    if (error) {
        console.error(error);
        return;
    }
    console.log(JSON.stringify(logs, null, 2));
}

checkSaniyuriss();
