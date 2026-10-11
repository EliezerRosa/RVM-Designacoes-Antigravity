import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkDb() {
    const { data, error } = await supabase.from('workbook_parts').select('*').limit(1);
    console.log("workbook_parts columns:", Object.keys(data[0]));
    
    // Check if there is a weeks table or meetings table
    const { data: weeks, error: err2 } = await supabase.from('weeks').select('*').limit(1);
    if (weeks && weeks.length) {
        console.log("weeks columns:", Object.keys(weeks[0]));
    }
}
checkDb().catch(console.log);
