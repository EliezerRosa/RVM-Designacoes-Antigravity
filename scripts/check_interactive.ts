import './node-shims.cjs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pevstuyzlewvjidjkmea.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLiveResults() {
    const testPartId = 'test-part-interactive-001';

    console.log('--- STATUS DA PARTE ---');
    const { data: part } = await supabase.from('workbook_parts').select('id, status').eq('id', testPartId).single();
    console.log(part);

    console.log('\n--- ÚLTIMA INTERAÇÃO LOGADA ---');
    const { data: interactions } = await supabase
        .from('zapi_smart_interactions')
        .select('*')
        .eq('phone', '5527981170400')
        .order('created_at', { ascending: false })
        .limit(1);
    
    if (interactions && interactions.length > 0) {
        console.log(interactions[0]);
    } else {
        console.log('Nenhuma interação encontrada.');
    }
}

checkLiveResults().catch(console.error);
