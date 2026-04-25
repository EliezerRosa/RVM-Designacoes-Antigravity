-- Corrige authorize_publisher_form_token: publishers.name nao existe; nome esta em data->>'name'.
-- Sintoma: chamada com p_user_publisher_id retornava 42703 (column "name" does not exist)
-- e o front exibia "Acesso nao autorizado" sempre que o link continha &u=<id>.

CREATE OR REPLACE FUNCTION public.authorize_publisher_form_token(
    p_token text,
    p_user_publisher_id text DEFAULT NULL,
    p_user_publisher_name text DEFAULT NULL,
    p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_token_id uuid;
    v_label text;
    v_role text;
    v_created_at timestamptz;
    v_revoked_at timestamptz;
    v_expires_at timestamptz;
    v_resolved_name text;
BEGIN
    SELECT id, label, role, created_at, revoked_at, expires_at
    INTO v_token_id, v_label, v_role, v_created_at, v_revoked_at, v_expires_at
    FROM publisher_form_tokens
    WHERE token = p_token;

    IF v_token_id IS NULL THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'invalid_token');
    END IF;

    IF v_revoked_at IS NOT NULL THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'revoked');
    END IF;

    IF v_expires_at IS NOT NULL AND v_expires_at < now() THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'expired');
    END IF;

    -- Resolve nome server-side (fonte da verdade) se um id foi passado.
    -- publishers.data e jsonb com o nome em data->>'name'.
    IF p_user_publisher_id IS NOT NULL THEN
        SELECT data->>'name'
        INTO v_resolved_name
        FROM publishers
        WHERE id = p_user_publisher_id;
    END IF;

    -- Atualiza estatisticas do token.
    UPDATE publisher_form_tokens
    SET last_used_at = now(),
        use_count = COALESCE(use_count, 0) + 1
    WHERE id = v_token_id;

    -- Insere linha no log de uso (best effort - nao quebra autorizacao se falhar).
    BEGIN
        INSERT INTO publisher_form_token_uses (token_id, user_publisher_id, user_publisher_name, user_agent)
        VALUES (
            v_token_id,
            p_user_publisher_id,
            COALESCE(v_resolved_name, p_user_publisher_name),
            p_user_agent
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
        'authorized', true,
        'token', p_token,
        'label', v_label,
        'role', v_role,
        'created_at', v_created_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.authorize_publisher_form_token(text, text, text, text) TO anon, authenticated;
