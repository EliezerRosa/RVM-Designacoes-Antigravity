-- =============================================================================
-- MIGRATION: rls_hardening_phase1_rpcs (2026-08-05)
-- =============================================================================
-- Fase 1 do endurecimento RLS:
--   Cria helper is_editor() e 4 RPCs SECURITY DEFINER que substituem os acessos
--   diretos a `publishers` e `workbook_parts` feitos hoje por:
--     - PublisherAvailabilityPortal    (anônimo, token-based)
--     - PreferencesPortal              (logado publicador comum)
--     - PublisherStatusForm            (anônimo, modais NL/Eventos)
--
-- COEXISTE com as policies "Allow all" atuais. Zero risco de quebra imediata.
-- 
-- Fase 2 (posterior): migrar frontend para chamar essas RPCs em vez de `.from()`.
-- Fase 3 (posterior): substituir "Allow all" por policies restritas +
--                     REVOKE anon nas duas tabelas.
--
-- Rollback:
--   DROP FUNCTION public.portal_preferences_update(text, text, boolean);
--   DROP FUNCTION public.portal_publisher_form_list_weeks(text);
--   DROP FUNCTION public.portal_availability_save(text, jsonb, jsonb);
--   DROP FUNCTION public.portal_availability_authorize(text);
--   DROP FUNCTION public.is_editor();
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Helper: public.is_editor()
-- ─────────────────────────────────────────────────────────────────────────────
-- Retorna true se auth.uid():
--   - tem profiles.role = 'admin', OU
--   - está linkado (profiles.publisher_id) a um publisher com funcao editora
--     (SRVM, Ajudante SRVM, CBE).
-- Espelha semanticamente is_admin() mas amplia o conjunto para editores da apostila.

CREATE OR REPLACE FUNCTION public.is_editor()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
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

  RETURN v_funcao IN (
    'Superintendente da Reunião Vida e Ministério',
    'Ajudante do Superintendente da Reunião Vida e Ministério',
    'Coordenador do Corpo de Anciãos'
  );
END;
$$;

COMMENT ON FUNCTION public.is_editor() IS
  'True se auth.uid() é admin ou vinculado a publisher com role de editor de apostila (SRVM, Ajudante SRVM, CBE). Usado por futuras policies restritivas (Fase 3).';

REVOKE ALL ON FUNCTION public.is_editor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_editor() TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. portal_availability_authorize(p_token)
-- ─────────────────────────────────────────────────────────────────────────────
-- Chamada pelo PublisherAvailabilityPortal (rota anônima) para autorizar acesso
-- e devolver os dados mínimos: publisher name + availability atual + meeting_day.
--
-- Substitui:
--   api.getSetting('availability_tokens') + api.loadPublishers() +
--   api.loadPublisherById() + api.getSetting('s89_meeting_day_by_week')

CREATE OR REPLACE FUNCTION public.portal_availability_authorize(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tokens jsonb;
  v_pub_id text;
  v_pub_data jsonb;
  v_meeting_days jsonb;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'missing_token');
  END IF;

  SELECT value INTO v_tokens FROM app_settings WHERE key = 'availability_tokens';

  IF v_tokens IS NULL OR jsonb_typeof(v_tokens) <> 'array' THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'no_tokens');
  END IF;

  SELECT (t->>'publisherId') INTO v_pub_id
  FROM jsonb_array_elements(v_tokens) t
  WHERE t->>'token' = p_token
    AND COALESCE((t->>'active')::boolean, true) = true
  LIMIT 1;

  IF v_pub_id IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'invalid_or_revoked_token');
  END IF;

  SELECT data INTO v_pub_data FROM publishers WHERE id = v_pub_id;

  IF v_pub_data IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'publisher_not_found');
  END IF;

  SELECT value INTO v_meeting_days FROM app_settings WHERE key = 's89_meeting_day_by_week';

  -- Sanitização: devolve só o mínimo que o portal precisa (não vaza phone/email/etc)
  RETURN jsonb_build_object(
    'authorized', true,
    'publisher_id', v_pub_id,
    'publisher_name', v_pub_data->>'name',
    'availability', COALESCE(v_pub_data->'availability', '{}'::jsonb),
    'meeting_day_by_week', COALESCE(v_meeting_days, '{}'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.portal_availability_authorize(text) IS
  'Autoriza PublisherAvailabilityPortal via token; devolve payload sanitizado (name + availability + meeting_day_by_week).';

REVOKE ALL ON FUNCTION public.portal_availability_authorize(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_availability_authorize(text) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. portal_availability_save(p_token, p_available_dates, p_exception_dates)
-- ─────────────────────────────────────────────────────────────────────────────
-- Persiste availability chamado pelo portal anônimo.
-- Preserva o campo `availability.mode` existente (não sobrescreve).
--
-- Substitui: supabase.from('publishers').update({data: ...}).eq('id', pubId) do portal.

CREATE OR REPLACE FUNCTION public.portal_availability_save(
  p_token text,
  p_available_dates jsonb,   -- array de strings YYYY-MM-DD
  p_exception_dates jsonb    -- array de strings YYYY-MM-DD
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tokens jsonb;
  v_pub_id text;
  v_current jsonb;
  v_new_availability jsonb;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_token');
  END IF;

  IF jsonb_typeof(COALESCE(p_available_dates, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_exception_dates, '[]'::jsonb)) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_dates_type');
  END IF;

  SELECT value INTO v_tokens FROM app_settings WHERE key = 'availability_tokens';
  IF v_tokens IS NULL OR jsonb_typeof(v_tokens) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_tokens');
  END IF;

  SELECT (t->>'publisherId') INTO v_pub_id
  FROM jsonb_array_elements(v_tokens) t
  WHERE t->>'token' = p_token
    AND COALESCE((t->>'active')::boolean, true) = true
  LIMIT 1;

  IF v_pub_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_or_revoked_token');
  END IF;

  SELECT data INTO v_current FROM publishers WHERE id = v_pub_id;
  IF v_current IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'publisher_not_found');
  END IF;

  -- Merge preservando o campo `mode` (se existir)
  v_new_availability := COALESCE(v_current->'availability', '{}'::jsonb)
    || jsonb_build_object(
      'availableDates', COALESCE(p_available_dates, '[]'::jsonb),
      'exceptionDates', COALESCE(p_exception_dates, '[]'::jsonb)
    );

  UPDATE publishers
  SET data = data || jsonb_build_object('availability', v_new_availability)
  WHERE id = v_pub_id;

  RETURN jsonb_build_object('ok', true, 'publisher_id', v_pub_id);
END;
$$;

COMMENT ON FUNCTION public.portal_availability_save(text, jsonb, jsonb) IS
  'Persiste availability (availableDates + exceptionDates) preservando availability.mode; chamado pelo Availability Portal anônimo autorizado por token.';

REVOKE ALL ON FUNCTION public.portal_availability_save(text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_availability_save(text, jsonb, jsonb) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. portal_publisher_form_list_weeks(p_token)
-- ─────────────────────────────────────────────────────────────────────────────
-- Lista semanas para modais NL/Eventos do PublisherStatusForm.
-- Validação por token (mesmo mecanismo do authorize_publisher_form_token) OU
-- bypass para admin logado (que abre o form direto do painel admin).
--
-- Substitui: supabase.from('workbook_parts').select('week_id, date') do form.

CREATE OR REPLACE FUNCTION public.portal_publisher_form_list_weeks(p_token text)
RETURNS TABLE(week_id text, display text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid boolean := false;
BEGIN
  -- Token válido?
  IF p_token IS NOT NULL AND p_token <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM publisher_form_tokens
      WHERE token = p_token
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())
    ) INTO v_valid;
  END IF;

  -- Sem token válido: exige admin autenticado
  IF NOT v_valid AND NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (wp.week_id)
    wp.week_id::text AS week_id,
    CASE
      WHEN wp.date IS NOT NULL AND wp.date ~ '^\d{4}-'
        THEN wp.week_id || ' (' || substring(wp.date FROM 1 FOR 4) || ')'
      ELSE wp.week_id
    END::text AS display
  FROM workbook_parts wp
  WHERE wp.week_id IS NOT NULL
  ORDER BY wp.week_id;
END;
$$;

COMMENT ON FUNCTION public.portal_publisher_form_list_weeks(text) IS
  'Lista semanas distintas para modais NL/Eventos do PublisherStatusForm; validação por token OU admin bypass.';

REVOKE ALL ON FUNCTION public.portal_publisher_form_list_weeks(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_publisher_form_list_weeks(text) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. portal_preferences_update(p_pub_id, p_field, p_value)
-- ─────────────────────────────────────────────────────────────────────────────
-- Atualiza campos de preferência do publisher.
-- Autoriza APENAS:
--   (a) admin (via is_admin()), OU
--   (b) usuário logado cujo profile.publisher_id = p_pub_id (dono).
-- 
-- Fecha vulnerabilidade #3: hoje qualquer usuário logado pode alterar
-- preferências de qualquer publisher trocando o `pubId` na URL.

CREATE OR REPLACE FUNCTION public.portal_preferences_update(
  p_pub_id text,
  p_field text,          -- 'requestedNoParticipation' ou 'isHelperOnly'
  p_value boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner_pub text;
  v_current jsonb;
  v_publisher_name text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_field NOT IN ('requestedNoParticipation', 'isHelperOnly') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_field');
  END IF;

  SELECT publisher_id INTO v_owner_pub FROM profiles WHERE id = v_uid;

  IF NOT public.is_admin() AND (v_owner_pub IS NULL OR v_owner_pub <> p_pub_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authorized');
  END IF;

  SELECT data INTO v_current FROM publishers WHERE id = p_pub_id;
  IF v_current IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'publisher_not_found');
  END IF;

  UPDATE publishers
  SET data = data || jsonb_build_object(p_field, p_value)
  WHERE id = p_pub_id
  RETURNING data->>'name' INTO v_publisher_name;

  RETURN jsonb_build_object(
    'ok', true,
    'publisher_id', p_pub_id,
    'publisher_name', v_publisher_name,
    'field', p_field,
    'value', p_value
  );
END;
$$;

COMMENT ON FUNCTION public.portal_preferences_update(text, text, boolean) IS
  'Atualiza requestedNoParticipation ou isHelperOnly do publisher; autoriza dono (via profiles.publisher_id) ou admin. Fecha vulnerabilidade #3.';

REVOKE ALL ON FUNCTION public.portal_preferences_update(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_preferences_update(text, text, boolean) TO authenticated;
