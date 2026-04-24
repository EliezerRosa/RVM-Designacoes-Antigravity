-- 2026-04-24 — Vinculação publicador↔conta Google por e-mail
--
-- Estende sync_profile_publisher_link() para:
--   1. Tentar match por e-mail (publishers.data->>'email' = profile.email, case-insensitive)
--   2. Se não, manter o match por nome/aliases (comportamento anterior)
--   3. Quando o vínculo é criado (por qualquer caminho), gravar de volta
--      profile.email em publishers.data->>'email' caso ainda esteja vazio,
--      para que próximos logins entrem direto pelo caminho mais rápido (email).

CREATE OR REPLACE FUNCTION sync_profile_publisher_link()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile profiles%ROWTYPE;
    v_candidate_name text;
    v_candidate_email text;
    v_match_count integer;
    v_publisher_id text;
    v_match_reason text;
    v_existing_pub_email text;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    SELECT *
    INTO v_profile
    FROM profiles
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
    END IF;

    IF v_profile.role = 'admin' THEN
        RETURN jsonb_build_object('success', true, 'publisher_id', v_profile.publisher_id, 'matched', false, 'reason', 'admin');
    END IF;

    -- Caso já vinculado, ainda assim grava o e-mail no publisher se faltar.
    IF v_profile.publisher_id IS NOT NULL THEN
        SELECT lower(coalesce(data->>'email', ''))
        INTO v_existing_pub_email
        FROM publishers
        WHERE id = v_profile.publisher_id;

        IF (v_existing_pub_email IS NULL OR v_existing_pub_email = '')
            AND v_profile.email IS NOT NULL AND v_profile.email <> '' THEN
            UPDATE publishers
            SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{email}', to_jsonb(lower(v_profile.email)), true)
            WHERE id = v_profile.publisher_id;
        END IF;

        RETURN jsonb_build_object('success', true, 'publisher_id', v_profile.publisher_id, 'matched', true, 'reason', 'already_linked');
    END IF;

    v_candidate_email := lower(trim(coalesce(v_profile.email, '')));
    v_candidate_name  := normalize_identity_text(v_profile.full_name);
    v_match_reason    := NULL;

    -- 1) Match por e-mail (mais confiável)
    IF v_candidate_email <> '' THEN
        WITH email_matches AS (
            SELECT id
            FROM publishers
            WHERE lower(coalesce(data->>'email', '')) = v_candidate_email
        )
        SELECT count(*), min(id)
        INTO v_match_count, v_publisher_id
        FROM email_matches;

        IF v_match_count = 1 AND v_publisher_id IS NOT NULL THEN
            v_match_reason := 'linked_by_email';
        ELSIF v_match_count > 1 THEN
            RETURN jsonb_build_object(
                'success', true, 'publisher_id', null, 'matched', false,
                'reason', 'ambiguous_email_match'
            );
        END IF;
    END IF;

    -- 2) Fallback: match por nome/aliases
    IF v_match_reason IS NULL THEN
        IF v_candidate_name = '' THEN
            RETURN jsonb_build_object('success', true, 'publisher_id', null, 'matched', false, 'reason', 'missing_full_name');
        END IF;

        WITH possible_matches AS (
            SELECT p.id
            FROM publishers p
            WHERE normalize_identity_text(p.data->>'name') = v_candidate_name
               OR EXISTS (
                   SELECT 1
                   FROM jsonb_array_elements_text(coalesce(p.data->'aliases', '[]'::jsonb)) AS alias(value)
                   WHERE normalize_identity_text(alias.value) = v_candidate_name
               )
        )
        SELECT count(*), min(id)
        INTO v_match_count, v_publisher_id
        FROM possible_matches;

        IF v_match_count = 1 AND v_publisher_id IS NOT NULL THEN
            v_match_reason := 'linked_by_name';
        ELSIF v_match_count > 1 THEN
            RETURN jsonb_build_object(
                'success', true, 'publisher_id', null, 'matched', false,
                'reason', 'ambiguous_match'
            );
        ELSE
            RETURN jsonb_build_object(
                'success', true, 'publisher_id', null, 'matched', false,
                'reason', 'no_match'
            );
        END IF;
    END IF;

    -- Aplica o vínculo
    UPDATE profiles
    SET publisher_id = v_publisher_id,
        updated_at = now()
    WHERE id = auth.uid();

    -- Persistir o e-mail no publicador (se ainda vazio) para futuros logins
    IF v_candidate_email <> '' THEN
        SELECT lower(coalesce(data->>'email', ''))
        INTO v_existing_pub_email
        FROM publishers
        WHERE id = v_publisher_id;

        IF v_existing_pub_email IS NULL OR v_existing_pub_email = '' THEN
            UPDATE publishers
            SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{email}', to_jsonb(v_candidate_email), true)
            WHERE id = v_publisher_id;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'publisher_id', v_publisher_id, 'matched', true, 'reason', v_match_reason);
END;
$$;

GRANT EXECUTE ON FUNCTION sync_profile_publisher_link() TO authenticated;

NOTIFY pgrst, 'reload schema';
