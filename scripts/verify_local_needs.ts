
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc3NzM1NiwiZXhwIjoyMDgxMzUzMzU2fQ.N-vb7L0PVsMoLh1pu495g3XkTY8AqNhgyWuK6U4Awn4';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

async function verifyMigration() {
    console.log('🔍 Verificando tabelas...\n');

    // Check information_schema for table
    const { data: tables, error: tablesError } = await supabase.rpc('exec_sql', {
        sql: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'local_needs_preassignments'`
    });

    console.log('Resultado busca tabela:', tables, tablesError?.message || 'OK');

    // Check columns in workbook_parts
    const { data: cols, error: colsError } = await supabase.rpc('exec_sql', {
        sql: `SELECT column_name FROM information_schema.columns WHERE table_name = 'workbook_parts' AND column_name = 'local_needs_theme'`
    });

    console.log('Resultado busca coluna:', cols, colsError?.message || 'OK');

    // Try direct insert
    console.log('\n📝 Tentando insert de teste...');

    const { data: insertData, error: insertError } = await supabase
        .from('local_needs_preassignments')
        .insert({
            theme: 'Teste de Migração',
            assignee_name: 'Sistema',
            order_position: 999
        })
        .select()
        .single();

    if (insertError) {
        console.log('❌ Erro no insert:', insertError.message, insertError.code);
    } else {
        console.log('✅ Insert funcionou! ID:', insertData?.id);

        // Delete test record
        if (insertData?.id) {
            await supabase.from('local_needs_preassignments').delete().eq('id', insertData.id);
            console.log('🗑️ Registro de teste removido');
        }
    }
}

verifyMigration().catch(console.error);
