-- Ciclo de vida simplificado 2026-05-22
-- Adiciona timestamp genérico e flag had_refusal em workbook_parts.
-- Aditiva e reversível (DROP COLUMN para rollback).
-- Aplicada via Supabase MCP em 2026-05-22 (apply_migration).

ALTER TABLE workbook_parts
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS had_refusal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_workbook_parts_had_refusal
  ON workbook_parts(had_refusal) WHERE had_refusal = true;

COMMENT ON COLUMN workbook_parts.status_changed_at IS 'Timestamp genérico da última transição de status (ciclo simplificado 2026-05-22)';
COMMENT ON COLUMN workbook_parts.had_refusal IS 'TRUE se a parte já teve pelo menos uma recusa via portal. Query-friendly; histórico completo em refusal_logs.';

-- Backfill had_refusal a partir de refusal_logs existentes
UPDATE workbook_parts wp
SET had_refusal = true
WHERE EXISTS (
  SELECT 1 FROM refusal_logs rl WHERE rl.part_id = wp.id
)
AND had_refusal = false;
