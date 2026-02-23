
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc3NzM1NiwiZXhwIjoyMDgxMzUzMzU2fQ.N-vb7L0PVsMoLh1pu495g3XkTY8AqNhgyWuK6U4Awn4';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function inspectSchema() {
    console.log('🔍 Introspecção de Esquema Supabase...\n');

    // Lista todas as tabelas no schema public
    const { data: tables, error: tablesError } = await supabase
        .rpc('get_tables_info', {}).catch(() => ({ data: null, error: { message: 'RPC get_tables_info not found' } }));

    if (tablesError) {
        // Fallback: tentar via SQL direto se possível ou listar tabelas conhecidas
        console.log('⚠️ RPC get_tables_info falhou. Tentando via information_schema...');

        // Como o usuário nos deu poder, vamos tentar um RPC de SQL se existir
        const { data: sqlData, error: sqlError } = await supabase.rpc('exec_sql', {
            sql: `
                SELECT table_name, column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema = 'public'
                ORDER BY table_name, ordinal_position;
            `
        });

        if (sqlError) {
            console.error('❌ Falha total na introspecção:', sqlError.message);

            // Último recurso: consultar as tabelas comuns para ver se elas existem
            const knownTables = ['publishers', 'workbook_parts', 'notifications', 'special_events', 'audit_log', 'territories', 'blocks', 'addresses', 'visits'];
            console.log('📋 Verificando tabelas conhecidas...');
            for (const table of knownTables) {
                const { error } = await supabase.from(table).select('count', { count: 'exact', head: true });
                if (!error) {
                    console.log(`✅ Tabela encontrada: ${table}`);
                }
            }
        } else {
            console.log('📊 Estrutura encontrada via SQL:');
            console.log(JSON.stringify(sqlData, null, 2));
        }
    } else {
        console.log(JSON.stringify(tables, null, 2));
    }
}

inspectSchema().catch(console.error);
