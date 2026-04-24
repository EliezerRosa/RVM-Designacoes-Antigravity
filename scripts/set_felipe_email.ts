import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc3NzM1NiwiZXhwIjoyMDgxMzUzMzU2fQ.N-vb7L0PVsMoLh1pu495g3XkTY8AqNhgyWuK6U4Awn4';

const NAME_NEEDLE = 'felipe';
const EMAIL_TO_SET = 'felipeoliveiraloureiro14@gmail.com';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

async function run() {
    const { data, error } = await supabase
        .from('publishers')
        .select('id, data');
    if (error) {
        console.error('select error:', error);
        process.exit(1);
    }
    const candidates = (data || []).filter((row: { id: string; data: { name?: string; aliases?: string[] } }) => {
        const n = (row.data?.name || '').toLowerCase();
        return n.includes(NAME_NEEDLE);
    });
    console.log('Candidatos com "felipe" no nome:');
    for (const c of candidates) {
        console.log(' -', c.id, c.data?.name, '| email atual:', c.data?.email || '(vazio)');
    }
    if (candidates.length === 0) {
        console.error('Nenhum publicador encontrado.');
        process.exit(1);
    }
    if (candidates.length > 1) {
        console.error('Mais de um candidato — refine o filtro.');
        process.exit(1);
    }
    const target = candidates[0];
    const newData = { ...target.data, email: EMAIL_TO_SET };
    const { error: updErr } = await supabase
        .from('publishers')
        .update({ data: newData })
        .eq('id', target.id);
    if (updErr) {
        console.error('update error:', updErr);
        process.exit(1);
    }
    console.log(`Email "${EMAIL_TO_SET}" gravado em ${target.data?.name} (${target.id})`);
}

run();
