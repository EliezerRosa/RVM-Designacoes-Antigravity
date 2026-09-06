-- =============================================================================
-- Migration: 20260905060000_expand_is_editor_for_cs.sql
-- Descrição: Harmoniza a função de segurança public.is_editor() para incluir
--            todos os membros da Comissão de Serviço (Coordenador, Secretário e
--            Superintendente de Serviço) e a equipe de RVM (SRVM e Ajudante),
--            permitindo que as políticas RLS em publishers e workbook_parts
--            autorizem suas ações legítimas.
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
    'Coordenador do Corpo de Anciãos',
    'Secretário',
    'Superintendente de Serviço'
  );
END;
$function$;

COMMENT ON FUNCTION public.is_editor() IS 'Retorna true se o usuário for admin ou possuir papel ativo de SRVM, AjSRVM, CCA, Secretário ou SS.';
