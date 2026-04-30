import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '20260424020000_admin_auth_views.sql');
const sql = readFileSync(sqlPath, 'utf-8');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

async function run() {
    console.log('Aplicando admin_profile_publisher_links...');
    const { error } = await supabase.rpc('exec_sql', { sql });
    if (error) { console.error(error); process.exit(1); }
    console.log('OK');
}
run();
