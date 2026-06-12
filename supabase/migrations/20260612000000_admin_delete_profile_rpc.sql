-- RPC admin_delete_profile: exclusão de registro de acesso (profiles) pelo painel
-- "Vínculos de Perfil" (ProfileLinksPanel). Substitui o DELETE direto do front,
-- que era no-op silencioso porque profiles tem RLS habilitado e NENHUMA policy
-- de DELETE para a role authenticated.
--
-- Padrão idêntico a admin_unlink_profile: SECURITY DEFINER + admin_assert_admin().
-- FKs -> profiles.id já tratam a cascata (CASCADE: auth_requests,
-- user_permission_overrides; SET NULL: auth_logs, transaction_logs,
-- confirmation_portal_*, publisher_form_tokens). Não toca em publishers nem auth.users.

CREATE OR REPLACE FUNCTION public.admin_delete_profile(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role text;
BEGIN
    PERFORM admin_assert_admin();

    -- Não permitir excluir o próprio registro do admin logado.
    IF p_profile_id = auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'error', 'cannot_delete_self');
    END IF;

    SELECT role INTO v_role FROM profiles WHERE id = p_profile_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
    END IF;

    -- Defensivo: não excluir perfis admin por esta via (UI já oculta o botão).
    IF v_role = 'admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'cannot_delete_admin');
    END IF;

    DELETE FROM profiles WHERE id = p_profile_id;

    RETURN jsonb_build_object('success', true, 'profile_id', p_profile_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_delete_profile(uuid) TO authenticated;
