-- ============================================================
-- Phase 2 Security Hardening: Auth System (Validar registro biométrico no servidor)
-- ============================================================

CREATE OR REPLACE FUNCTION has_webauthn_credential(p_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exists boolean;
BEGIN
    -- [SECURITY] Só permite consultar o próprio perfil, ou admins podem consultar qualquer um.
    -- Para simplificar, na ForceBiometricModal, o usuário consulta a si mesmo.
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    IF auth.uid() != p_profile_id THEN
        -- Verifica se é admin
        IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
            RETURN false;
        END IF;
    END IF;

    SELECT exists(
        SELECT 1 FROM webauthn_credentials WHERE profile_id = p_profile_id
    ) INTO v_exists;
    
    RETURN v_exists;
END;
$$;

GRANT EXECUTE ON FUNCTION has_webauthn_credential(uuid) TO authenticated;
