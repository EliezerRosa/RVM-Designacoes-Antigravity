-- Adiciona colunas faltantes para o fluxo de aprovação e histórico

ALTER TABLE public.workbook_parts 
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL;

ALTER TABLE public.workbook_parts 
ADD COLUMN IF NOT EXISTS approved_by_id TEXT NULL;

ALTER TABLE public.workbook_parts 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;

ALTER TABLE public.workbook_parts 
ADD COLUMN IF NOT EXISTS rejected_reason TEXT NULL;

-- Comentário: Execute este script no SQL Editor do Supabase para corrigir o erro de aprovação.
