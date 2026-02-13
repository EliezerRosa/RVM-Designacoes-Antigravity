-- Add 'modalidade' column to workbook_parts table
-- This column will store the semantic type of the part (e.g., 'DISCURSO_ENSINO', 'ORACAO')
-- extracted by the AI or determined by the system.

ALTER TABLE workbook_parts 
ADD COLUMN IF NOT EXISTS modalidade TEXT;

-- Create index for faster filtering by modality
CREATE INDEX IF NOT EXISTS idx_workbook_parts_modalidade ON workbook_parts(modalidade);
