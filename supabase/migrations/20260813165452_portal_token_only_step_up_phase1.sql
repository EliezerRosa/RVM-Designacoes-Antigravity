-- Fase 1 do Portal Token-Only com Step-Up Authentication
--
-- Intencao (IDD): reduzir a friccao para o usuario final ao maximo.
-- Fluxo padrao: publicador clica link WhatsApp -> portal abre direto sem login.
-- Google login vira upgrade opcional (step-up) para casos que exigem elevacao
-- de confianca (alterar resposta previa, dispute, admin, link expirado).
--
-- Invariantes (I-1 a I-6, ver diagrama semantico da sessao 2026-08-13):
-- I-1 Token opaco, unico, uso unico, vinculado a (part_id, publisher_id).
-- I-3 Toda resposta rastreia trust_level (novo). Admin nunca vira 'unverified';
--     anonimo por token nunca vira 'admin'.
-- I-5 Elevacao de confianca nunca sobrescreve resposta anonima destrutivamente
--     (fase 2 implementara upgrade_response_trust). Aqui: 1a resposta ganha.
--
-- Mudancas de schema: 1 coluna nova em confirmation_portal_responses.
-- Mudancas de RPC: submit_confirmation_portal_response deixa de exigir
--   auth.uid() e computa trust_level a partir do estado do caller.

ALTER TABLE public.confirmation_portal_responses
  ADD COLUMN IF NOT EXISTS trust_level text NOT NULL DEFAULT 'token_only'
  CHECK (trust_level IN ('token_only', 'identified', 'verified', 'admin'));

COMMENT ON COLUMN public.confirmation_portal_responses.trust_level IS
  'Nivel de confianca sob o qual a resposta foi coletada. token_only=anonimo com posse do link; identified=login Google sem vinculo de perfil; verified=login Google com profile.publisher_id casando; admin=login com role admin.';

CREATE OR REPLACE FUNCTION public.submit_confirmation_portal_response(
  p_part_id text, p_publisher_id text, p_token text, p_accept boolean, p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_part_uuid uuid;
    v_profile profiles%ROWTYPE;
    v_part workbook_parts%ROWTYPE;
    v_token confirmation_portal_tokens%ROWTYPE;
    v_existing_response confirmation_portal_responses%ROWTYPE;
    v_trust_level text;
    v_actor_email text;
    v_response text;
    v_part_status text;
    v_log_details text;
    v_enhanced_reason text;
    v_author_label text;
    v_summary text;
    v_severity text;
BEGIN
    BEGIN
        v_part_uuid := nullif(trim(p_part_id), '')::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RETURN jsonb_build_object('success', false, 'error', 'invalid_assignment_identifier');
    END;

    SELECT * INTO v_token FROM confirmation_portal_tokens
     WHERE part_id = p_part_id AND publisher_id = p_publisher_id
       AND token::text = trim(p_token)
       AND expires_at > now()
       AND used_at IS NULL
     ORDER BY created_at DESC LIMIT 1;

    IF NOT FOUND THEN
        SELECT r.* INTO v_existing_response
        FROM confirmation_portal_responses r
        JOIN confirmation_portal_tokens t ON t.id = r.token_id
        WHERE t.part_id = p_part_id AND t.publisher_id = p_publisher_id
          AND t.token::text = trim(p_token)
        ORDER BY r.created_at DESC LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'already_processed', true,
                'response_status', v_existing_response.response,
                'part_status', v_existing_response.part_status_after,
                'trust_level', v_existing_response.trust_level,
                'authenticated_email', v_existing_response.authenticated_email);
        END IF;

        RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired_token');
    END IF;

    IF auth.uid() IS NULL THEN
        v_trust_level := 'token_only';
    ELSE
        SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
        IF v_profile.role = 'admin' THEN
            v_trust_level := 'admin';
        ELSIF v_profile.publisher_id IS NOT NULL
          AND btrim(v_profile.publisher_id) = btrim(p_publisher_id) THEN
            v_trust_level := 'verified';
        ELSE
            v_trust_level := 'identified';
        END IF;
    END IF;

    v_actor_email := v_profile.email;

    SELECT * INTO v_part FROM workbook_parts WHERE id = v_part_uuid LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'assignment_not_found');
    END IF;

    v_author_label := format('Publicador (portal): %s',
        COALESCE(v_part.resolved_publisher_name, v_part.raw_publisher_name,
                 COALESCE(v_actor_email, 'anonimo com token')));

    IF p_accept THEN
        UPDATE workbook_parts
           SET status = 'DESIGNADA',
               rejected_reason = NULL,
               status_changed_at = now(),
               updated_at = now()
         WHERE id = v_part_uuid;
        v_response := 'confirmed';
        v_part_status := 'DESIGNADA';
        v_log_details := format('Confirmou participacao via portal [%s]. Conta: %s',
            v_trust_level, COALESCE(v_actor_email, 'sem-email'));
        v_severity := 'info';
        v_summary := format('%s confirmou participacao via portal.',
            COALESCE(v_part.resolved_publisher_name, v_part.raw_publisher_name, 'Publicador'));
    ELSE
        v_enhanced_reason := format('[%s] Recusado por %s: %s',
            to_char(now(), 'YYYY-MM-DD'),
            COALESCE(v_part.resolved_publisher_name, v_part.raw_publisher_name, 'Desconhecido'),
            COALESCE(nullif(trim(p_reason), ''), 'Motivo nao informado'));

        UPDATE workbook_parts
           SET status = 'PENDENTE',
               rejected_reason = v_enhanced_reason,
               resolved_publisher_id = NULL,
               resolved_publisher_name = NULL,
               approved_by_id = NULL,
               approved_at = NULL,
               completed_at = NULL,
               needs_reassignment = TRUE,
               reassignment_reason = 'refused_via_portal',
               reassignment_marked_at = now(),
               had_refusal = TRUE,
               status_changed_at = now(),
               updated_at = now()
         WHERE id = v_part_uuid;

        IF to_regclass('public.refusal_logs') IS NOT NULL THEN
            EXECUTE 'INSERT INTO refusal_logs (part_id, publisher_name, reason, week_id, tipo_parte) VALUES ($1,$2,$3,$4,$5)'
            USING v_part.id,
                  COALESCE(v_part.resolved_publisher_name, v_part.raw_publisher_name, ''),
                  COALESCE(nullif(trim(p_reason), ''), 'Motivo nao informado'),
                  v_part.week_id, v_part.tipo_parte;
        END IF;

        v_response := 'refused';
        v_part_status := 'PENDENTE';
        v_log_details := format('Recusou participacao via portal [%s]. Conta: %s. Motivo: %s',
            v_trust_level, COALESCE(v_actor_email, 'sem-email'),
            COALESCE(nullif(trim(p_reason), ''), 'Motivo nao informado'));
        v_severity := 'critical';
        v_summary := format('%s RECUSOU designacao via portal - motivo: %s',
            COALESCE(v_part.resolved_publisher_name, v_part.raw_publisher_name, 'Publicador'),
            COALESCE(nullif(trim(p_reason), ''), 'sem motivo'));
    END IF;

    INSERT INTO confirmation_portal_responses
        (token_id, part_id, publisher_id, profile_id, authenticated_email,
         response, response_reason, part_status_after, trust_level)
    VALUES (v_token.id, v_part.id, p_publisher_id, auth.uid(), v_actor_email, v_response,
        CASE WHEN p_accept THEN NULL ELSE COALESCE(nullif(trim(p_reason), ''), 'Motivo nao informado') END,
        v_part_status, v_trust_level);

    UPDATE confirmation_portal_tokens
       SET used_at = COALESCE(used_at, now()),
           used_by_profile_id = COALESCE(used_by_profile_id, auth.uid())
     WHERE id = v_token.id;

    INSERT INTO public.confirmation_change_notifications
        (part_id, publisher_id, publisher_name, severity, summary, response, reason,
         affected_part_ids, affected_part_count, source, author_label, author_email)
    VALUES
        (v_part.id::text, p_publisher_id,
         COALESCE(v_part.resolved_publisher_name, v_part.raw_publisher_name),
         v_severity, v_summary, v_response,
         CASE WHEN p_accept THEN NULL ELSE COALESCE(nullif(trim(p_reason), ''), 'Motivo nao informado') END,
         CASE WHEN p_accept THEN ARRAY[]::uuid[] ELSE ARRAY[v_part.id]::uuid[] END,
         CASE WHEN p_accept THEN 0 ELSE 1 END,
         'confirmation_portal', v_author_label, v_actor_email);

    IF to_regclass('public.activity_logs') IS NOT NULL THEN
        EXECUTE 'INSERT INTO activity_logs (type, part_id, publisher_name, details, status) VALUES ($1,$2,$3,$4,$5)'
        USING CASE WHEN p_accept THEN 'CONFIRMATION' ELSE 'REFUSAL' END,
              v_part.id,
              COALESCE(v_part.resolved_publisher_name, v_part.raw_publisher_name, ''),
              v_log_details, v_part_status;
    END IF;

    IF to_regclass('public.transaction_logs') IS NOT NULL THEN
        EXECUTE 'INSERT INTO transaction_logs (profile_id, email, action, entity_type, entity_id, description, old_data, new_data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)'
        USING auth.uid(), v_actor_email,
              CASE WHEN p_accept THEN 'portal_confirmation_accept' ELSE 'portal_confirmation_refuse' END,
              'workbook_part', v_part.id::text, v_log_details,
              jsonb_build_object('status', v_part.status,
                  'resolved_publisher_id', v_part.resolved_publisher_id,
                  'resolved_publisher_name', v_part.resolved_publisher_name),
              jsonb_build_object('status', v_part_status,
                  'authenticated_email', v_actor_email,
                  'publisher_id', p_publisher_id,
                  'token', trim(p_token),
                  'response', v_response,
                  'trust_level', v_trust_level,
                  'reason', CASE WHEN p_accept THEN NULL ELSE COALESCE(nullif(trim(p_reason), ''), 'Motivo nao informado') END);
    END IF;

    RETURN jsonb_build_object('success', true, 'already_processed', false,
        'response_status', v_response, 'part_status', v_part_status,
        'trust_level', v_trust_level,
        'authenticated_email', v_actor_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_confirmation_portal_response(text, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_confirmation_portal_response(text, text, text, boolean, text) TO anon;
