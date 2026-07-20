import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data, error } = await supabase.schema('rm').from('field_groups').select('*');
    if (error) {
        console.error('Error fetching groups:', error);
        return;
    }
    console.log('Groups in DB:');
    console.table(data.map(g => ({
        id: g.id,
        congregation_id: g.congregation_id,
        group_number: g.group_number,
        name: g.name,
        glide_id: g.glide_id
    })));
}

main();
