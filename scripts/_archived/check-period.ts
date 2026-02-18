/**
 * Script para verificar o período salvo no Supabase
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://pevstuyzlewvjidjkmea.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NzczNTYsImV4cCI6MjA4MTM1MzM1Nn0.myYaq8rshNyB2aGTas2f1IzsQVv_rihOGL2v8EPl-x0'
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
