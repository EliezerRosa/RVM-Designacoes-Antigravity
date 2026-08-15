-- Migration: webauthn_passkeys
-- Description: Cria tabelas para gerenciamento de chaves Passkeys (WebAuthn) e desafios.

-- 1. Tabela de Desafios (Challenges)
-- Utilizada para prevenir replay attacks. As Edge Functions gravam o challenge aqui.
CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    challenge TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS e manter restrito (Apenas service_role manipula)
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

-- 2. Tabela de Credenciais WebAuthn (Passkeys Registradas)
-- Guarda a chave pública COSE, counter de segurança e identificação da credencial
CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
    id TEXT PRIMARY KEY, -- Credential ID em Base64URL
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL, -- Chave Pública (formato JWK ou raw Base64)
    counter BIGINT DEFAULT 0 NOT NULL, -- Prevenção de clonagem
    device_type TEXT,
    backed_up BOOLEAN DEFAULT false,
    transports TEXT[], -- ['internal', 'hybrid', etc]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- O usuário pode VER as suas próprias chaves (para poder gerenciá-las/excluí-las no perfil)
CREATE POLICY "Usuários podem ver suas próprias credenciais webauthn"
    ON public.webauthn_credentials FOR SELECT
    USING (auth.uid() = profile_id);

-- O usuário pode EXCLUIR as suas próprias chaves (Revogação)
CREATE POLICY "Usuários podem excluir suas próprias credenciais webauthn"
    ON public.webauthn_credentials FOR DELETE
    USING (auth.uid() = profile_id);

-- Notas de Arquitetura:
-- INSERTS e UPDATES (atualização do counter) na tabela webauthn_credentials
-- Ocorrem EXCLUSIVAMENTE via Edge Functions (webauthn-register e webauthn-verify)
-- usando a service_role_key, garantindo total segurança contra adulterações client-side.
