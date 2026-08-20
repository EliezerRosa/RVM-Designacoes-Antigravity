-- =========================================================================================
-- MIGRATION: 20260820120000_app_settings_rls.sql
-- DESCRIPTION: Ativa Row Level Security (RLS) na tabela app_settings para proteger
-- credenciais (Z-API, auth_mode, etc) e restringir escrita apenas a admins.
-- =========================================================================================

-- 1. Habilitar RLS na tabela
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 2. Permitir que usuários logados leiam as configurações necessárias
-- Note: A maioria das configs públicas/necessárias ao frontend estão aqui,
-- mas credenciais secretas do backend não devem ser retornadas em queries normais.
-- Porém, para não quebrar fluxos legados, mantemos leitura para `authenticated`.
CREATE POLICY "Authenticated users can read app_settings" 
ON public.app_settings
FOR SELECT
TO authenticated
USING (true);

-- 3. Permitir escrita (INSERT, UPDATE, DELETE) APENAS para administradores
CREATE POLICY "Admins can insert app_settings"
ON public.app_settings
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

CREATE POLICY "Admins can update app_settings"
ON public.app_settings
FOR UPDATE
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
)
WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

CREATE POLICY "Admins can delete app_settings"
ON public.app_settings
FOR DELETE
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- =========================================================================================
-- FIM DA MIGRATION
-- =========================================================================================
