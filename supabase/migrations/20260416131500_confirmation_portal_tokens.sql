-- Secure confirmation portal links with unique tokens bound to part and publisher.

CREATE TABLE IF NOT EXISTS confirmation_portal_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    part_id text NOT NULL,
    publisher_id text NOT NULL,
    token uuid NOT NULL DEFAULT gen_random_uuid(),
    created_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    used_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '21 days'),
    used_at timestamptz,
    UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_confirmation_portal_tokens_lookup
    ON confirmation_portal_tokens(part_id, publisher_id, expires_at DESC);

ALTER TABLE confirmation_portal_tokens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION confirmation_assignment_matches_publisher(p_part_id text, p_publisher_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resolved_publisher_id text;
    v_resolved_publisher_name text;
    v_raw_publisher_name text;
    v_publisher_name text;
BEGIN
    SELECT resolved_publisher_id, resolved_publisher_name, raw_publisher_name
    INTO v_resolved_publisher_id, v_resolved_publisher_name, v_raw_publisher_name
    FROM workbook_parts
    WHERE id = p_part_id
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
    WHERE id = p_publisher_id
    LIMIT 1;

    IF v_publisher_name IS NULL THEN
        RETURN false;
    END IF;

    RETURN normalize_identity_text(v_publisher_name) = normalize_identity_text(COALESCE(v_resolved_publisher_name, v_raw_publisher_name));
END;
$$;

GRANT EXECUTE ON FUNCTION confirmation_assignment_matches_publisher(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION create_confirmation_portal_token(p_part_id text, p_publisher_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing confirmation_portal_tokens%ROWTYPE;
    v_created confirmation_portal_tokens%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    IF NOT confirmation_assignment_matches_publisher(p_part_id, p_publisher_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'assignment_mismatch');
    END IF;

    SELECT *
    INTO v_existing
    FROM confirmation_portal_tokens
    WHERE part_id = p_part_id
      AND publisher_id = p_publisher_id
      AND used_at IS NULL
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'token', v_existing.token,
            'expires_at', v_existing.expires_at
        );
    END IF;

    INSERT INTO confirmation_portal_tokens (part_id, publisher_id, created_by_profile_id)
    VALUES (p_part_id, p_publisher_id, auth.uid())
    RETURNING * INTO v_created;

    RETURN jsonb_build_object(
        'success', true,
        'token', v_created.token,
        'expires_at', v_created.expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION create_confirmation_portal_token(text, text) TO authenticated;

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

    IF v_profile.role = 'admin' THEN
        RETURN jsonb_build_object(
            'authorized', true,
            'authenticated_email', v_profile.email,
            'assigned_publisher_name', v_assigned_publisher_name,
            'match_type', 'admin',
            'token_status', CASE WHEN v_token.used_at IS NULL THEN 'active' ELSE 'used' END,
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
        'link_result', v_link_result,
        'reason', CASE WHEN v_is_authorized THEN NULL ELSE 'email_not_linked_to_assignee' END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION authorize_confirmation_portal(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION consume_confirmation_portal_token(p_part_id text, p_publisher_id text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth_result jsonb;
    v_authorized boolean;
    v_existing_used_by uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    v_auth_result := authorize_confirmation_portal(p_part_id, p_publisher_id, p_token);
    v_authorized := COALESCE((v_auth_result->>'authorized')::boolean, false);

    IF NOT v_authorized THEN
        RETURN jsonb_build_object('success', false, 'error', COALESCE(v_auth_result->>'reason', 'not_authorized'));
    END IF;

    SELECT used_by_profile_id
    INTO v_existing_used_by
    FROM confirmation_portal_tokens
    WHERE part_id = p_part_id
      AND publisher_id = p_publisher_id
      AND token::text = trim(p_token)
    ORDER BY created_at DESC
    LIMIT 1;

    UPDATE confirmation_portal_tokens
    SET used_at = COALESCE(used_at, now()),
        used_by_profile_id = COALESCE(used_by_profile_id, auth.uid())
    WHERE part_id = p_part_id
      AND publisher_id = p_publisher_id
      AND token::text = trim(p_token)
      AND expires_at > now()
      AND (used_at IS NULL OR used_by_profile_id = auth.uid());

    IF NOT FOUND AND v_existing_used_by IS DISTINCT FROM auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'error', 'token_already_used');
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION consume_confirmation_portal_token(text, text, text) TO authenticated;