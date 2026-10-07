import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Searching for parts related to 'Edmardo Queiroz' or 'Dirigente EBC' in October...");
    
    // First, find Edmardo's ID
    const { data: pubs } = await supabase
        .from('publishers')
        .select('id, data')
        .ilike('data->>name', '%Edmardo%');
        
    console.log("Publishers matching Edmardo:", pubs);
    const pubId = pubs?.[0]?.id;

    // Then, query workbook_parts for this pubId or just 'RECUSADA' or needs_reassignment
    const { data: parts } = await supabase
        .from('workbook_parts')
        .select('*')
        .or(esolved_publisher_id.eq.,status.eq.RECUSADA,needs_reassignment.eq.true)
        .order('date', { ascending: false })
        .limit(10);
        
    console.log("Matched parts:", JSON.stringify(parts, null, 2));
}
run();
