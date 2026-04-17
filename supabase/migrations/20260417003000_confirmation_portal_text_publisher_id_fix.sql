CREATE OR REPLACE FUNCTION confirmation_assignment_matches_publisher(p_part_id text, p_publisher_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_part_uuid uuid;
    v_resolved_publisher_id text;
    v_resolved_publisher_name text;
    v_raw_publisher_name text;
    v_publisher_name text;
BEGIN
    BEGIN
        v_part_uuid := nullif(trim(p_part_id), '')::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RETURN false;
    END;

    SELECT resolved_publisher_id, resolved_publisher_name, raw_publisher_name
    INTO v_resolved_publisher_id, v_resolved_publisher_name, v_raw_publisher_name
    FROM workbook_parts
    WHERE id = v_part_uuid
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    IF v_resolved_publisher_id IS NOT NULL AND btrim(v_resolved_publisher_id) = btrim(p_publisher_id) THEN
        RETURN true;
    END IF;

    SELECT data->>'name'
    INTO v_publisher_name
    FROM publishers
    WHERE btrim(id::text) = btrim(p_publisher_id)
    LIMIT 1;

    IF v_publisher_name IS NULL THEN
        RETURN false;
    END IF;

    RETURN normalize_identity_text(v_publisher_name) = normalize_identity_text(COALESCE(v_resolved_publisher_name, v_raw_publisher_name));
END;
$$;

CREATE OR REPLACE FUNCTION authorize_confirmation_portal(p_part_id text, p_publisher_id text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_part_uuid uuid;
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

    BEGIN
        v_part_uuid := nullif(trim(p_part_id), '')::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RETURN jsonb_build_object('authorized', false, 'reason', 'invalid_assignment_identifier');
    END;

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
    WHERE btrim(id::text) = btrim(p_publisher_id)
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