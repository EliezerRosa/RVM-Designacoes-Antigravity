-- ============================================================================
-- Funcionalidade: Web Push Notifications (Zero Acoplamento)
-- Criação da tabela push_dispatch_log para rastrear envios de notificações nativas
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_dispatch_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    zapi_log_id uuid NOT NULL, -- Referência ao evento gerador (zapi_dispatch_log.id)
    part_id text NOT NULL,
    dispatch_type text NOT NULL,
    publisher_id text NOT NULL REFERENCES public.publishers(id) ON DELETE CASCADE,
    endpoint text NOT NULL,
    status text NOT NULL DEFAULT 'SUCCESS',
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    
    -- Evitar envios duplicados para a mesma parte + tipo + endpoint
    UNIQUE (part_id, dispatch_type, endpoint)
);

-- Habilitar RLS
ALTER TABLE public.push_dispatch_log ENABLE ROW LEVEL SECURITY;

-- Apenas Admin e Service Role podem ler
CREATE POLICY "push_dispatch_log_select_admin" ON public.push_dispatch_log FOR SELECT
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

DROP FUNCTION IF EXISTS public.get_pending_push_events();

-- RPC para obter os eventos pendentes de Web Push.
-- Esta RPC junta as pontas: busca eventos recentes do zapi_dispatch_log,
-- verifica quem tem push_subscription e filtra os que já estão no push_dispatch_log.
CREATE OR REPLACE FUNCTION public.get_pending_push_events()
RETURNS TABLE (
    zapi_log_id uuid,
    part_id uuid,
    dispatch_type text,
    publisher_id uuid,
    publisher_name text,
    part_title text,
    section text,
    week_id text,
    endpoint text,
    p256dh text,
    auth text,
    token text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        z.id AS zapi_log_id,
        z.part_id,
        z.dispatch_type,
        wp.resolved_publisher_id AS publisher_id,
        pub.data->>'name' AS publisher_name,
        wp.part_title,
        wp.section,
        wp.week_id,
      -- Ex: PUBLICACAO_S89 gera a URL /?portal=confirm&id=...
      -- Ex: LEMBRETE_D2 gera a URL / (Dashboard)
        ps.endpoint,
        ps.p256dh,
        ps.auth
    FROM public.zapi_dispatch_log z
    JOIN public.workbook_parts wp ON wp.id::text = z.part_id::text
    JOIN public.publishers pub ON pub.id::text = wp.resolved_publisher_id::text
    JOIN public.push_subscriptions ps ON ps.publisher_id::text = pub.id::text
    LEFT JOIN LATERAL (
        SELECT t.token
        FROM public.confirmation_portal_tokens t
        WHERE t.part_id::text = wp.id::text
          AND t.publisher_id::text = pub.id::text
          AND t.used_at IS NULL
          AND t.expires_at > now()
        ORDER BY t.created_at DESC
        LIMIT 1
    ) cpt ON true
    WHERE 
        -- Apenas eventos das últimas 48h (para cobrir janelas de timezone ou cron delays)
        z.dispatched_at > now() - interval '2 days'
        AND z.status = 'SUCCESS' -- Apenas eventos que o WhatsApp considerou válidos
        -- Garante que o Web Push ainda não foi enviado para este endpoint neste mesmo evento/parte
        AND NOT EXISTS (
            SELECT 1 
            FROM public.push_dispatch_log pdl 
            WHERE pdl.part_id = z.part_id 
              AND pdl.dispatch_type = z.dispatch_type 
              AND pdl.endpoint = ps.endpoint
        );
END;
$$;
