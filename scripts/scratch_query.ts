import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function investigate() {
    console.log("=== Investigating Marilene Queiroz (Auto-reparo) ===");
    
    // Find Marilene's part
    const { data: marileneParts } = await supabase
        .from('workbook_parts')
        .select('id, week_id, part_title, status, resolved_publisher_name, raw_publisher_name, status_changed_at')
        .ilike('resolved_publisher_name', '%Marilene%');
    
    console.log("Marilene Parts:", marileneParts);

    if (marileneParts && marileneParts.length > 0) {
        for (const p of marileneParts) {
            const { data: interactions } = await supabase
                .from('zapi_smart_interactions')
                .select('*')
                .eq('workbook_part_id', p.id);
            console.log(`Interactions for part ${p.id}:`, interactions);
        }
    }

    console.log("\n=== Investigating Edmardo Queiroz (Substituições Pendentes) ===");
    const { data: edmardoParts } = await supabase
        .from('workbook_parts')
        .select('id, week_id, tipo_parte, part_title, status, needs_reassignment, substituted_publisher_name, rejected_reason')
        .eq('needs_reassignment', true)
        .ilike('tipo_parte', '%EBC%');
    
    console.log("Pending EBC parts:", edmardoParts);

    if (edmardoParts && edmardoParts.length > 0) {
        for (const p of edmardoParts) {
            const { data: refusals } = await supabase
                .from('refusal_logs')
                .select('*')
                .eq('part_id', p.id);
            console.log(`Refusals for part ${p.id}:`, refusals);
        }
    }
}

investigate();
