-- Record and process confirmation portal responses atomically per token.

CREATE TABLE IF NOT EXISTS confirmation_portal_responses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id uuid NOT NULL UNIQUE REFERENCES confirmation_portal_tokens(id) ON DELETE CASCADE,
    part_id text NOT NULL,
    publisher_id text NOT NULL,
    profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    authenticated_email text,
    response text NOT NULL CHECK (response IN ('confirmed', 'refused')),
    response_reason text,
    part_status_after text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_confirmation_portal_responses_part
    ON confirmation_portal_responses(part_id, publisher_id, created_at DESC);

ALTER TABLE confirmation_portal_responses ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION authorize_confirmation_portal(p_part_id text, p_publisher_id text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile profiles%ROWTYPE;
    v_link_result jsonb;
    v_token confirmation_portal_tokens%ROWTYPE;
    v_response confirmation_portal_responses%ROWTYPE;
    v_assigned_publisher_name text;
    v_is_authorized boolean := false;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'not_authenticated');
    END IF;

    v_link_result := sync_profile_publisher_link();

    SELECT *
    INTO v_profile
    FROM profiles
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'profile_not_found');
    END IF;

    SELECT *
    INTO v_token
    FROM confirmation_portal_tokens
    WHERE part_id = p_part_id
      AND publisher_id = p_publisher_id
      AND token::text = trim(p_token)
      AND expires_at > now()
      AND (used_at IS NULL OR used_by_profile_id = auth.uid())
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'invalid_or_expired_token');
    END IF;

    IF NOT confirmation_assignment_matches_publisher(p_part_id, p_publisher_id) THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'assignment_mismatch');
    END IF;

    SELECT data->>'name'
    INTO v_assigned_publisher_name
    FROM publishers
    WHERE id = p_publisher_id
    LIMIT 1;

    SELECT *
    INTO v_response
    FROM confirmation_portal_responses
    WHERE token_id = v_token.id
    LIMIT 1;

    IF v_profile.role = 'admin' THEN
        RETURN jsonb_build_object(
            'authorized', true,
            'authenticated_email', v_profile.email,
            'assigned_publisher_name', v_assigned_publisher_name,
            'match_type', 'admin',
            'token_status', CASE WHEN v_token.used_at IS NULL THEN 'active' ELSE 'used' END,
            'response_status', v_response.response,
            'responded_at', v_response.created_at,
            'link_result', v_link_result
        );
    END IF;

    IF v_profile.publisher_id IS NOT NULL AND btrim(v_profile.publisher_id) = btrim(p_publisher_id) THEN
        v_is_authorized := true;
    END IF;

    RETURN jsonb_build_object(
        'authorized', v_is_authorized,
        'authenticated_email', v_profile.email,
        'assigned_publisher_name', v_assigned_publisher_name,
        'token_status', CASE WHEN v_token.used_at IS NULL THEN 'active' ELSE 'used' END,
        'response_status', v_response.response,
        'responded_at', v_response.created_at,
        'link_result', v_link_result,
        'reason', CASE WHEN v_is_authorized THEN NULL ELSE 'email_not_linked_to_assignee' END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION authorize_confirmation_portal(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION submit_confirmation_portal_response(
    p_part_id text,
    p_publisher_id text,
    p_token text,
    p_accept boolean,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth_result jsonb;
    v_authorized boolean;
    v_profile profiles%ROWTYPE;
    v_part workbook_parts%ROWTYPE;
    v_token confirmation_portal_tokens%ROWTYPE;
    v_existing_response confirmation_portal_responses%ROWTYPE;
    v_response text;
    v_part_status text;
    v_log_details text;
    v_enhanced_reason text;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    v_auth_result := authorize_confirmation_portal(p_part_id, p_publisher_id, p_token);
    v_authorized := COALESCE((v_auth_result->>'authorized')::boolean, false);

    IF NOT v_authorized THEN
        RETURN jsonb_build_object('success', false, 'error', COALESCE(v_auth_result->>'reason', 'not_authorized'));
    END IF;

    SELECT *
    INTO v_profile
    FROM profiles
    WHERE id = auth.uid();

    SELECT *
    INTO v_token
    FROM confirmation_portal_tokens
    WHERE part_id = p_part_id
      AND publisher_id = p_publisher_id
      AND token::text = trim(p_token)
      AND expires_at > now()
      AND (used_at IS NULL OR used_by_profile_id = auth.uid())
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired_token');
    END IF;

    SELECT *
    INTO v_existing_response
    FROM confirmation_portal_responses
    WHERE token_id = v_token.id
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_processed', true,
            'response_status', v_existing_response.response,
            'part_status', v_existing_response.part_status_after,
            'authenticated_email', v_existing_response.authenticated_email
        );
    END IF;

    SELECT *
    INTO v_part
    FROM workbook_parts
    WHERE id = p_part_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'assignment_not_found');
    END IF;

    IF p_accept THEN
        UPDATE workbook_parts
        SET status = 'DESIGNADA',
            rejected_reason = NULL,
            updated_at = now()
        WHERE id = p_part_id;

        v_response := 'confirmed';
        v_part_status := 'DESIGNADA';
        v_log_details := format('Confirmou participação via portal. Conta: %s', COALESCE(v_profile.email, 'sem-email'));
    ELSE
        v_enhanced_reason := format('[%s] Recusado por %s: %s', to_char(now(), 'YYYY-MM-DD'), COALESCE(v_part.resolved_publisher_name, v_part.raw_publisher_name, 'Desconhecido'), COALESCE(nullif(trim(p_reason), ''), 'Motivo não informado'));

        UPDATE workbook_parts
        SET status = 'PENDENTE',
            rejected_reason = v_enhanced_reason,
            resolved_publisher_id = NULL,
            resolved_publisher_name = NULL,
            approved_by_id = NULL,
            approved_at = NULL,
            completed_at = NULL,
            updated_at = now()
        WHERE id = p_part_id;

        IF to_regclass('public.refusal_logs') IS NOT NULL THEN
            EXECUTE $sql$
                INSERT INTO refusal_logs (part_id, publisher_name, reason, week_id, tipo_parte)
                VALUES ($1, $2, $3, $4, $5)
            $sql$
            USING p_part_id,
                  COALESCE(v_part.resolved_publisher_name, v_part.raw_publisher_name, ''),
                  COALESCE(nullif(trim(p_reason), ''), 'Motivo não informado'),
                  v_part.week_id,
                  v_part.tipo_parte;
        END IF;

        v_response := 'refused';
        v_part_status := 'PENDENTE';
        v_log_details := format('Recusou participação via portal. Conta: %s. Motivo: %s', COALESCE(v_profile.email, 'sem-email'), COALESCE(nullif(trim(p_reason), ''), 'Motivo não informado'));
    END IF;

    INSERT INTO confirmation_portal_responses (
        token_id,
        part_id,
        publisher_id,
        profile_id,
        authenticated_email,
        response,
        response_reason,
        part_status_after
    ) VALUES (
        v_token.id,
        p_part_id,
        p_publisher_id,
        auth.uid(),
        v_profile.email,
        v_response,
        CASE WHEN p_accept THEN NULL ELSE COALESCE(nullif(trim(p_reason), ''), 'Motivo não informado') END,
        v_part_status
    );

    UPDATE confirmation_portal_tokens
    SET used_at = COALESCE(used_at, now()),
        used_by_profile_id = COALESCE(used_by_profile_id, auth.uid())
    WHERE id = v_token.id;

    IF to_regclass('public.activity_logs') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO activity_logs (type, part_id, publisher_name, details, status)
            VALUES ($1, $2, $3, $4, $5)
        $sql$
        USING CASE WHEN p_accept THEN 'CONFIRMATION' ELSE 'REFUSAL' END,
              p_part_id,
              COALESCE(v_part.resolved_publisher_name, v_part.raw_publisher_name, ''),
              v_log_details,
              v_part_status;
    END IF;

    INSERT INTO transaction_logs (
        profile_id,
        email,
        action,
        entity_type,
        entity_id,
        description,
        old_data,
        new_data
    ) VALUES (
        auth.uid(),
        v_profile.email,
        CASE WHEN p_accept THEN 'portal_confirmation_accept' ELSE 'portal_confirmation_refuse' END,
        'workbook_part',
        p_part_id,
        v_log_details,
        jsonb_build_object(
            'status', v_part.status,
            'resolved_publisher_id', v_part.resolved_publisher_id,
            'resolved_publisher_name', v_part.resolved_publisher_name
        ),
        jsonb_build_object(
            'status', v_part_status,
            'authenticated_email', v_profile.email,
            'publisher_id', p_publisher_id,
            'token', trim(p_token),
            'response', v_response
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'already_processed', false,
        'response_status', v_response,
        'part_status', v_part_status,
        'authenticated_email', v_profile.email
    );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_confirmation_portal_response(text, text, text, boolean, text) TO authenticated;
