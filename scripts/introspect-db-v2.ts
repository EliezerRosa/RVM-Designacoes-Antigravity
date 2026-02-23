
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc3NzM1NiwiZXhwIjoyMDgxMzUzMzU2fQ.N-vb7L0PVsMoLh1pu495g3XkTY8AqNhgyWuK6U4Awn4';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
});

async function inspectSchema() {
    console.log('🔍 Introspecção de Esquema Supabase...\n');

    try {
        // Tentativa 1: SQL Direto para information_schema via RPC exec_sql (se existir)
        const { data: sqlData, error: sqlError } = await supabase.rpc('exec_sql', {
            sql: `
                SELECT table_name, column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema = 'public'
                ORDER BY table_name, ordinal_position;
            `
        });

        if (!sqlError && sqlData) {
            console.log('📊 Estrutura encontrada via SQL:');
            console.log(JSON.stringify(sqlData, null, 2));
            return;
        }

        console.log('⚠️ RPC exec_sql falhou ou não retornou dados. Tentando listar tabelas conhecidas...');
        const knownTables = ['publishers', 'workbook_parts', 'notifications', 'special_events', 'audit_log', 'territories', 'blocks', 'addresses', 'visits', 'participations', 'backup_history', 'scheduled_assignments'];

        for (const table of knownTables) {
            const { data, error } = await supabase.from(table).select('*').limit(1);
            if (!error) {
                console.log(`✅ Tabela encontrada: ${table}`);
                if (data && data.length > 0) {
                    console.log(`   Colunas: ${Object.keys(data[0]).join(', ')}`);
                } else {
                    console.log(`   (Tabela vazia ou sem acesso a colunas)`);
                }
            }
        }
    } catch (err) {
        console.error('❌ Erro durante a introspecção:', err);
    }
}

inspectSchema().catch(console.error);
