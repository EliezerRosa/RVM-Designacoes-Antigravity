-- ============================================================
-- RPC to get Auth Health Stats for Admin Dashboard
-- ============================================================

CREATE OR REPLACE FUNCTION admin_get_auth_health_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_logins_24h int;
  v_failures_2fa_24h int;
  v_unsupported_webauthn_24h int;
  v_pending_challenges int;
BEGIN
  PERFORM admin_assert_admin();

  SELECT COUNT(*) INTO v_logins_24h
  FROM auth_logs
  WHERE event_type IN ('login', 'device_biometric_login')
    AND created_at >= NOW() - INTERVAL '24 hours';

  SELECT COUNT(*) INTO v_failures_2fa_24h
  FROM auth_logs
  WHERE event_type = '2fa_failed'
    AND created_at >= NOW() - INTERVAL '24 hours';

  SELECT COUNT(*) INTO v_unsupported_webauthn_24h
  FROM auth_logs
  WHERE event_type = 'webauthn_unsupported'
    AND created_at >= NOW() - INTERVAL '24 hours';

  SELECT COUNT(*) INTO v_pending_challenges
  FROM webauthn_challenges
  WHERE expires_at > NOW();

  RETURN json_build_object(
    'logins_24h', v_logins_24h,
    'failures_2fa_24h', v_failures_2fa_24h,
    'unsupported_webauthn_24h', v_unsupported_webauthn_24h,
    'pending_challenges', v_pending_challenges
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_auth_health_stats() TO authenticated;

NOTIFY pgrst, 'reload schema';
