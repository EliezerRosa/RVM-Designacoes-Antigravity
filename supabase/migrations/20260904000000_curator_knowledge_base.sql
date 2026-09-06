-- =============================================================================
-- Migration: 20260904000000_curator_knowledge_base.sql
-- Descrição: Criação das tabelas e políticas da Base de Conhecimento do Curador IA
--            (curator_profiles e curator_batch_insights).
-- Invariante: Armazenamento permanente desacoplado do código estático, sem
--             interferência no motor rotacional determinístico.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.curator_profiles (
    id text PRIMARY KEY,
    nome text NOT NULL,
    categoria text NOT NULL,
    descricao text NOT NULL,
    criterios_elegibilidade jsonb NOT NULL DEFAULT '{}'::jsonb,
    afinidades_recomendadas text[] NOT NULL DEFAULT '{}',
    insights jsonb NOT NULL DEFAULT '{}'::jsonb,
    total_aplicacoes integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.curator_batch_insights (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id text,
    batch_name text NOT NULL,
    semanas_cobertas text[] NOT NULL DEFAULT '{}',
    livro_biblico_foco text,
    novos_perfis text[] NOT NULL DEFAULT '{}',
    perfis_enriquecidos text[] NOT NULL DEFAULT '{}',
    resumo_estrategico text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_curator_profiles_categoria ON public.curator_profiles (categoria);
CREATE INDEX IF NOT EXISTS idx_curator_batch_insights_created_at ON public.curator_batch_insights (created_at DESC);

-- Habilita RLS
ALTER TABLE public.curator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_batch_insights ENABLE ROW LEVEL SECURITY;

-- Políticas RLS: curator_profiles
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'curator_profiles' AND policyname = 'Allow read curator_profiles'
    ) THEN
        CREATE POLICY "Allow read curator_profiles" ON public.curator_profiles
            FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'curator_profiles' AND policyname = 'Allow write curator_profiles'
    ) THEN
        CREATE POLICY "Allow write curator_profiles" ON public.curator_profiles
            FOR ALL USING (true);
    END IF;
END $$;

-- Políticas RLS: curator_batch_insights
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'curator_batch_insights' AND policyname = 'Allow read curator_batch_insights'
    ) THEN
        CREATE POLICY "Allow read curator_batch_insights" ON public.curator_batch_insights
            FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'curator_batch_insights' AND policyname = 'Allow write curator_batch_insights'
    ) THEN
        CREATE POLICY "Allow write curator_batch_insights" ON public.curator_batch_insights
            FOR ALL USING (true);
    END IF;
END $$;
