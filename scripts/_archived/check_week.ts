import { createClient } from '@supabase/supabase-js';

const s = createClient(
    'https://pevstuyzlewvjidjkmea.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc3NzM1NiwiZXhwIjoyMDgxMzUzMzU2fQ.N-vb7L0PVsMoLh1pu495g3XkTY8AqNhgyWuK6U4Awn4'
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
