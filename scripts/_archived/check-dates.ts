import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://pevstuyzlewvjidjkmea.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NzczNTYsImV4cCI6MjA4MTM1MzM1Nn0.myYaq8rshNyB2aGTas2f1IzsQVv_rihOGL2v8EPl-x0'
);

async function main() {
    console.log('\n📊 VERIFICAÇÃO DE FORMATO DE DATAS\n');
    console.log('='.repeat(50));

    const { data, error } = await supabase
        .from('workbook_parts')
        .select('id, date, week_display, week_id')
        .order('date', { ascending: true })
        .limit(10);

    if (error) {
        console.log('Erro:', error.message);
        return;
    }

    console.log('\nPrimeiras 10 partes (ordenadas por data):');
    console.log('-'.repeat(50));

    for (let i = 0; i < data.length; i++) {
        const p = data[i];
        console.log(`  ${i + 1}. date: "${p.date}"`);
        console.log(`     week_id: "${p.week_id}" | week_display: "${p.week_display}"`);
    }

    // Verificar estrutura da data
    const sample = data[0]?.date || '';
    const isISO = /^\d{4}-\d{2}-\d{2}/.test(sample);
    const isDMY = /^\d{1,2}\/\d{1,2}\/\d{4}/.test(sample);

    console.log('\n' + '='.repeat(50));
    console.log('📋 ANÁLISE DO FORMATO:');
    console.log('='.repeat(50));
    console.log(`  Exemplo: "${sample}"`);
    console.log(`  É ISO (YYYY-MM-DD)? ${isISO ? '✅ SIM' : '❌ NÃO'}`);
    console.log(`  É DD/MM/YYYY? ${isDMY ? '⚠️ SIM (problema!)' : '✅ NÃO (bom)'}`);

    // Contar total
    const { count } = await supabase.from('workbook_parts').select('*', { count: 'exact', head: true });
    console.log(`\n📈 Total de partes: ${count}`);
    console.log('='.repeat(50));
}

main().catch(console.error);
