-- =============================================================================
-- Migration: 20260906160000_automation_bot_token_rpc.sql
-- Descrição: Token de autenticação segura para o robô headless de automação
--            (D-30 Geração e D-21 Publicação) e RPC verify_automation_bot_token.
-- Invariante: O token é validado via SECURITY DEFINER, sem expor credenciais
--             no bundle do frontend.
-- =============================================================================

INSERT INTO public.app_settings (key, value)
VALUES ('automation_bot_token', '"rvm_bot_8f4a1c9e2b7d3f5a0e6c8b1d4e7a9f2c"'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verify_automation_bot_token(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stored jsonb;
  v_expected text;
BEGIN
  IF p_token IS NULL OR TRIM(p_token) = '' THEN
    RETURN false;
  END IF;

  SELECT value INTO v_stored
  FROM app_settings
  WHERE key = 'automation_bot_token';

  IF v_stored IS NULL THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(v_stored) = 'string' THEN
    v_expected := v_stored #>> '{}';
  ELSE
    v_expected := v_stored::text;
  END IF;

  RETURN TRIM(p_token) = TRIM(v_expected);
END;
$function$;

COMMENT ON FUNCTION public.verify_automation_bot_token(text) IS 'Valida o token do robô headless de automação D-30 / D-21 contra app_settings.';
