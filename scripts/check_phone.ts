import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: pub } = await supabase.from('publishers').select('*').ilike('data->>name', '%Eliezer Rosa%').single();
    if (!pub) { console.log('Eliezer not found'); return; }
    
    const phone = pub.data.phone || pub.data.contact_phone;
    console.log('Eliezer Phone:', phone);
    
    const { data: allPubs } = await supabase.from('publishers').select('*');
    const matched = allPubs.filter(p => {
        const pPhone = p.data.phone || p.data.contact_phone;
        return pPhone && pPhone.replace(/\D/g, '') === phone.replace(/\D/g, '');
    });
    console.log('Publishers with this phone:', matched.map(m => m.data.name));
}
run();
