-- Harden portal authorization and 2FA verification flows.

CREATE OR REPLACE FUNCTION create_whatsapp_auth_request(p_phone text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    IF COALESCE(length(trim(p_phone)), 0) < 10 OR COALESCE(length(trim(p_code)), 0) <> 6 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
    END IF;

    UPDATE auth_requests
    SET status = 'expired'
    WHERE profile_id = auth.uid()
      AND status = 'pending';

    INSERT INTO auth_requests (profile_id, phone, code, status)
    VALUES (auth.uid(), trim(p_phone), trim(p_code), 'pending');

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION create_whatsapp_auth_request(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION verify_whatsapp_auth_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request auth_requests%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    UPDATE auth_requests
    SET status = 'expired'
    WHERE profile_id = auth.uid()
      AND status = 'pending'
      AND expires_at <= now();

    SELECT *
    INTO v_request
    FROM auth_requests
    WHERE profile_id = auth.uid()
      AND code = trim(p_code)
      AND status = 'pending'
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired');
    END IF;

    UPDATE auth_requests
    SET status = 'verified'
    WHERE id = v_request.id
      AND profile_id = auth.uid()
      AND status = 'pending'
      AND expires_at > now();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired');
    END IF;

    UPDATE profiles
    SET whatsapp_verified = true,
        phone = v_request.phone,
        updated_at = now()
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'profile_not_found';
    END IF;

    UPDATE auth_requests
    SET status = 'expired'
    WHERE profile_id = auth.uid()
      AND status = 'pending'
      AND id <> v_request.id;

    RETURN jsonb_build_object('success', true, 'phone', v_request.phone);
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION verify_whatsapp_auth_code(text) TO authenticated;

CREATE OR REPLACE FUNCTION authorize_confirmation_portal(p_part_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile profiles%ROWTYPE;
    v_current_publisher_name text;
    v_resolved_publisher_id text;
    v_resolved_publisher_name text;
    v_raw_publisher_name text;
    v_assigned_publisher_name text;
    v_is_authorized boolean := false;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'not_authenticated');
    END IF;

    SELECT *
    INTO v_profile
    FROM profiles
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'profile_not_found');
    END IF;

    SELECT resolved_publisher_id, resolved_publisher_name, raw_publisher_name
    INTO v_resolved_publisher_id, v_resolved_publisher_name, v_raw_publisher_name
    FROM workbook_parts
    WHERE id = p_part_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'assignment_not_found');
    END IF;

    v_assigned_publisher_name := COALESCE(v_resolved_publisher_name, v_raw_publisher_name);

    IF v_profile.role = 'admin' THEN
        RETURN jsonb_build_object(
            'authorized', true,
            'authenticated_email', v_profile.email,
            'assigned_publisher_name', v_assigned_publisher_name,
            'match_type', 'admin'
        );
    END IF;

    IF v_profile.publisher_id IS NOT NULL THEN
        IF v_resolved_publisher_id IS NOT NULL AND btrim(v_profile.publisher_id) = btrim(v_resolved_publisher_id) THEN
            v_is_authorized := true;
        ELSE
            SELECT data->>'name'
            INTO v_current_publisher_name
            FROM publishers
            WHERE id = v_profile.publisher_id
            LIMIT 1;

            IF v_current_publisher_name IS NOT NULL
               AND v_assigned_publisher_name IS NOT NULL
               AND lower(btrim(v_current_publisher_name)) = lower(btrim(v_assigned_publisher_name)) THEN
                v_is_authorized := true;
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'authorized', v_is_authorized,
        'authenticated_email', v_profile.email,
        'assigned_publisher_name', v_assigned_publisher_name,
        'reason', CASE WHEN v_is_authorized THEN NULL ELSE 'email_not_linked_to_assignee' END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION authorize_confirmation_portal(text) TO authenticated;