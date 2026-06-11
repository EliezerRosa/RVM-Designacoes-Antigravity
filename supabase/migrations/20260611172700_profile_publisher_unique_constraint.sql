CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_publisher_id ON profiles(publisher_id) WHERE publisher_id IS NOT NULL;

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
    v_already_linked_to uuid;
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

    -- NOVO: Bloqueio duro. Verifica se o publicador já pertence a outro e-mail
    SELECT id INTO v_already_linked_to FROM profiles WHERE publisher_id = p_publisher_id AND id <> p_profile_id LIMIT 1;
    IF v_already_linked_to IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'publisher_already_linked');
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
