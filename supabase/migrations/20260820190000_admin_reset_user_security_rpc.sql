-- =========================================================================================
-- MIGRATION: 20260820190000_admin_reset_user_security_rpc.sql
-- DESCRIPTION: Cria a RPC admin_reset_user_security para permitir que administradores
-- resetem completamente as credenciais de segurança de um usuário:
-- - Desvincula WhatsApp (whatsapp_verified = false)
-- - Exclui todos os auth_requests pendentes
-- - Exclui todas as chaves WebAuthn/Passkeys registradas
-- - Exclui todos os challenges WebAuthn pendentes
--
-- Uso: Dispositivo perdido, conta comprometida, ou necessidade de re-verificação.
-- =========================================================================================

CREATE OR REPLACE FUNCTION admin_reset_user_security(target_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_email text;
    v_webauthn_count integer;
    v_auth_req_count integer;
BEGIN
    -- Apenas admin pode executar
    IF NOT is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_admin');
    END IF;

    -- Não permitir que o admin resete a si mesmo (proteção contra lock-out)
    IF target_user_id = auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'error', 'cannot_reset_self');
    END IF;

    -- Verificar se o perfil existe
    SELECT email INTO v_target_email
    FROM profiles
    WHERE id = target_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
    END IF;

    -- 1. Desvincular WhatsApp
    UPDATE profiles
    SET whatsapp_verified = false,
        updated_at = now()
    WHERE id = target_user_id;

    -- 2. Expirar/deletar auth_requests pendentes
    SELECT count(*) INTO v_auth_req_count
    FROM auth_requests
    WHERE profile_id = target_user_id;

    DELETE FROM auth_requests
    WHERE profile_id = target_user_id;

    -- 3. Deletar credenciais WebAuthn (Passkeys registradas)
    SELECT count(*) INTO v_webauthn_count
    FROM webauthn_credentials
    WHERE profile_id = target_user_id;

    DELETE FROM webauthn_credentials
    WHERE profile_id = target_user_id;

    -- 4. Deletar challenges WebAuthn pendentes
    DELETE FROM webauthn_challenges
    WHERE profile_id = target_user_id;

    -- Log da ação
    INSERT INTO auth_logs (profile_id, email, event_type, metadata)
    VALUES (
        auth.uid(),
        (SELECT email FROM profiles WHERE id = auth.uid()),
        'admin_security_reset',
        jsonb_build_object(
            'target_user_id', target_user_id,
            'target_email', v_target_email,
            'webauthn_keys_removed', v_webauthn_count,
            'auth_requests_removed', v_auth_req_count
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'target_email', v_target_email,
        'webauthn_keys_removed', v_webauthn_count,
        'auth_requests_removed', v_auth_req_count
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reset_user_security(UUID) TO authenticated;

-- Adicionar 'admin_security_reset' ao constraint de event_type do auth_logs
ALTER TABLE auth_logs DROP CONSTRAINT IF EXISTS auth_logs_event_type_check;
ALTER TABLE auth_logs ADD CONSTRAINT auth_logs_event_type_check
    CHECK (event_type IN (
        'login', 'logout',
        '2fa_request', '2fa_verified', '2fa_failed',
        'device_biometric_login', 'device_biometric_registered',
        'webauthn_unsupported', 'rate_limited',
        'admin_security_reset'
    ));
