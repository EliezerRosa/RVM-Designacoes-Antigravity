import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc3NzM1NiwiZXhwIjoyMDgxMzUzMzU2fQ.N-vb7L0PVsMoLh1pu495g3XkTY8AqNhgyWuK6U4Awn4';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '20260423000000_portal_availability_submit.sql');
const sql = readFileSync(sqlPath, 'utf-8');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

async function run() {
    console.log('Aplicando migração submit_publisher_availability via exec_sql...');
    const { error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
        console.error('Erro RPC:', error);
        process.exit(1);
    }
    console.log('✅ Migração aplicada.');

    // Sanity check: chamar a função com token inválido para garantir que existe
    const { data, error: callErr } = await supabase.rpc('submit_publisher_availability', {
        p_token: '__nonexistent__',
        p_availability: { mode: 'always', exceptionDates: [], availableDates: [] },
    });
    if (callErr) {
        console.error('Função não está acessível:', callErr);
        process.exit(1);
    }
    console.log('Resposta de teste:', data);
}

run();
