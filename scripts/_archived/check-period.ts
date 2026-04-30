/**
 * Script para verificar o período salvo no Supabase
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://pevstuyzlewvjidjkmea.supabase.co',
    process.env.VITE_SUPABASE_ANON_KEY || ''
);

async function main() {
    console.log('\n📊 Verificando período salvo...\n');

    const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'analysis_period')
        .single();

    if (error) {
        console.log('Erro:', error.message);
        return;
    }

    console.log('Período salvo:', JSON.stringify(data?.value, null, 2));

    // Verificar partes
    const { data: parts } = await supabase
        .from('workbook_parts')
        .select('date, week_display, status')
        .gte('date', '2026-01-01')
        .lte('date', '2026-05-31')
        .limit(5);

    console.log('\nExemplo de datas de partes:', parts);
}

main().catch(console.error);
