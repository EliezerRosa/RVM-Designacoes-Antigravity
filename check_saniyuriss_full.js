import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSaniyuriss() {
    console.log('--- BUSCA NA TABELA NOTIFICATIONS (FRONTEND) ---');
    const { data: notifs } = await supabase
        .from('notifications')
        .select('*')
        .ilike('recipient_name', '%Saniyuriss%');
    console.log(JSON.stringify(notifs, null, 2));

    console.log('\n--- BUSCA NA TABELA CANONICA ZAPI_DISPATCH_LOG ---');
    const { data: logs } = await supabase
        .from('zapi_dispatch_log')
        .select('*')
        .eq('part_id', '108e103a-33e2-44a7-85eb-cc7d8f69ba43');
    console.log(JSON.stringify(logs, null, 2));
}

checkSaniyuriss();
