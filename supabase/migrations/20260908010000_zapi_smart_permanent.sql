-- Migration: 20260908010000_zapi_smart_permanent.sql
-- Descrição: Opção 3 - Inteligência Nativa Permanente do WhatsApp (Z-API)
-- Cria tabela de auditoria de interações e preserva compatibilidade retroativa com links em voo.

-- 1. Criação da tabela de auditoria zapi_smart_interactions
CREATE TABLE IF NOT EXISTS public.zapi_smart_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    phone TEXT,
    publisher_id TEXT,
    publisher_name TEXT,
    workbook_part_id UUID,
    inbound_message_id TEXT,
    inbound_text TEXT,
    raw_payload JSONB,
    matched_by TEXT, -- 'BUTTON' | 'REACTION' | 'QUOTED_MSG' | 'TEMPORAL_WINDOW' | 'UNMATCHED'
    detected_intent TEXT, -- 'CONFIRMAR' | 'RECUSAR' | 'DISPONIBILIDADE' | 'PERMUTA' | 'DUVIDA' | 'OUTRO'
    confidence NUMERIC DEFAULT 1.0,
    action_taken TEXT, -- 'STATUS_DESIGNADA' | 'STATUS_REJEITADA' | 'ALERT_SRVM' | 'REPLY_SENT' | 'IGNORED'
    reason_extracted TEXT,
    outbound_reply_text TEXT,
    outbound_message_id TEXT,
    processing_time_ms INTEGER
);

-- Índices de performance para busca rápida
CREATE INDEX IF NOT EXISTS idx_zapi_smart_interactions_phone ON public.zapi_smart_interactions(phone);
CREATE INDEX IF NOT EXISTS idx_zapi_smart_interactions_part_id ON public.zapi_smart_interactions(workbook_part_id);
CREATE INDEX IF NOT EXISTS idx_zapi_smart_interactions_created_at ON public.zapi_smart_interactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zapi_smart_interactions_intent ON public.zapi_smart_interactions(detected_intent);

-- 2. Compatibilidade Retroativa:
-- Mantemos o gatilho legado trg_webhook_whatsapp_orchestrator ATIVO para que os links
-- de portais já enviados nas semanas em voo (ex.: 21/set e 28/set) continuem recebendo recibo normalmente!

-- 3. RLS (Row Level Security) para segurança
ALTER TABLE public.zapi_smart_interactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'zapi_smart_interactions' 
        AND policyname = 'Admins e editores podem ler zapi_smart_interactions'
    ) THEN
        CREATE POLICY "Admins e editores podem ler zapi_smart_interactions"
        ON public.zapi_smart_interactions
        FOR SELECT
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND (p.role = 'admin' OR p.role = 'editor')
            )
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'zapi_smart_interactions' 
        AND policyname = 'Service role tem acesso total a zapi_smart_interactions'
    ) THEN
        CREATE POLICY "Service role tem acesso total a zapi_smart_interactions"
        ON public.zapi_smart_interactions
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

COMMENT ON TABLE public.zapi_smart_interactions IS 'Auditoria de interações conversacionais e botões via WhatsApp Z-API (Opção 3)';
