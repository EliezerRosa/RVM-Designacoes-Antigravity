-- Tabela para enfileirar mudanças de status (debounce)
CREATE TABLE IF NOT EXISTS public.status_pdf_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week_id TEXT NOT NULL,
    status_changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE
);

-- Habilitar RLS
ALTER TABLE public.status_pdf_queue ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Admins podem gerenciar fila" 
    ON public.status_pdf_queue 
    FOR ALL 
    USING (public.is_admin() = true);

CREATE POLICY "Service role tem acesso total à fila" 
    ON public.status_pdf_queue 
    FOR ALL 
    USING (auth.jwt()->>'role' = 'service_role');

-- Concede acesso ao role authenticated (pois o trigger vai rodar no contexto de authenticated)
GRANT ALL ON public.status_pdf_queue TO authenticated;
GRANT ALL ON public.status_pdf_queue TO service_role;

-- Função do gatilho
CREATE OR REPLACE FUNCTION public.fn_enqueue_status_pdf()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- Insere na fila de processamento
        INSERT INTO public.status_pdf_queue (week_id) VALUES (NEW.week_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Gatilho
DROP TRIGGER IF EXISTS trg_enqueue_status_change ON public.workbook_parts;
CREATE TRIGGER trg_enqueue_status_change
AFTER UPDATE OF status ON public.workbook_parts
FOR EACH ROW
EXECUTE FUNCTION public.fn_enqueue_status_pdf();
