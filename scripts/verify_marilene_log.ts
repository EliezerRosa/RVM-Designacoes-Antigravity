import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
    const partId = '8e7b943c-51b0-4f6f-9387-90d0d2a930e3';
    console.log(`\n--- VERIFICANDO BD PARA A PARTE: ${partId} ---`);

    const { data: part } = await supabase.from('workbook_parts').select('id, resolved_publisher_name, status, updated_at, status_changed_at').eq('id', partId).single();
    console.log("1. DADOS ATUAIS DA PARTE:", part);

    const { data: dispatchLogs, error: dispatchErr } = await supabase.from('zapi_dispatch_log').select('*').eq('part_id', partId);
    console.log("2. REGISTROS NO LOG CANÔNICO (zapi_dispatch_log):", dispatchLogs?.length ? dispatchLogs : "VAZIO");
    if (dispatchErr) console.error(dispatchErr);

    const { data: interactions } = await supabase.from('zapi_smart_interactions').select('id, detected_intent, inbound_text, created_at, publisher_name').eq('workbook_part_id', partId).order('created_at', { ascending: true });
    console.log("3. REGISTROS DE INBOUND (zapi_smart_interactions):", interactions);
}
run();
