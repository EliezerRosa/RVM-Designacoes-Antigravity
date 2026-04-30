import { createClient } from '@supabase/supabase-js';

const s = createClient(
    'https://pevstuyzlewvjidjkmea.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
    const { data } = await s.from('workbook_parts')
        .select('tipo_parte,funcao,raw_publisher_name,resolved_publisher_name,status')
        .eq('week_id', '2026-03-02')
        .order('seq');

    if (data) {
        console.log('=== Week 2026-03-02 Parts ===');
        data.forEach(r => {
            const raw = r.raw_publisher_name || '(empty)';
            const res = r.resolved_publisher_name || '(empty)';
            console.log(`${r.tipo_parte} [${r.funcao}] | raw="${raw}" | resolved="${res}" | status=${r.status}`);
        });
    }
}

main();
