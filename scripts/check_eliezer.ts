import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: pub } = await supabase.from('publishers').select('*').ilike('data->>name', '%Eliezer Rosa%').single();
    if (!pub) { console.log('Eliezer not found'); return; }
    
    console.log('Eliezer ID:', pub.id);
    
    const { data: parts } = await supabase
        .from('workbook_parts')
        .select('*')
        .eq('resolved_publisher_id', pub.id)
        .in('status', ['ENVIADA', 'DESIGNADA']);
        
    console.log('Upcoming parts for Eliezer:', parts);
}
run();
