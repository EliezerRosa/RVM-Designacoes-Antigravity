const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://pevstuyzlewvjidjkmea.supabase.co',
    process.env.VITE_SUPABASE_ANON_KEY || ''
);

async function main() {
    console.log('\n📊 Verificando formato de datas nas partes...\n');

    const { data, error } = await supabase
        .from('workbook_parts')
        .select('id, date, week_display, week_id')
        .order('date', { ascending: true })
        .limit(10);

    if (error) { console.log('Erro:', error.message); return; }

    console.log('Primeiras 10 partes (ordenadas por data):');
    data.forEach((p, i) => {
        console.log('  ' + (i + 1) + '. date: "' + p.date + '" | week_id: "' + p.week_id + '" | week_display: "' + p.week_display + '"');
    });

    // Verificar estrutura da data
    const sample = data[0]?.date || '';
    const isISO = /^\d{4}-\d{2}-\d{2}/.test(sample);
    const isDMY = /^\d{1,2}\/\d{1,2}\/\d{4}/.test(sample);

    console.log('\n📋 Análise do formato:');
    console.log('  Exemplo: "' + sample + '"');
    console.log('  É ISO (YYYY-MM-DD)? ' + (isISO ? '✅ SIM' : '❌ NÃO'));
    console.log('  É DD/MM/YYYY? ' + (isDMY ? '⚠️ SIM (problema!)' : '✅ NÃO'));

    // Contar total
    const { count } = await supabase.from('workbook_parts').select('*', { count: 'exact', head: true });
    console.log('\n📈 Total de partes: ' + count);
}

main().catch(console.error);
