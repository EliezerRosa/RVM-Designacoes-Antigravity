const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
// Usando a service role key se precisar ignorar RLS (embora anon possa servir se autenticado, mas em script usar env é mais fácil)
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || supabaseKey; 

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
    console.log("Buscando parte Presidente para 2026-10-12...");
    const { data: parts, error } = await supabase
        .from('workbook_parts')
        .select('*')
        .eq('week_id', '2026-10-12')
        .ilike('tipo_parte', '%Presidente%');
    
    if (error) {
        console.error("Erro ao buscar:", error);
        return;
    }
    
    if (parts.length > 0) {
        const part = parts[0];
        console.log(`Presidente atual: ${part.resolved_publisher_name}`);
        
        console.log("Atualizando para 'Edmardo Queiroz'...");
        const { data: updateData, error: updateError } = await supabase
            .from('workbook_parts')
            .update({ resolved_publisher_name: 'Edmardo Queiroz' })
            .eq('id', part.id)
            .select();
            
        if (updateError) {
            console.error("Erro ao atualizar:", updateError);
        } else {
            console.log("Sucesso! Banco atualizado:", updateData[0].resolvedPublisherName);
        }
    } else {
        console.log("Nenhuma parte de Presidente encontrada para 2026-10-12");
    }
}

run();
