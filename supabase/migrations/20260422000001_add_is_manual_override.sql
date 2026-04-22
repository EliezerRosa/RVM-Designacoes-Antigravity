-- Adiciona coluna is_manual_override em workbook_parts
-- Registra quando uma designação foi feita manualmente (dropdown ou comando explícito no agente)
-- ao invés de pelo motor de geração automática (GENERATE_WEEK).
ALTER TABLE workbook_parts
    ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN NOT NULL DEFAULT FALSE;

-- Índice para facilitar queries futuras (ex.: auditoria de overrides)
CREATE INDEX IF NOT EXISTS idx_workbook_parts_manual_override
    ON workbook_parts (is_manual_override)
    WHERE is_manual_override = TRUE;
