import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
    // Check refusal logs around Sep 21
    const { data: refusals } = await supabase
        .from('refusal_logs')
        .select('*')
        .gte('created_at', '2026-09-20T00:00:00Z')
        .lte('created_at', '2026-09-22T23:59:59Z');
    
    console.log("REFUSAL LOGS (Sep 20-22):", refusals);

    // Let's check part fa0f06cf-c6f7-4122-a850-206c15bf50e9
    const partId = 'fa0f06cf-c6f7-4122-a850-206c15bf50e9';
    const { data: part } = await supabase.from('workbook_parts').select('*').eq('id', partId);
    console.log("\nPART fa0f06cf... (Week 12/10):", part);

    // Let's check interactions from Edmardo's phone
    const { data: interactions } = await supabase
        .from('zapi_smart_interactions')
        .select('*')
        .ilike('inbound_text', '%Edmilson%');
    console.log("\nINTERACTIONS with 'Edmilson':", interactions);
}
run();
