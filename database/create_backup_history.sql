-- =============================================================================
-- Tabela: backup_history
-- Registra todas as operações de export e import de backup
-- =============================================================================

CREATE TABLE IF NOT EXISTS backup_history (
    id BIGSERIAL PRIMARY KEY,
    operation TEXT NOT NULL,           -- 'export' ou 'import'
    backup_date TEXT,                  -- Data do backup (para imports)
    origin TEXT,                       -- Origem: 'json', 'excel', nome do arquivo
    counts JSONB,                      -- Contagens: {publishers: N, parts: N, ...}
    status TEXT DEFAULT 'success',     -- 'success', 'error', 'partial'
    error_message TEXT,                -- Mensagem de erro, se houver
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_backup_history_operation ON backup_history(operation);
CREATE INDEX IF NOT EXISTS idx_backup_history_created_at ON backup_history(created_at);

COMMENT ON TABLE backup_history IS 'Histórico de operações de backup (export/import)';
