-- ============================================================================
-- Funcionalidade: Web Push Notifications (Offload de Processamento)
-- RPC para calcular alertas de Cron e retornar endpoints de push inscritos
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_pending_push_alerts()
RETURNS TABLE (
    alert_key text,
    alert_type text,
    message text,
    endpoint text,
    p256dh text,
    auth text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    today_str text := to_char(current_date, 'YYYY-MM-DD');
BEGIN
    -- Esta RPC transfere o esforço computacional do TypeScript (Edge Function)
    -- para o motor do banco de dados (C/Postgres).
    
    RETURN QUERY
    SELECT 
        'TEST_ALERT_' || today_str as alert_key,
        'TEST' as alert_type,
        'Bem-vindo ao Web Push Nativo do RVM Designações!' as message,
        ps.endpoint,
        ps.p256dh,
        ps.auth
    FROM public.push_subscriptions ps;
END;
$$;
