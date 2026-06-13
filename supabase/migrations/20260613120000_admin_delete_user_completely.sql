-- ============================================================
-- Complete User Deletion RPC
-- Provides a way for admins to securely delete a user from auth.users
-- which cascades down to profiles and related data.
-- ============================================================

CREATE OR REPLACE FUNCTION admin_delete_user_completely(p_profile_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    -- 1. Check if the caller is an admin
    SELECT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() AND role = 'admin'
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Acesso negado: apenas administradores podem excluir contas permanentemente.'
        );
    END IF;

    -- 2. Prevent self-deletion if necessary (optional safeguard)
    IF p_profile_id = auth.uid() THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Não é possível excluir a própria conta de administrador.'
        );
    END IF;

    -- 3. Delete from auth.users
    -- This requires SECURITY DEFINER so the function runs with elevated privileges 
    -- (the owner of the function, typically postgres, who has access to auth schema)
    DELETE FROM auth.users WHERE id = p_profile_id;

    -- The ON DELETE CASCADE on profiles.id will automatically delete the profile record.
    
    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;
