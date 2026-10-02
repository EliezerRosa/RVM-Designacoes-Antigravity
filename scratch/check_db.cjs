const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || supabaseKey; 

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
    const { data: parts, error } = await supabase
        .from('workbook_parts')
        .select('*')
        .eq('week_id', '2026-10-12')
        .ilike('tipo_parte', '%Presidente%');
    
    if (parts && parts.length > 0) {
        const part = parts[0];
        console.log("=== ESTADO ATUAL NO BANCO ===");
        console.log(`- Nome: ${part.resolved_publisher_name}`);
        console.log(`- ID do Publicador: ${part.resolved_publisher_id}`);
        console.log(`- Nome Bruto (Raw): ${part.raw_publisher_name}`);
        
        // Fix it back to Eliezer Rosa if it's messed up
        if (part.resolved_publisher_name !== 'Eliezer Rosa') {
            console.log("\nCorrigindo nome de volta para 'Eliezer Rosa' para garantir consistência...");
            await supabase
                .from('workbook_parts')
                .update({ resolved_publisher_name: 'Eliezer Rosa' })
                .eq('id', part.id);
            console.log("Feito!");
        }
    }
}

run();
