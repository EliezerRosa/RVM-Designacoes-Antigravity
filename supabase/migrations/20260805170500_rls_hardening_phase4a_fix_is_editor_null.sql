-- =============================================================================
-- RLS Hardening — Fase 4a (fix): is_editor() retornava null quando v_funcao
-- era null (maioria dos publicadores). Não afetava segurança (null em USING
-- vira false), mas poluía retornos JSON. Trocado por COALESCE(v_funcao, '').
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_editor()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_pub_id text;
  v_role text;
  v_funcao text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT role, publisher_id INTO v_role, v_pub_id
  FROM profiles WHERE id = v_uid;

  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  IF v_pub_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT data->>'funcao' INTO v_funcao
  FROM publishers WHERE id = v_pub_id;

  RETURN COALESCE(v_funcao, '') IN (
    'Superintendente da Reunião Vida e Ministério',
    'Ajudante do Superintendente da Reunião Vida e Ministério',
    'Coordenador do Corpo de Anciãos'
  );
END;
$function$;
