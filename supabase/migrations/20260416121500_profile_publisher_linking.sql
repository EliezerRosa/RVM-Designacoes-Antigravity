-- Auto-link authenticated profiles to publishers by normalized full name or alias.

CREATE OR REPLACE FUNCTION normalize_identity_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT trim(
        regexp_replace(
            lower(
                translate(
                    coalesce(p_value, ''),
                    'áàãâäéèẽêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈẼÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
                    'aaaaaeeeeeiiiiooooouuuucAAAAAEEEEEIIIIOOOOOUUUUC'
                )
            ),
            '[^a-z0-9]+',
            ' ',
            'g'
        )
    );
$$;

CREATE OR REPLACE FUNCTION sync_profile_publisher_link()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile profiles%ROWTYPE;
    v_candidate_name text;
    v_match_count integer;
    v_publisher_id text;
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
        RETURN jsonb_build_object('success', true, 'publisher_id', v_profile.publisher_id, 'matched', true, 'reason', 'already_linked');
    END IF;

    v_candidate_name := normalize_identity_text(v_profile.full_name);

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
        UPDATE profiles
        SET publisher_id = v_publisher_id,
            updated_at = now()
        WHERE id = auth.uid();

        RETURN jsonb_build_object('success', true, 'publisher_id', v_publisher_id, 'matched', true, 'reason', 'linked_by_name');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'publisher_id', null,
        'matched', false,
        'reason', CASE WHEN v_match_count > 1 THEN 'ambiguous_match' ELSE 'no_match' END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION normalize_identity_text(text) TO authenticated;
GRANT EXECUTE ON FUNCTION sync_profile_publisher_link() TO authenticated;

CREATE OR REPLACE FUNCTION authorize_confirmation_portal(p_part_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile profiles%ROWTYPE;
    v_link_result jsonb;
    v_current_publisher_name text;
    v_resolved_publisher_id text;
    v_resolved_publisher_name text;
    v_raw_publisher_name text;
    v_assigned_publisher_name text;
    v_is_authorized boolean := false;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'not_authenticated');
    END IF;

    v_link_result := sync_profile_publisher_link();

    SELECT *
    INTO v_profile
    FROM profiles
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'profile_not_found');
    END IF;

    SELECT resolved_publisher_id, resolved_publisher_name, raw_publisher_name
    INTO v_resolved_publisher_id, v_resolved_publisher_name, v_raw_publisher_name
    FROM workbook_parts
    WHERE id = p_part_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'assignment_not_found');
    END IF;

    v_assigned_publisher_name := COALESCE(v_resolved_publisher_name, v_raw_publisher_name);

    IF v_profile.role = 'admin' THEN
        RETURN jsonb_build_object(
            'authorized', true,
            'authenticated_email', v_profile.email,
            'assigned_publisher_name', v_assigned_publisher_name,
            'match_type', 'admin'
        );
    END IF;

    IF v_profile.publisher_id IS NOT NULL THEN
        IF v_resolved_publisher_id IS NOT NULL AND btrim(v_profile.publisher_id) = btrim(v_resolved_publisher_id) THEN
            v_is_authorized := true;
        ELSE
            SELECT data->>'name'
            INTO v_current_publisher_name
            FROM publishers
            WHERE id = v_profile.publisher_id
            LIMIT 1;

            IF v_current_publisher_name IS NOT NULL
               AND v_assigned_publisher_name IS NOT NULL
               AND normalize_identity_text(v_current_publisher_name) = normalize_identity_text(v_assigned_publisher_name) THEN
                v_is_authorized := true;
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'authorized', v_is_authorized,
        'authenticated_email', v_profile.email,
        'assigned_publisher_name', v_assigned_publisher_name,
        'link_result', v_link_result,
        'reason', CASE WHEN v_is_authorized THEN NULL ELSE 'email_not_linked_to_assignee' END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION authorize_confirmation_portal(text) TO authenticated;