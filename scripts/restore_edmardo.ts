import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Restoring Edmardo's part...");
    const targetId = 'fa0f06cf-c6f7-4122-a850-206c15bf50e9';
    const { data, error } = await supabase
        .from('workbook_parts')
        .update({
            needs_reassignment: false,
            had_refusal: false,
            rejected_reason: null,
            status_changed_at: new Date().toISOString()
        })
        .eq('id', targetId)
        .select();
        
    if (error) {
        console.error("Error updating:", error);
    } else {
        console.log("Successfully restored:", data);
    }
}
run();
