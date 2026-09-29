import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: parts } = await supabase
        .from('workbook_parts')
        .select('id, week_id, status')
        .in('status', ['PROPOSTA', 'DESIGNADA', 'APROVADA']);
    
    console.log(Total de partes ativas: );
    if (parts.length > 0) {
        console.log(parts.slice(0, 5));
    }
}
check();
