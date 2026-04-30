
import { createClient } from '@supabase/supabase-js';

// Credentials
const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const SQL = `
-- ============================================================================
-- Migração: Pré-Designação de Necessidades Locais
-- ============================================================================

-- 1. Criar tabela de pré-designações de Necessidades Locais
CREATE TABLE IF NOT EXISTS local_needs_preassignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    theme TEXT NOT NULL,
    assignee_name TEXT NOT NULL,
    order_position INTEGER NOT NULL DEFAULT 1,
    assigned_to_part_id UUID REFERENCES workbook_parts(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Índices para performance
CREATE INDEX IF NOT EXISTS idx_local_needs_order ON local_needs_preassignments(order_position) 
    WHERE assigned_to_part_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_local_needs_assigned ON local_needs_preassignments(assigned_to_part_id);

-- 3. Adicionar campo de tema em workbook_parts (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'workbook_parts' AND column_name = 'local_needs_theme'
    ) THEN
        ALTER TABLE workbook_parts ADD COLUMN local_needs_theme TEXT;
    END IF;
END $$;

-- 4. Habilitar RLS
ALTER TABLE local_needs_preassignments ENABLE ROW LEVEL SECURITY;

-- 5. Criar policy se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'local_needs_preassignments' AND policyname = 'Allow all operations on local_needs_preassignments'
    ) THEN
        CREATE POLICY "Allow all operations on local_needs_preassignments" ON local_needs_preassignments
            FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 6. Trigger para auto-atualizar updated_at
CREATE OR REPLACE FUNCTION update_local_needs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_local_needs_updated_at ON local_needs_preassignments;
CREATE TRIGGER trigger_local_needs_updated_at
    BEFORE UPDATE ON local_needs_preassignments
    FOR EACH ROW
    EXECUTE FUNCTION update_local_needs_updated_at();
`;

async function runMigration() {
    console.log('🚀 Executando migração: local_needs_preassignments...\n');

    try {
        // Execute SQL usando o client com service role
        const { error } = await supabase.rpc('exec_sql', { sql: SQL });

        if (error) {
            console.log(`RPC exec_sql não disponível: ${error.message}`);
            console.log('Tentando executar via Query API...\n');

            // Fallback: Execute statements individually via REST API
            const statements = [
                `CREATE TABLE IF NOT EXISTS local_needs_preassignments (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    theme TEXT NOT NULL,
                    assignee_name TEXT NOT NULL,
                    order_position INTEGER NOT NULL DEFAULT 1,
                    assigned_to_part_id UUID,
                    assigned_at TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )`,
            ];

            // Just test if table exists now
            const { data, error: selectError } = await supabase
                .from('local_needs_preassignments')
                .select('id')
                .limit(1);

            if (selectError && selectError.code === '42P01') {
                console.error('❌ Tabela não existe. Por favor, execute o SQL manualmente no Supabase Dashboard.');
                console.log('\n📋 SQL a executar:\n');
                console.log(SQL);
                return;
            }

            if (!selectError) {
                console.log('✅ Tabela local_needs_preassignments já existe!');
            }
        } else {
            console.log('✅ Migração executada via RPC!');
        }

        // Verify table exists
        const { data: verifyData, error: verifyError } = await supabase
            .from('local_needs_preassignments')
            .select('id')
            .limit(1);

        if (!verifyError) {
            console.log('✅ Tabela local_needs_preassignments verificada com sucesso!');
        } else if (verifyError.code === '42P01') {
            console.log('❌ Tabela não foi criada. Execute o SQL manualmente.');
        } else {
            console.log(`⚠️ Erro na verificação: ${verifyError.message}`);
        }

        // Verify column in workbook_parts
        const { data: wpData, error: wpError } = await supabase
            .from('workbook_parts')
            .select('local_needs_theme')
            .limit(1);

        if (!wpError) {
            console.log('✅ Coluna local_needs_theme em workbook_parts verificada!');
        } else if (wpError.message.includes('local_needs_theme')) {
            console.log('⚠️ Coluna local_needs_theme não existe ainda em workbook_parts');
        }

    } catch (err) {
        console.error('❌ Erro:', err);
    }
}

runMigration().then(() => {
    console.log('\n🏁 Migração finalizada.');
}).catch(console.error);
