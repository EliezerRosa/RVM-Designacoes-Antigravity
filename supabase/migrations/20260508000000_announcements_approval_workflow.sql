-- ============================================================================
-- Anúncios e Notificações — workflow de aprovação CS (Comissão de Serviço)
-- Fase A (backbone): schema + RPCs. UI/Portal/WhatsApp/pg_cron em fases B-G.
--
-- CS = {CCA, SEC, SS}
--   CCA = funcao 'Coordenador do Corpo de Anciãos'
--   SEC = funcao 'Secretário'
--   SS  = funcao 'Superintendente de Serviço'
-- SRVM = funcao 'Superintendente da Reunião Vida e Ministério' (pode criar
--        rascunho, equiparado ao SEC para esse efeito).
-- Admin = profiles.role='admin' (equivalente a CCA p/ todas as ações).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Estender special_events com colunas de aprovação / vínculo / template
-- ---------------------------------------------------------------------------
ALTER TABLE public.special_events
    ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (approval_status IN ('DRAFT','PENDING','APPROVED','REJECTED','REVOKED')),
    ADD COLUMN IF NOT EXISTS approved_by_id UUID,
    ADD COLUMN IF NOT EXISTS approved_by_label TEXT,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reverted_by_id UUID,
    ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reverted_reason TEXT,
    ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
    ADD COLUMN IF NOT EXISTS linked_event_id UUID
        REFERENCES public.special_events(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS template_key TEXT,
    ADD COLUMN IF NOT EXISTS auto_attach_to TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Permitir week NULL para anúncios futuros sem semana definida (Agenda futura).
ALTER TABLE public.special_events
    ALTER COLUMN week DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_special_events_approval
    ON public.special_events (template_id, approval_status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_special_events_linked
    ON public.special_events (linked_event_id) WHERE linked_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_special_events_template_key
    ON public.special_events (template_key) WHERE is_template = TRUE;

-- ---------------------------------------------------------------------------
-- 2. Helpers de papel (role-check) — SECURITY DEFINER, leitura mínima
-- ---------------------------------------------------------------------------

-- Resolve a funcao do usuário corrente via profiles.publisher_id → publishers.data->>'funcao'
CREATE OR REPLACE FUNCTION public._current_user_funcao()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT NULLIF(pb.data->>'funcao', '')
    FROM public.profiles pr
    LEFT JOIN public.publishers pb ON pb.id = pr.publisher_id
    WHERE pr.id = auth.uid()
    LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public._current_user_funcao() TO authenticated;

CREATE OR REPLACE FUNCTION public._current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;
GRANT EXECUTE ON FUNCTION public._current_user_is_admin() TO authenticated;

-- CS = CCA + SEC + SS (ou admin)
CREATE OR REPLACE FUNCTION public.is_cs_member()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public._current_user_is_admin()
        OR public._current_user_funcao() IN (
            'Coordenador do Corpo de Anciãos',
            'Secretário',
            'Superintendente de Serviço'
        );
$$;
GRANT EXECUTE ON FUNCTION public.is_cs_member() TO authenticated;

-- Pode criar rascunho: CS + SRVM
CREATE OR REPLACE FUNCTION public.can_edit_announcement_draft()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_cs_member()
        OR public._current_user_funcao() = 'Superintendente da Reunião Vida e Ministério';
$$;
GRANT EXECUTE ON FUNCTION public.can_edit_announcement_draft() TO authenticated;

-- Pode aprovar/reverter/reeditar texto após aprovação: CCA ou Admin
CREATE OR REPLACE FUNCTION public.can_approve_announcement()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public._current_user_is_admin()
        OR public._current_user_funcao() = 'Coordenador do Corpo de Anciãos';
$$;
GRANT EXECUTE ON FUNCTION public.can_approve_announcement() TO authenticated;

-- Pode disparar WhatsApp: CS (e admin via is_cs_member)
CREATE OR REPLACE FUNCTION public.can_dispatch_announcement_whatsapp()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.is_cs_member(); $$;
GRANT EXECUTE ON FUNCTION public.can_dispatch_announcement_whatsapp() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Tabela announcement_history (auditoria de transições)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcement_history (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES public.special_events(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN (
        'created','edited_draft','submitted','approved','rejected',
        'reverted','edited_after_approval','revoked','whatsapp_dispatched',
        'auto_cloned_from_template'
    )),
    actor_id UUID,
    actor_label TEXT NOT NULL,
    previous_text TEXT,
    new_text TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_announcement_history_event
    ON public.announcement_history (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcement_history_created
    ON public.announcement_history (created_at DESC);

ALTER TABLE public.announcement_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS announcement_history_read ON public.announcement_history;
CREATE POLICY announcement_history_read ON public.announcement_history
    FOR SELECT TO authenticated
    USING (public.is_cs_member()
        OR public._current_user_funcao() = 'Superintendente da Reunião Vida e Ministério');
DROP POLICY IF EXISTS announcement_history_no_direct_write ON public.announcement_history;
CREATE POLICY announcement_history_no_direct_write ON public.announcement_history
    FOR INSERT TO authenticated WITH CHECK (FALSE);

-- ---------------------------------------------------------------------------
-- 4. Tabela announcement_change_notifications (banner CS/Admin)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcement_change_notifications (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID REFERENCES public.special_events(id) ON DELETE CASCADE,
    history_id BIGINT REFERENCES public.announcement_history(id) ON DELETE SET NULL,
    severity TEXT NOT NULL DEFAULT 'info'
        CHECK (severity IN ('info','warning','critical')),
    summary TEXT NOT NULL,
    source TEXT NOT NULL,
    author_label TEXT NOT NULL,
    dismissed_at TIMESTAMPTZ,
    dismissed_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_announcement_notif_pending
    ON public.announcement_change_notifications (created_at DESC)
    WHERE dismissed_at IS NULL;

ALTER TABLE public.announcement_change_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS announcement_notif_read ON public.announcement_change_notifications;
CREATE POLICY announcement_notif_read ON public.announcement_change_notifications
    FOR SELECT TO authenticated
    USING (public.is_cs_member());
DROP POLICY IF EXISTS announcement_notif_dismiss ON public.announcement_change_notifications;
CREATE POLICY announcement_notif_dismiss ON public.announcement_change_notifications
    FOR UPDATE TO authenticated
    USING (public.is_cs_member())
    WITH CHECK (public.is_cs_member());

-- ---------------------------------------------------------------------------
-- 5. Tabela whatsapp_dispatch_log (envios wa.me com hash; sem texto pleno)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_dispatch_log (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID REFERENCES public.special_events(id) ON DELETE CASCADE,
    recipient_role TEXT NOT NULL,
    recipient_publisher_id TEXT,
    recipient_label TEXT,
    phone_masked TEXT,
    message_hash TEXT,
    dispatched_by_id UUID,
    dispatched_by_label TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_dispatch_event
    ON public.whatsapp_dispatch_log (event_id, created_at DESC);

ALTER TABLE public.whatsapp_dispatch_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_dispatch_read ON public.whatsapp_dispatch_log;
CREATE POLICY wa_dispatch_read ON public.whatsapp_dispatch_log
    FOR SELECT TO authenticated USING (public.is_cs_member());
DROP POLICY IF EXISTS wa_dispatch_no_direct_write ON public.whatsapp_dispatch_log;
CREATE POLICY wa_dispatch_no_direct_write ON public.whatsapp_dispatch_log
    FOR INSERT TO authenticated WITH CHECK (FALSE);

-- ---------------------------------------------------------------------------
-- 6. RPCs SECURITY DEFINER
-- ---------------------------------------------------------------------------

-- Helper interno: insere notification (não exposto)
CREATE OR REPLACE FUNCTION public._insert_announcement_notification(
    p_event_id UUID,
    p_history_id BIGINT,
    p_severity TEXT,
    p_summary TEXT,
    p_source TEXT,
    p_author_label TEXT
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id BIGINT;
BEGIN
    INSERT INTO public.announcement_change_notifications
        (event_id, history_id, severity, summary, source, author_label)
    VALUES (p_event_id, p_history_id, p_severity, p_summary, p_source, p_author_label)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- 6.1 submit_announcement_for_approval
CREATE OR REPLACE FUNCTION public.submit_announcement_for_approval(
    p_event_id UUID,
    p_actor_label TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
    v_template TEXT;
    v_history_id BIGINT;
BEGIN
    IF NOT public.can_edit_announcement_draft() THEN
        RAISE EXCEPTION 'Sem permissão para submeter anúncio' USING ERRCODE='42501';
    END IF;

    SELECT approval_status, template_id INTO v_status, v_template
    FROM public.special_events WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Evento não encontrado' USING ERRCODE='02000'; END IF;
    IF v_template NOT IN ('anuncio','notificacao') THEN
        RAISE EXCEPTION 'Apenas anúncios/notificações podem ser submetidos' USING ERRCODE='22023';
    END IF;
    IF v_status NOT IN ('DRAFT','REJECTED') THEN
        RAISE EXCEPTION 'Estado inválido para submissão: %', v_status USING ERRCODE='22023';
    END IF;

    UPDATE public.special_events
       SET approval_status = 'PENDING', updated_at = NOW()
     WHERE id = p_event_id;

    INSERT INTO public.announcement_history (event_id, action, actor_id, actor_label)
    VALUES (p_event_id, 'submitted', auth.uid(), p_actor_label)
    RETURNING id INTO v_history_id;

    PERFORM public._insert_announcement_notification(
        p_event_id, v_history_id, 'warning',
        'Anúncio aguardando aprovação do CCA', 'app', p_actor_label
    );

    RETURN jsonb_build_object('success', TRUE, 'history_id', v_history_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_announcement_for_approval(UUID, TEXT) TO authenticated;

-- 6.2 approve_announcement
CREATE OR REPLACE FUNCTION public.approve_announcement(
    p_event_id UUID,
    p_actor_label TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
    v_history_id BIGINT;
BEGIN
    IF NOT public.can_approve_announcement() THEN
        RAISE EXCEPTION 'Apenas CCA/Admin pode aprovar' USING ERRCODE='42501';
    END IF;

    SELECT approval_status INTO v_status
    FROM public.special_events WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Evento não encontrado' USING ERRCODE='02000'; END IF;
    IF v_status <> 'PENDING' THEN
        RAISE EXCEPTION 'Estado inválido para aprovação: %', v_status USING ERRCODE='22023';
    END IF;

    UPDATE public.special_events
       SET approval_status = 'APPROVED',
           approved_by_id = auth.uid(),
           approved_by_label = p_actor_label,
           approved_at = NOW(),
           reverted_by_id = NULL,
           reverted_at = NULL,
           reverted_reason = NULL,
           rejected_reason = NULL,
           updated_at = NOW()
     WHERE id = p_event_id;

    INSERT INTO public.announcement_history (event_id, action, actor_id, actor_label)
    VALUES (p_event_id, 'approved', auth.uid(), p_actor_label)
    RETURNING id INTO v_history_id;

    PERFORM public._insert_announcement_notification(
        p_event_id, v_history_id, 'info',
        'Anúncio aprovado', 'app', p_actor_label
    );

    RETURN jsonb_build_object('success', TRUE, 'history_id', v_history_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_announcement(UUID, TEXT) TO authenticated;

-- 6.3 reject_announcement
CREATE OR REPLACE FUNCTION public.reject_announcement(
    p_event_id UUID,
    p_actor_label TEXT,
    p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
    v_history_id BIGINT;
BEGIN
    IF NOT public.can_approve_announcement() THEN
        RAISE EXCEPTION 'Apenas CCA/Admin pode rejeitar' USING ERRCODE='42501';
    END IF;
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
        RAISE EXCEPTION 'Motivo obrigatório' USING ERRCODE='22023';
    END IF;

    SELECT approval_status INTO v_status
    FROM public.special_events WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Evento não encontrado' USING ERRCODE='02000'; END IF;
    IF v_status NOT IN ('PENDING') THEN
        RAISE EXCEPTION 'Estado inválido para rejeição: %', v_status USING ERRCODE='22023';
    END IF;

    UPDATE public.special_events
       SET approval_status = 'REJECTED',
           rejected_reason = p_reason,
           updated_at = NOW()
     WHERE id = p_event_id;

    INSERT INTO public.announcement_history
        (event_id, action, actor_id, actor_label, metadata)
    VALUES (p_event_id, 'rejected', auth.uid(), p_actor_label,
            jsonb_build_object('reason', p_reason))
    RETURNING id INTO v_history_id;

    PERFORM public._insert_announcement_notification(
        p_event_id, v_history_id, 'critical',
        'Anúncio rejeitado: ' || p_reason, 'app', p_actor_label
    );

    RETURN jsonb_build_object('success', TRUE, 'history_id', v_history_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.reject_announcement(UUID, TEXT, TEXT) TO authenticated;

-- 6.4 revert_announcement_approval
CREATE OR REPLACE FUNCTION public.revert_announcement_approval(
    p_event_id UUID,
    p_actor_label TEXT,
    p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
    v_history_id BIGINT;
BEGIN
    IF NOT public.can_approve_announcement() THEN
        RAISE EXCEPTION 'Apenas CCA/Admin pode reverter aprovação' USING ERRCODE='42501';
    END IF;
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
        RAISE EXCEPTION 'Motivo obrigatório' USING ERRCODE='22023';
    END IF;

    SELECT approval_status INTO v_status
    FROM public.special_events WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Evento não encontrado' USING ERRCODE='02000'; END IF;
    IF v_status <> 'APPROVED' THEN
        RAISE EXCEPTION 'Apenas anúncio APROVADO pode ser revertido' USING ERRCODE='22023';
    END IF;

    UPDATE public.special_events
       SET approval_status = 'PENDING',
           reverted_by_id = auth.uid(),
           reverted_at = NOW(),
           reverted_reason = p_reason,
           updated_at = NOW()
     WHERE id = p_event_id;

    INSERT INTO public.announcement_history
        (event_id, action, actor_id, actor_label, metadata)
    VALUES (p_event_id, 'reverted', auth.uid(), p_actor_label,
            jsonb_build_object('reason', p_reason))
    RETURNING id INTO v_history_id;

    PERFORM public._insert_announcement_notification(
        p_event_id, v_history_id, 'warning',
        'Aprovação revertida: ' || p_reason, 'app', p_actor_label
    );

    RETURN jsonb_build_object('success', TRUE, 'history_id', v_history_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.revert_announcement_approval(UUID, TEXT, TEXT) TO authenticated;

-- 6.5 edit_approved_announcement_text (CCA reedita após aprovação, mantém status)
CREATE OR REPLACE FUNCTION public.edit_approved_announcement_text(
    p_event_id UUID,
    p_actor_label TEXT,
    p_new_content TEXT,
    p_new_reference TEXT,
    p_new_links TEXT[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
    v_old_content TEXT;
    v_history_id BIGINT;
BEGIN
    IF NOT public.can_approve_announcement() THEN
        RAISE EXCEPTION 'Apenas CCA/Admin pode reeditar anúncio aprovado' USING ERRCODE='42501';
    END IF;

    SELECT approval_status, content INTO v_status, v_old_content
    FROM public.special_events WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Evento não encontrado' USING ERRCODE='02000'; END IF;
    IF v_status <> 'APPROVED' THEN
        RAISE EXCEPTION 'Apenas APPROVED admite reedição direta' USING ERRCODE='22023';
    END IF;

    UPDATE public.special_events
       SET content = p_new_content,
           reference = p_new_reference,
           links = p_new_links,
           updated_at = NOW()
     WHERE id = p_event_id;

    INSERT INTO public.announcement_history
        (event_id, action, actor_id, actor_label, previous_text, new_text)
    VALUES (p_event_id, 'edited_after_approval', auth.uid(), p_actor_label,
            v_old_content, p_new_content)
    RETURNING id INTO v_history_id;

    PERFORM public._insert_announcement_notification(
        p_event_id, v_history_id, 'info',
        'Texto do anúncio aprovado foi atualizado', 'app', p_actor_label
    );

    RETURN jsonb_build_object('success', TRUE, 'history_id', v_history_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.edit_approved_announcement_text(UUID, TEXT, TEXT, TEXT, TEXT[]) TO authenticated;

-- 6.6 log_whatsapp_dispatch
CREATE OR REPLACE FUNCTION public.log_whatsapp_dispatch(
    p_event_id UUID,
    p_actor_label TEXT,
    p_recipient_role TEXT,
    p_recipient_publisher_id TEXT,
    p_recipient_label TEXT,
    p_phone_masked TEXT,
    p_message_hash TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id BIGINT;
BEGIN
    IF NOT public.can_dispatch_announcement_whatsapp() THEN
        RAISE EXCEPTION 'Sem permissão para registrar envio WhatsApp' USING ERRCODE='42501';
    END IF;

    INSERT INTO public.whatsapp_dispatch_log
        (event_id, recipient_role, recipient_publisher_id, recipient_label,
         phone_masked, message_hash, dispatched_by_id, dispatched_by_label, metadata)
    VALUES (p_event_id, p_recipient_role, p_recipient_publisher_id, p_recipient_label,
            p_phone_masked, p_message_hash, auth.uid(), p_actor_label,
            COALESCE(p_metadata, '{}'::jsonb))
    RETURNING id INTO v_id;

    INSERT INTO public.announcement_history
        (event_id, action, actor_id, actor_label, metadata)
    VALUES (p_event_id, 'whatsapp_dispatched', auth.uid(), p_actor_label,
            jsonb_build_object('dispatch_id', v_id, 'recipient_role', p_recipient_role,
                               'recipient_label', p_recipient_label));

    RETURN jsonb_build_object('success', TRUE, 'dispatch_id', v_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_whatsapp_dispatch(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- 6.7 dismiss_announcement_notification
CREATE OR REPLACE FUNCTION public.dismiss_announcement_notification(
    p_id BIGINT,
    p_actor_label TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_cs_member() THEN
        RAISE EXCEPTION 'Sem permissão para dispensar notificação' USING ERRCODE='42501';
    END IF;
    UPDATE public.announcement_change_notifications
       SET dismissed_at = NOW(), dismissed_by = p_actor_label
     WHERE id = p_id AND dismissed_at IS NULL;
    RETURN jsonb_build_object('success', TRUE);
END;
$$;
GRANT EXECUTE ON FUNCTION public.dismiss_announcement_notification(BIGINT, TEXT) TO authenticated;

-- 6.8 record_announcement_event (created/edited_draft) — usado pelo frontend
-- após cada salvar do rascunho, para auditoria.
CREATE OR REPLACE FUNCTION public.record_announcement_draft_event(
    p_event_id UUID,
    p_action TEXT,
    p_actor_label TEXT,
    p_previous_text TEXT,
    p_new_text TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id BIGINT;
BEGIN
    IF NOT public.can_edit_announcement_draft() THEN
        RAISE EXCEPTION 'Sem permissão para auditar rascunho' USING ERRCODE='42501';
    END IF;
    IF p_action NOT IN ('created','edited_draft','auto_cloned_from_template','revoked') THEN
        RAISE EXCEPTION 'Ação inválida: %', p_action USING ERRCODE='22023';
    END IF;
    INSERT INTO public.announcement_history
        (event_id, action, actor_id, actor_label, previous_text, new_text, metadata)
    VALUES (p_event_id, p_action, auth.uid(), p_actor_label, p_previous_text, p_new_text,
            COALESCE(p_metadata, '{}'::jsonb))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', TRUE, 'history_id', v_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_announcement_draft_event(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Realtime publication
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    PERFORM 1 FROM pg_publication WHERE pubname = 'supabase_realtime';
    IF FOUND THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.announcement_change_notifications';
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    PERFORM 1 FROM pg_publication WHERE pubname = 'supabase_realtime';
    IF FOUND THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.announcement_history';
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN OTHERS THEN NULL;
END $$;

COMMIT;
