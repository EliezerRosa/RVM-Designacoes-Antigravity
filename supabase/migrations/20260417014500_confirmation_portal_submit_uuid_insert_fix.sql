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
    v_part_uuid uuid;
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

    BEGIN
        v_part_uuid := nullif(trim(p_part_id), '')::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RETURN jsonb_build_object('success', false, 'error', 'invalid_assignment_identifier');
    END;

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
    WHERE id = v_part_uuid
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'assignment_not_found');
    END IF;

    IF p_accept THEN
        UPDATE workbook_parts
        SET status = 'DESIGNADA',
            rejected_reason = NULL,
            updated_at = now()
        WHERE id = v_part_uuid;

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
        WHERE id = v_part_uuid;

        IF to_regclass('public.refusal_logs') IS NOT NULL THEN
            EXECUTE $sql$
                INSERT INTO refusal_logs (part_id, publisher_name, reason, week_id, tipo_parte)
                VALUES ($1, $2, $3, $4, $5)
            $sql$
            USING v_part.id,
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
        v_part.id,
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
              v_part.id,
              COALESCE(v_part.resolved_publisher_name, v_part.raw_publisher_name, ''),
              v_log_details,
              v_part_status;
    END IF;

    IF to_regclass('public.transaction_logs') IS NOT NULL THEN
        EXECUTE $sql$
            INSERT INTO transaction_logs (action, entity_type, entity_id, details)
            VALUES ($1, $2, $3, $4)
        $sql$
        USING CASE WHEN p_accept THEN 'confirmation_portal_confirmed' ELSE 'confirmation_portal_refused' END,
              'workbook_part',
              p_part_id,
              jsonb_build_object(
                  'publisher_id', p_publisher_id,
                  'authenticated_email', v_profile.email,
                  'response', v_response,
                  'reason', CASE WHEN p_accept THEN NULL ELSE COALESCE(nullif(trim(p_reason), ''), 'Motivo não informado') END
              );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_processed', false,
        'response_status', v_response,
        'part_status', v_part_status,
        'authenticated_email', v_profile.email
    );
END;
$$;