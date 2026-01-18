-- =============================================================================
-- Script: Auditoria de CRUD para RVM Designações
-- Cria tabela de auditoria e triggers para rastrear todas as mudanças
-- =============================================================================

-- 1. Criar tabela de auditoria
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,  -- INSERT, UPDATE, DELETE
    record_id TEXT,           -- ID do registro afetado
    old_data JSONB,           -- Dados antes da mudança
    new_data JSONB,           -- Dados depois da mudança
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    user_agent TEXT,          -- Opcional: info do cliente
    ip_address TEXT           -- Opcional: IP do cliente
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_operation ON audit_log(operation);
CREATE INDEX IF NOT EXISTS idx_audit_changed_at ON audit_log(changed_at);
CREATE INDEX IF NOT EXISTS idx_audit_record_id ON audit_log(record_id);

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

-- 3. Aplicar trigger na tabela publishers
DROP TRIGGER IF EXISTS audit_publishers ON publishers;
CREATE TRIGGER audit_publishers
    AFTER INSERT OR UPDATE OR DELETE ON publishers
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- 4. Aplicar trigger na tabela workbook_parts
DROP TRIGGER IF EXISTS audit_workbook_parts ON workbook_parts;
CREATE TRIGGER audit_workbook_parts
    AFTER INSERT OR UPDATE OR DELETE ON workbook_parts
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- 5. Aplicar trigger na tabela workbook_batches
DROP TRIGGER IF EXISTS audit_workbook_batches ON workbook_batches;
CREATE TRIGGER audit_workbook_batches
    AFTER INSERT OR UPDATE OR DELETE ON workbook_batches
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- 6. Aplicar trigger na tabela special_events (se existir)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'special_events') THEN
        DROP TRIGGER IF EXISTS audit_special_events ON special_events;
        CREATE TRIGGER audit_special_events
            AFTER INSERT OR UPDATE OR DELETE ON special_events
            FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
    END IF;
END $$;

-- 7. Aplicar trigger na tabela local_needs_preassignments (se existir)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'local_needs_preassignments') THEN
        DROP TRIGGER IF EXISTS audit_local_needs ON local_needs_preassignments;
        CREATE TRIGGER audit_local_needs
            AFTER INSERT OR UPDATE OR DELETE ON local_needs_preassignments
            FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
    END IF;
END $$;

-- =============================================================================
-- Consultas úteis para visualizar auditoria:
-- =============================================================================

-- Ver últimas 50 mudanças:
-- SELECT * FROM audit_log ORDER BY changed_at DESC LIMIT 50;

-- Ver todas as deleções de publishers:
-- SELECT * FROM audit_log WHERE table_name = 'publishers' AND operation = 'DELETE' ORDER BY changed_at DESC;

-- Ver mudanças em um registro específico:
-- SELECT * FROM audit_log WHERE record_id = 'ID_AQUI' ORDER BY changed_at DESC;

-- Ver resumo de operações por tabela:
-- SELECT table_name, operation, COUNT(*) FROM audit_log GROUP BY table_name, operation ORDER BY table_name;

COMMENT ON TABLE audit_log IS 'Tabela de auditoria automática - registra todas as mudanças em tabelas críticas';
