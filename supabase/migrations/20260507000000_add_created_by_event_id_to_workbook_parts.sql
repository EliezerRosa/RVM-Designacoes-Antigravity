-- Adiciona coluna created_by_event_id para rastrear partes criadas por eventos especiais (ADD_PART)
-- Sem esta coluna, INSERT em workbook_parts no fluxo ADD_PART falhava com "column does not exist",
-- resultando em "Erro ao aplicar" para Visita do SC, Recapitulação Assembleia, etc.

ALTER TABLE public.workbook_parts
  ADD COLUMN IF NOT EXISTS created_by_event_id uuid REFERENCES public.special_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workbook_parts_created_by_event_id
  ON public.workbook_parts (created_by_event_id);
