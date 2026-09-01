-- Tabela para log do robô de automação Headless (D-30 / D-21)
-- Garante idempotência e facilita debug de erros no console

CREATE TABLE IF NOT EXISTS public.automation_bot_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    week_id TEXT NOT NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('D-30_GENERATION', 'D-21_PUBLICATION')),
    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'ERROR')),
    details JSONB,
    -- Unique constraint para evitar rodar mais de uma vez a mesma ação para a mesma semana
    CONSTRAINT automation_bot_log_week_action_key UNIQUE (week_id, action_type)
);

-- RLS
ALTER TABLE public.automation_bot_log ENABLE ROW LEVEL SECURITY;

-- Permite leitura por usuários logados (Admin)
CREATE POLICY "Admin pode ler logs do bot"
    ON public.automation_bot_log
    FOR SELECT
    TO authenticated
    USING (true);

-- Permite inserção por qualquer um (segurança feita no app React via URL token)
CREATE POLICY "Frontend worker pode inserir logs"
    ON public.automation_bot_log
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);
