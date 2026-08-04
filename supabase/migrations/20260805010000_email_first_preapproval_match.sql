-- 20260805010000_email_first_preapproval_match.sql
--
-- Corrige a ORDEM da cascata de auto-link em sync_profile_publisher_link():
--   Fase 0 — e-mail exato (só quando o publicador já tem e-mail cadastrado) — sinal
--            mais confiável, restaura o que existia em 20260424000000_link_publisher_by_email.sql
--            e havia se perdido em redefines posteriores (20260804120000 / 20260805000000).
--   Fase 1 — telefone exato normalizado (só quando o publicador já tem telefone cadastrado).
--   Fase 2 — fallback: nome fuzzy (substitui a igualdade estrita antiga).
--
-- Cada fase, ao vincular, também grava de volta o e-mail do profile no publisher
-- (se ainda vazio), para que o próximo login desse mesmo publicador entre direto
-- pelo caminho mais rápido (e-mail).

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
    v_phone_norm text;
    v_match_count integer;
    v_publisher_id text;
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

    IF v_profile.publisher_id IS NOT NULL THEN
        -- Backfill de e-mail no publicador já vinculado, se ainda faltar.
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

    -- Fase 0: e-mail exato, só contra publicadores que já têm e-mail cadastrado.
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
            UPDATE profiles
            SET publisher_id = v_publisher_id,
                updated_at = now()
            WHERE id = auth.uid();

            PERFORM consume_whatsapp_2fa_preapproval(v_publisher_id, auth.uid());

            RETURN jsonb_build_object('success', true, 'publisher_id', v_publisher_id, 'matched', true, 'reason', 'linked_by_email');
        END IF;

        IF v_match_count > 1 THEN
            RETURN jsonb_build_object('success', true, 'publisher_id', null, 'matched', false, 'reason', 'ambiguous_email');
        END IF;
    END IF;

    -- Fase 1: telefone exato normalizado, só contra publicadores que já têm telefone cadastrado.
    v_phone_norm := normalize_phone_text(v_profile.phone);

    IF v_phone_norm <> '' THEN
        WITH phone_matches AS (
            SELECT p.id
            FROM publishers p
            WHERE normalize_phone_text(coalesce(p.data->>'phone', p.data->>'contact_phone', '')) <> ''
              AND normalize_phone_text(coalesce(p.data->>'phone', p.data->>'contact_phone', '')) = v_phone_norm
        )
        SELECT count(*), min(id)
        INTO v_match_count, v_publisher_id
        FROM phone_matches;

        IF v_match_count = 1 AND v_publisher_id IS NOT NULL THEN
            UPDATE profiles
            SET publisher_id = v_publisher_id,
                updated_at = now()
            WHERE id = auth.uid();

            PERFORM consume_whatsapp_2fa_preapproval(v_publisher_id, auth.uid());

            IF v_candidate_email <> '' THEN
                SELECT lower(coalesce(data->>'email', '')) INTO v_existing_pub_email
                FROM publishers WHERE id = v_publisher_id;

                IF v_existing_pub_email IS NULL OR v_existing_pub_email = '' THEN
                    UPDATE publishers
                    SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{email}', to_jsonb(v_candidate_email), true)
                    WHERE id = v_publisher_id;
                END IF;
            END IF;

            RETURN jsonb_build_object('success', true, 'publisher_id', v_publisher_id, 'matched', true, 'reason', 'linked_by_phone');
        END IF;

        IF v_match_count > 1 THEN
            RETURN jsonb_build_object('success', true, 'publisher_id', null, 'matched', false, 'reason', 'ambiguous_phone');
        END IF;
    END IF;

    -- Fase 2: fallback por nome fuzzy.
    v_candidate_name := normalize_identity_text(v_profile.full_name);

    IF v_candidate_name = '' THEN
        RETURN jsonb_build_object('success', true, 'publisher_id', null, 'matched', false, 'reason', 'missing_full_name');
    END IF;

    WITH possible_matches AS (
        SELECT p.id
        FROM publishers p
        WHERE fuzzy_match_name(v_profile.full_name, p.data->>'name')
           OR EXISTS (
               SELECT 1
               FROM jsonb_array_elements_text(coalesce(p.data->'aliases', '[]'::jsonb)) AS alias(value)
               WHERE fuzzy_match_name(v_profile.full_name, alias.value)
           )
    )
    SELECT count(*), min(id)
    INTO v_match_count, v_publisher_id
    FROM possible_matches;

    IF v_match_count = 1 AND v_publisher_id IS NOT NULL THEN
        UPDATE profiles
        SET publisher_id = v_publisher_id,
            updated_at = now()
        WHERE id = auth.uid();

        PERFORM consume_whatsapp_2fa_preapproval(v_publisher_id, auth.uid());

        IF v_candidate_email <> '' THEN
            SELECT lower(coalesce(data->>'email', '')) INTO v_existing_pub_email
            FROM publishers WHERE id = v_publisher_id;

            IF v_existing_pub_email IS NULL OR v_existing_pub_email = '' THEN
                UPDATE publishers
                SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{email}', to_jsonb(v_candidate_email), true)
                WHERE id = v_publisher_id;
            END IF;
        END IF;

        RETURN jsonb_build_object('success', true, 'publisher_id', v_publisher_id, 'matched', true, 'reason', 'linked_by_name_fuzzy');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'publisher_id', null,
        'matched', false,
        'reason', CASE WHEN v_match_count > 1 THEN 'ambiguous_name' ELSE 'no_match' END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION sync_profile_publisher_link() TO authenticated;
