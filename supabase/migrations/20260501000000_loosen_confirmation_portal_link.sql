-- HOTFIX 2026-05-01: Loosen confirmation portal link check
-- Vínculo profile.publisher_id == token.publisher_id deixa de ser bloqueio
-- e vira classificador (match_type). Token continua obrigatório/único/expirável.
-- A ser SUBSTITUÍDA pela versão completa em FD (auth hardening) com
-- self_declared + needs_review + UI de declaração.
-- Ref: /memories/repo/confirmation-portal-meio-termo-2026-05-01.md

CREATE OR REPLACE FUNCTION authorize_confirmation_portal(p_part_id text, p_publisher_id text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_part_uuid uuid;
    v_profile profiles%ROWTYPE;
    v_link_result jsonb;
    v_token confirmation_portal_tokens%ROWTYPE;
    v_response confirmation_portal_responses%ROWTYPE;
    v_assigned_publisher_name text;
    v_match_type text;
    v_warning text;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'not_authenticated');
    END IF;

    BEGIN
        v_part_uuid := nullif(trim(p_part_id), '')::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RETURN jsonb_build_object('authorized', false, 'reason', 'invalid_assignment_identifier');
    END;

    v_link_result := sync_profile_publisher_link();

    SELECT *
    INTO v_profile
    FROM profiles
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'profile_not_found');
    END IF;

    SELECT *
    INTO v_token
    FROM confirmation_portal_tokens
    WHERE part_id = p_part_id
      AND publisher_id = p_publisher_id
      AND token::text = trim(p_token)
      AND expires_at > now()
      AND (used_at IS NULL OR used_by_profile_id = auth.uid())
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'invalid_or_expired_token');
    END IF;

    IF NOT confirmation_assignment_matches_publisher(p_part_id, p_publisher_id) THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'assignment_mismatch');
    END IF;

    SELECT data->>'name'
    INTO v_assigned_publisher_name
    FROM publishers
    WHERE btrim(id::text) = btrim(p_publisher_id)
    LIMIT 1;

    SELECT *
    INTO v_response
    FROM confirmation_portal_responses
    WHERE token_id = v_token.id
    LIMIT 1;

    -- Classificação (não bloqueia mais):
    --   strict     -> profile.publisher_id == token.publisher_id
    --   admin      -> profile.role = 'admin'
    --   delegated  -> role IN ('anciao','superintendente')
    --   unverified -> qualquer outro caso
    v_match_type := CASE
        WHEN v_profile.role = 'admin' THEN 'admin'
        WHEN v_profile.publisher_id IS NOT NULL
             AND btrim(v_profile.publisher_id) = btrim(p_publisher_id) THEN 'strict'
        WHEN v_profile.role IN ('anciao', 'superintendente') THEN 'delegated'
        ELSE 'unverified'
    END;

    v_warning := CASE WHEN v_match_type = 'unverified'
                      THEN 'identity_not_verified'
                      ELSE NULL END;

    RETURN jsonb_build_object(
        'authorized', true,
        'authenticated_email', v_profile.email,
        'assigned_publisher_name', v_assigned_publisher_name,
        'match_type', v_match_type,
        'warning', v_warning,
        'token_status', CASE WHEN v_token.used_at IS NULL THEN 'active' ELSE 'used' END,
        'response_status', v_response.response,
        'responded_at', v_response.created_at,
        'link_result', v_link_result
    );
END;
$$;

GRANT EXECUTE ON FUNCTION authorize_confirmation_portal(text, text, text) TO authenticated;

COMMENT ON FUNCTION authorize_confirmation_portal(text, text, text) IS
'HOTFIX 2026-05-01: token-only authorization with match_type classifier. To be replaced by FD hardening with self_declared + needs_review.';
