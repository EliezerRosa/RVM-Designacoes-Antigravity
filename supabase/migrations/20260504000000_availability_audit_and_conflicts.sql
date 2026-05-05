-- ============================================================================
-- Availability — log histórico, autoria, notificações e detecção de conflitos
-- ============================================================================
-- Pacote único de migração para:
--   1. Tabela `availability_history` — registra TODA mudança em publishers.availability
--   2. Tabela `availability_change_notifications` — destaque ao admin (banner)
--   3. Coluna `needs_reassignment` em `workbook_parts` — slot a re-atribuir
--   4. RPC `record_availability_change` — chamada por admin/agente (autenticado)
--   5. RPC `submit_publisher_availability` v2 — portal anônimo (com IP/UA)
--   6. Função interna `apply_availability_change_internal` que:
--        - persiste availability + meta no JSONB
--        - grava em availability_history
--        - detecta workbook_parts conflitantes (data bloqueada × designação ativa)
--        - marca parts como needs_reassignment=true
--        - cria notificação para o admin
--   7. Realtime: adiciona availability_history + notifications + workbook_parts à publication
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Tabela availability_history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.availability_history (
    id BIGSERIAL PRIMARY KEY,
    publisher_id TEXT NOT NULL,
    publisher_name TEXT,
    old_availability JSONB,
    new_availability JSONB NOT NULL,
    source TEXT NOT NULL CHECK (source IN (
        'admin_app', 'admin_agent', 'publisher_portal', 'import', 'system'
    )),
    author_label TEXT NOT NULL,         -- "Admin: João" | "Agente" | "Publicador (auto)"
    author_id TEXT,                     -- auth.uid() quando admin/agente; NULL no portal
    token TEXT,                         -- hash/prefix do token quando portal
    ip_address TEXT,
    user_agent TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_availability_history_publisher
    ON public.availability_history (publisher_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_availability_history_changed_at
    ON public.availability_history (changed_at DESC);

ALTER TABLE public.availability_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS availability_history_admin_read ON public.availability_history;
CREATE POLICY availability_history_admin_read ON public.availability_history
    FOR SELECT TO authenticated USING (true);

-- Inserts só via SECURITY DEFINER functions; bloqueia direto.
DROP POLICY IF EXISTS availability_history_no_direct_write ON public.availability_history;
CREATE POLICY availability_history_no_direct_write ON public.availability_history
    FOR INSERT TO authenticated WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- 2. Tabela availability_change_notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.availability_change_notifications (
    id BIGSERIAL PRIMARY KEY,
    history_id BIGINT REFERENCES public.availability_history(id) ON DELETE CASCADE,
    publisher_id TEXT NOT NULL,
    publisher_name TEXT,
    severity TEXT NOT NULL DEFAULT 'info'
        CHECK (severity IN ('info', 'warning', 'critical')),
    summary TEXT NOT NULL,
    affected_part_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    affected_part_count INT NOT NULL DEFAULT 0,
    source TEXT NOT NULL,
    author_label TEXT NOT NULL,
    dismissed_at TIMESTAMPTZ,
    dismissed_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_avail_notif_pending
    ON public.availability_change_notifications (created_at DESC)
    WHERE dismissed_at IS NULL;

ALTER TABLE public.availability_change_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS avail_notif_read_auth ON public.availability_change_notifications;
CREATE POLICY avail_notif_read_auth ON public.availability_change_notifications
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS avail_notif_dismiss_auth ON public.availability_change_notifications;
CREATE POLICY avail_notif_dismiss_auth ON public.availability_change_notifications
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. Coluna needs_reassignment em workbook_parts
-- ---------------------------------------------------------------------------
ALTER TABLE public.workbook_parts
    ADD COLUMN IF NOT EXISTS needs_reassignment BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS reassignment_reason TEXT,
    ADD COLUMN IF NOT EXISTS reassignment_marked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_workbook_parts_needs_reassignment
    ON public.workbook_parts (needs_reassignment, date)
    WHERE needs_reassignment = TRUE;

-- ---------------------------------------------------------------------------
-- 4. Helper: extrair datas bloqueadas a partir de uma availability JSONB
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_blocked_dates(p_avail JSONB)
RETURNS SETOF TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_mode TEXT;
BEGIN
    IF p_avail IS NULL THEN RETURN; END IF;
    v_mode := COALESCE(p_avail->>'mode', 'always');
    -- mode='always': bloqueado = exceptionDates
    -- mode='never':  bloqueado = TODAS as datas EXCETO availableDates
    --                (não enumera infinito; aqui só nos importam exceptions explícitas)
    IF v_mode = 'always' THEN
        RETURN QUERY
        SELECT jsonb_array_elements_text(COALESCE(p_avail->'exceptionDates', '[]'::jsonb));
    ELSE
        -- Para mode='never', delegamos a detecção ao SQL externo: TODAS as parts
        -- do publicador serão consideradas conflitantes EXCETO as em availableDates.
        RETURN;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Função INTERNA: aplica mudança + history + notif + conflitos
--    Não pode ser chamada por anon — só por outras SECURITY DEFINER funcs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_availability_change_internal(
    p_publisher_id TEXT,
    p_new_availability JSONB,
    p_source TEXT,
    p_author_label TEXT,
    p_author_id TEXT,
    p_token TEXT,
    p_ip TEXT,
    p_ua TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old_data JSONB;
    v_old_avail JSONB;
    v_publisher_name TEXT;
    v_meta JSONB;
    v_new_data JSONB;
    v_history_id BIGINT;
    v_today DATE := CURRENT_DATE;
    v_affected UUID[];
    v_affected_count INT;
    v_summary TEXT;
    v_severity TEXT;
    v_avail_mode TEXT;
    v_avail_dates TEXT[];
BEGIN
    -- 1) Snapshot estado anterior
    SELECT data INTO v_old_data FROM publishers WHERE id = p_publisher_id;
    IF v_old_data IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'publisher_not_found');
    END IF;
    v_old_avail := v_old_data->'availability';
    v_publisher_name := v_old_data->>'name';

    -- 2) Monta meta
    v_meta := jsonb_build_object(
        'updatedAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'updatedBy', p_author_label,
        'updatedById', p_author_id,
        'source', p_source
    );

    -- 3) Persiste availability + meta
    v_new_data := jsonb_set(
        jsonb_set(COALESCE(v_old_data, '{}'::jsonb), '{availability}', p_new_availability, true),
        '{availabilityMeta}', v_meta, true
    );
    UPDATE publishers SET data = v_new_data WHERE id = p_publisher_id;

    -- 4) Grava history
    INSERT INTO availability_history (
        publisher_id, publisher_name, old_availability, new_availability,
        source, author_label, author_id, token, ip_address, user_agent
    ) VALUES (
        p_publisher_id, v_publisher_name, v_old_avail, p_new_availability,
        p_source, p_author_label, p_author_id,
        CASE WHEN p_token IS NOT NULL THEN substring(p_token, 1, 8) || '…' ELSE NULL END,
        p_ip, p_ua
    ) RETURNING id INTO v_history_id;

    -- 5) Detecta workbook_parts conflitantes (designações ativas em datas bloqueadas)
    v_avail_mode := COALESCE(p_new_availability->>'mode', 'always');

    IF v_avail_mode = 'always' THEN
        -- bloqueado = exceptionDates
        SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_new_availability->'exceptionDates', '[]'::jsonb)))
            INTO v_avail_dates;

        SELECT COALESCE(array_agg(wp.id), ARRAY[]::UUID[])
          INTO v_affected
          FROM workbook_parts wp
         WHERE wp.resolved_publisher_id = p_publisher_id
           AND wp.date::date >= v_today
           AND wp.date = ANY(v_avail_dates)
           AND COALESCE(wp.status, '') NOT IN ('cancelled', 'completed');
    ELSE
        -- mode='never': bloqueado = todas EXCETO availableDates
        SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_new_availability->'availableDates', '[]'::jsonb)))
            INTO v_avail_dates;

        SELECT COALESCE(array_agg(wp.id), ARRAY[]::UUID[])
          INTO v_affected
          FROM workbook_parts wp
         WHERE wp.resolved_publisher_id = p_publisher_id
           AND wp.date::date >= v_today
           AND NOT (wp.date = ANY(v_avail_dates))
           AND COALESCE(wp.status, '') NOT IN ('cancelled', 'completed');
    END IF;

    v_affected_count := COALESCE(array_length(v_affected, 1), 0);

    -- 6) Marca parts conflitantes
    IF v_affected_count > 0 THEN
        UPDATE workbook_parts
           SET needs_reassignment = TRUE,
               reassignment_reason = 'availability_conflict',
               reassignment_marked_at = NOW()
         WHERE id = ANY(v_affected);
    END IF;

    -- 7) Cria notificação
    IF v_affected_count > 0 THEN
        v_severity := 'critical';
        v_summary := format('Disponibilidade de %s alterada por %s — %s designação(ões) afetada(s).',
            COALESCE(v_publisher_name, p_publisher_id), p_author_label, v_affected_count);
    ELSE
        v_severity := 'info';
        v_summary := format('Disponibilidade de %s atualizada por %s.',
            COALESCE(v_publisher_name, p_publisher_id), p_author_label);
    END IF;

    INSERT INTO availability_change_notifications (
        history_id, publisher_id, publisher_name, severity, summary,
        affected_part_ids, affected_part_count, source, author_label
    ) VALUES (
        v_history_id, p_publisher_id, v_publisher_name, v_severity, v_summary,
        v_affected, v_affected_count, p_source, p_author_label
    );

    RETURN jsonb_build_object(
        'success', true,
        'historyId', v_history_id,
        'publisherId', p_publisher_id,
        'affectedPartCount', v_affected_count,
        'affectedPartIds', to_jsonb(v_affected),
        'severity', v_severity,
        'meta', v_meta
    );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_availability_change_internal(TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
-- não concedido a nenhum role; só chamado de outras SECURITY DEFINER

-- ---------------------------------------------------------------------------
-- 6. RPC pública: record_availability_change (admin/agente, autenticado)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_availability_change(
    p_publisher_id TEXT,
    p_new_availability JSONB,
    p_source TEXT,           -- 'admin_app' | 'admin_agent'
    p_author_label TEXT,
    p_author_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;
    IF p_source NOT IN ('admin_app', 'admin_agent', 'system') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_source');
    END IF;
    RETURN public.apply_availability_change_internal(
        p_publisher_id,
        p_new_availability,
        p_source,
        COALESCE(p_author_label, 'Admin'),
        COALESCE(p_author_id, auth.uid()::TEXT),
        NULL, NULL, NULL
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_availability_change(TEXT, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_availability_change(TEXT, JSONB, TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPC v2: submit_publisher_availability (portal, anônimo)
--    Substitui versão antiga (mesmo nome) — antiga só fazia UPDATE silencioso.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_publisher_availability(TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.submit_publisher_availability(
    p_token TEXT,
    p_availability JSONB,
    p_user_agent TEXT DEFAULT NULL,
    p_ip_hint TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tokens JSONB;
    v_match JSONB;
    v_publisher_id TEXT;
    v_publisher_name TEXT;
BEGIN
    IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'missing_token');
    END IF;
    IF p_availability IS NULL OR jsonb_typeof(p_availability) <> 'object' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
    END IF;

    SELECT value INTO v_tokens FROM app_settings WHERE key = 'availability_tokens' LIMIT 1;
    IF v_tokens IS NULL OR jsonb_typeof(v_tokens) <> 'array' THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_tokens_configured');
    END IF;

    SELECT t INTO v_match
      FROM jsonb_array_elements(v_tokens) AS t
     WHERE t->>'token' = trim(p_token)
       AND COALESCE((t->>'active')::boolean, false) = true
     LIMIT 1;

    IF v_match IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_or_revoked_token');
    END IF;

    v_publisher_id := v_match->>'publisherId';
    v_publisher_name := v_match->>'publisherName';

    IF v_publisher_id IS NULL OR length(v_publisher_id) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'token_missing_publisher');
    END IF;

    RETURN public.apply_availability_change_internal(
        v_publisher_id,
        p_availability,
        'publisher_portal',
        format('Publicador (auto): %s', COALESCE(v_publisher_name, v_publisher_id)),
        NULL,
        p_token,
        p_ip_hint,
        p_user_agent
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_publisher_availability(TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_publisher_availability(TEXT, JSONB, TEXT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. RPC: dismiss_availability_notification
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dismiss_availability_notification(p_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;
    UPDATE availability_change_notifications
       SET dismissed_at = NOW(),
           dismissed_by = auth.uid()::TEXT
     WHERE id = p_id AND dismissed_at IS NULL;
    RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.dismiss_availability_notification(BIGINT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. RPC: clear_part_reassignment_flag (chamada após motor reatribuir)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_part_reassignment_flag(p_part_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;
    UPDATE workbook_parts
       SET needs_reassignment = FALSE,
           reassignment_reason = NULL,
           reassignment_marked_at = NULL
     WHERE id = p_part_id;
    RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.clear_part_reassignment_flag(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Realtime publication
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.availability_history;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.availability_change_notifications;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

COMMIT;
