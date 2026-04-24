-- 2026-04-24 — Admin: vincular profile↔publisher manualmente
--
-- Funções SECURITY DEFINER que SÓ admins podem executar:
--   * admin_list_unlinked_profiles() — perfis 'publicador' ainda sem publisher_id
--   * admin_link_profile_to_publisher(p_profile_id, p_publisher_id) — força o vínculo
--   * admin_unlink_profile(p_profile_id) — desvincula
--   * admin_list_profile_links() — todos os perfis vinculados (com nome do publicador)

CREATE OR REPLACE FUNCTION admin_assert_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT role INTO v_role FROM profiles WHERE id = auth.uid();

    IF v_role IS NULL OR v_role <> 'admin' THEN
        RAISE EXCEPTION 'not_admin';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION admin_list_unlinked_profiles()
RETURNS TABLE (
    profile_id uuid,
    email text,
    full_name text,
    role text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM admin_assert_admin();

    RETURN QUERY
    SELECT p.id, p.email, p.full_name, p.role, p.created_at
    FROM profiles p
    WHERE p.role = 'publicador'
      AND p.publisher_id IS NULL
    ORDER BY p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION admin_list_profile_links()
RETURNS TABLE (
    profile_id uuid,
    email text,
    full_name text,
    role text,
    publisher_id text,
    publisher_name text,
    publisher_email text,
    whatsapp_verified boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM admin_assert_admin();

    RETURN QUERY
    SELECT
        p.id,
        p.email,
        p.full_name,
        p.role,
        p.publisher_id,
        pub.data->>'name' AS publisher_name,
        pub.data->>'email' AS publisher_email,
        coalesce(p.whatsapp_verified, false)
    FROM profiles p
    LEFT JOIN publishers pub ON pub.id = p.publisher_id
    ORDER BY (p.publisher_id IS NULL) DESC, p.email;
END;
$$;

CREATE OR REPLACE FUNCTION admin_link_profile_to_publisher(
    p_profile_id uuid,
    p_publisher_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile profiles%ROWTYPE;
    v_publisher_email text;
    v_publisher_exists boolean;
BEGIN
    PERFORM admin_assert_admin();

    SELECT * INTO v_profile FROM profiles WHERE id = p_profile_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
    END IF;

    SELECT EXISTS(SELECT 1 FROM publishers WHERE id = p_publisher_id) INTO v_publisher_exists;
    IF NOT v_publisher_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'publisher_not_found');
    END IF;

    UPDATE profiles
    SET publisher_id = p_publisher_id, updated_at = now()
    WHERE id = p_profile_id;

    -- Espelha o e-mail do profile no publisher se ainda vazio
    SELECT lower(coalesce(data->>'email', '')) INTO v_publisher_email
    FROM publishers WHERE id = p_publisher_id;

    IF (v_publisher_email IS NULL OR v_publisher_email = '')
        AND v_profile.email IS NOT NULL AND v_profile.email <> '' THEN
        UPDATE publishers
        SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{email}', to_jsonb(lower(v_profile.email)), true)
        WHERE id = p_publisher_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'publisher_id', p_publisher_id, 'profile_id', p_profile_id);
END;
$$;

CREATE OR REPLACE FUNCTION admin_unlink_profile(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM admin_assert_admin();

    UPDATE profiles
    SET publisher_id = NULL, updated_at = now()
    WHERE id = p_profile_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
    END IF;

    RETURN jsonb_build_object('success', true, 'profile_id', p_profile_id);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_assert_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_unlinked_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_profile_links() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_link_profile_to_publisher(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_unlink_profile(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
