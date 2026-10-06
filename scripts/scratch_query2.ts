import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function investigate2() {
    console.log("=== Finding Marilene's part by exact title ===");
    const { data: mParts } = await supabase
        .from('workbook_parts')
        .select('*')
        .ilike('part_title', '%Explicando suas crenças%');
    
    for (const p of mParts || []) {
        if (p.resolved_publisher_name?.includes('Marilene') || p.raw_publisher_name?.includes('Marilene')) {
            console.log("Found part:", p.id, p.resolved_publisher_name, p.status, p.status_changed_at);
            const { data: inter } = await supabase
                .from('zapi_smart_interactions')
                .select('detected_intent, inbound_text, created_at')
                .eq('workbook_part_id', p.id);
            console.log("Interactions:", inter);
        }
    }
}
investigate2();
