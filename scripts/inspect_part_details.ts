
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables manually or assume .env is in root
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectPart() {
    console.log('🔍 Inspecting part "Campanha da Celebração"...');

    const { data: parts, error } = await supabase
        .from('workbook_parts')
        .select('*')
        .ilike('part_title', '%Campanha da Celebração%')
        .limit(5);

    if (error) {
        console.error('Error fetching parts:', error);
        return;
    }

    if (!parts || parts.length === 0) {
        console.log('No parts found matching "Campanha da Celebração"');
        return;
    }

    console.log(`Found ${parts.length} parts:`);
    parts.forEach(p => {
        console.log('--------------------------------------------------');
        console.log(`ID: ${p.id}`);
        console.log(`Title: "${p.part_title}"`);
        console.log(`Tipo Parte: "${p.tipo_parte}"`);
        console.log(`Modalidade (DB): "${p.modalidade}"`);
        console.log(`Section: "${p.section}"`);
        console.log(`Publisher: "${p.resolved_publisher_name}"`);
        console.log(`Week ID: ${p.week_id}`);
    });
}

inspectPart();
