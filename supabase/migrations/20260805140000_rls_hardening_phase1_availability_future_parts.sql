-- =============================================================================
-- MIGRATION: rls_hardening_phase1_availability_future_parts (2026-08-05)
-- =============================================================================
-- Complementa Fase 1: RPC para AvailabilityPortal listar future_parts sem
-- depender de SELECT direto em workbook_parts (que será revogado para anon
-- na Fase 3). Chamada pelo portal ao computar impedimentos antes de salvar.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_future_parts_for_availability_portal(
  p_token text,
  p_today text
)
RETURNS TABLE(
  id text,
  week_id text,
  date text,
  tipo_parte text,
  part_title text,
  modalidade text,
  section text,
  funcao text,
  resolved_publisher_name text,
  raw_publisher_name text,
  status text,
  seq integer,
  is_manual_override boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tokens jsonb;
  v_pub_name text;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RAISE EXCEPTION 'missing_token' USING ERRCODE = '28000';
  END IF;

  SELECT value INTO v_tokens FROM app_settings WHERE key = 'availability_tokens';
  IF v_tokens IS NULL OR jsonb_typeof(v_tokens) <> 'array' THEN
    RAISE EXCEPTION 'no_tokens' USING ERRCODE = '28000';
  END IF;

  SELECT (
    SELECT p.data->>'name'
    FROM publishers p
    WHERE p.id = (t->>'publisherId')
  ) INTO v_pub_name
  FROM jsonb_array_elements(v_tokens) t
  WHERE t->>'token' = p_token
    AND COALESCE((t->>'active')::boolean, true) = true
  LIMIT 1;

  IF v_pub_name IS NULL THEN
    RAISE EXCEPTION 'invalid_or_revoked_token' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT
    wp.id,
    wp.week_id,
    wp.date,
    wp.tipo_parte,
    wp.part_title,
    wp.modalidade,
    wp.section,
    wp.funcao,
    wp.resolved_publisher_name,
    wp.raw_publisher_name,
    wp.status,
    wp.seq,
    wp.is_manual_override
  FROM workbook_parts wp
  WHERE wp.date >= p_today
    AND wp.resolved_publisher_name ILIKE v_pub_name
    AND wp.status NOT IN ('CONCLUIDA', 'CANCELADA');
END;
$$;

COMMENT ON FUNCTION public.list_future_parts_for_availability_portal(text, text) IS
  'Lista future workbook_parts atribuídas ao publisher do token; usada pelo AvailabilityPortal para detectar impedimentos.';

REVOKE ALL ON FUNCTION public.list_future_parts_for_availability_portal(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_future_parts_for_availability_portal(text, text) TO anon, authenticated;
