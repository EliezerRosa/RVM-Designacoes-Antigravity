
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc3NzM1NiwiZXhwIjoyMDgxMzUzMzU2fQ.N-vb7L0PVsMoLh1pu495g3XkTY8AqNhgyWuK6U4Awn4';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

async function addTargetWeekColumn() {
    console.log('🔧 Adicionando coluna target_week...\n');

    // Try using RPC first
    const { error } = await supabase.rpc('exec_sql', {
        sql: `
            ALTER TABLE local_needs_preassignments 
            ADD COLUMN IF NOT EXISTS target_week TEXT;
            
            -- Index for efficient lookup by week
            CREATE INDEX IF NOT EXISTS idx_local_needs_target_week 
            ON local_needs_preassignments(target_week) 
            WHERE target_week IS NOT NULL AND assigned_to_part_id IS NULL;
            
            COMMENT ON COLUMN local_needs_preassignments.target_week IS 
            'WeekId específico para esta pré-designação. NULL = usar ordem da fila.';
        `
    });

    if (error) {
        console.log('RPC falhou, tentando verificar se coluna já existe...');

        // Try to select the column to check if it exists
        const { error: selectError } = await supabase
            .from('local_needs_preassignments')
            .select('target_week')
            .limit(1);

        if (!selectError) {
            console.log('✅ Coluna target_week já existe!');
        } else if (selectError.message.includes('target_week')) {
            console.log('❌ Coluna não existe e migração falhou.');
            console.log('Execute manualmente: ALTER TABLE local_needs_preassignments ADD COLUMN target_week TEXT;');
        } else {
            console.log('⚠️ Erro desconhecido:', selectError.message);
        }
    } else {
        console.log('✅ Coluna target_week adicionada com sucesso!');
    }

    // Verify
    const { error: verifyError } = await supabase
        .from('local_needs_preassignments')
        .select('id, target_week')
        .limit(1);

    if (!verifyError) {
        console.log('✅ Verificação OK - coluna target_week acessível');
    }
}

addTargetWeekColumn().catch(console.error);
