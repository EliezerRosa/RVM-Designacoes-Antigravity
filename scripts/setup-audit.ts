
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc3NzM1NiwiZXhwIjoyMDgxMzUzMzU2fQ.N-vb7L0PVsMoLh1pu495g3XkTY8AqNhgyWuK6U4Awn4';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const SQL = `
-- 1. Criar tabela de auditoria se não existir
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,  -- INSERT, UPDATE, DELETE, AGENT_INTENT
    record_id TEXT,           -- ID do registro afetado
    old_data JSONB,           -- Dados antes da mudança
    new_data JSONB,           -- Dados depois da mudança
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    user_agent TEXT,
    ip_address TEXT
);

-- 2. Função genérica de auditoria
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (table_name, operation, record_id, old_data, new_data)
        VALUES (TG_TABLE_NAME, 'INSERT', NEW.id::TEXT, NULL, row_to_json(NEW)::JSONB);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (table_name, operation, record_id, old_data, new_data)
        VALUES (TG_TABLE_NAME, 'UPDATE', NEW.id::TEXT, row_to_json(OLD)::JSONB, row_to_json(NEW)::JSONB);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (table_name, operation, record_id, old_data, new_data)
        VALUES (TG_TABLE_NAME, 'DELETE', OLD.id::TEXT, row_to_json(OLD)::JSONB, NULL);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. Ativar triggers nas principais tabelas
DO $$ 
BEGIN
    -- Publishers
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_publishers') THEN
        CREATE TRIGGER audit_publishers AFTER INSERT OR UPDATE OR DELETE ON publishers FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
    END IF;
    
    -- Workbook Parts
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_workbook_parts') THEN
        CREATE TRIGGER audit_workbook_parts AFTER INSERT OR UPDATE OR DELETE ON workbook_parts FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
    END IF;

    -- Notifications
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_notifications') THEN
        CREATE TRIGGER audit_notifications AFTER INSERT OR UPDATE OR DELETE ON notifications FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
    END IF;
END $$;
`;

async function setupAudit() {
    console.log('🏗️ Ativando infraestrutura de auditoria...');
    const { error } = await supabase.rpc('exec_sql', { sql: SQL });

    if (error) {
        console.error('❌ Erro ao ativar auditoria:', error.message);
        process.exit(1);
    }
    console.log('✅ Auditoria ativa em publishers, workbook_parts e notifications!');
}

setupAudit().catch(console.error);
