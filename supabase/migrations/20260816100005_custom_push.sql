-- Migration: custom_push_messages
-- Descrição: Tabela para armazenar histórico de pushes disparados manualmente (Cenário C).

CREATE TABLE IF NOT EXISTS public.custom_push_messages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL,
    body text NOT NULL,
    target_role text, -- 'all', 'admin', 'publicador'
    target_publisher_id text REFERENCES public.publishers(id),
    created_by uuid REFERENCES public.profiles(id) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.custom_push_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Apenas admin pode gerenciar custom_push_messages" ON public.custom_push_messages
FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
