import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: pubData } = await supabase.from('publishers').select('id, name, contact_info').eq('name', 'Eliezer Rosa');
    console.log('Eliezer:', pubData);
    if(pubData && pubData.length > 0) {
        const { data: parts } = await supabase.from('workbook_parts')
            .select('*')
            .eq('resolved_publisher_id', pubData[0].id)
            .order('created_at', { ascending: false })
            .limit(5);
        console.log('Recent parts:', parts?.map(p => ({id: p.id, title: p.part_title, status: p.status})));
    }
}
run();
