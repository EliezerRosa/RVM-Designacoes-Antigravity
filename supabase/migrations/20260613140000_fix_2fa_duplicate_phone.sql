-- Fix duplicate phone issue in 2FA

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

    -- Pre-validate if phone is already in use by another profile to save Z-API costs and prevent generic error later
    IF EXISTS (SELECT 1 FROM profiles WHERE phone = trim(p_phone) AND id <> auth.uid()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'phone_already_in_use');
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

    -- Check for constraint violation before UPDATE to return friendly error (race condition defense)
    IF EXISTS (SELECT 1 FROM profiles WHERE phone = v_request.phone AND id <> auth.uid()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'phone_already_in_use');
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
