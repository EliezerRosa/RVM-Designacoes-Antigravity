import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function investigateHistory() {
    // Check if there are any tables named history or audit
    const { data: tables } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .ilike('table_name', '%log%');
    console.log("Log tables:", tables);

    // Let's check refusal_logs just in case
    const partId = '8e7b943c-51b0-4f6f-9387-90d0d2a930e3';
    const { data: refusalLogs } = await supabase
        .from('refusal_logs')
        .select('*')
        .eq('part_id', partId);
    console.log("Refusal logs:", refusalLogs);
    
    // Let's check zapi_dispatch_log for this part
    const { data: dispatchLogs } = await supabase
        .from('zapi_dispatch_log')
        .select('created_at, dispatch_type, status, error_message')
        .eq('part_id', partId)
        .order('created_at', { ascending: false });
    console.log("Dispatch logs:", dispatchLogs);
    
    // Let's see if there's any trigger or audit log
    const { data: anyHistory } = await supabase.rpc('get_part_history', { part_id: partId }).catch(() => ({data: null}));
    console.log("RPC get_part_history:", anyHistory);
}

investigateHistory();
