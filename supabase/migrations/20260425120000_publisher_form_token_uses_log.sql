-- =============================================================================
-- Log persistente de uso dos tokens publisher-form.
--
-- Acrescenta:
--   • Tabela `publisher_form_token_uses` (RLS admin-only) — uma linha por
--     validação bem-sucedida que tenha identificação de usuário.
--   • Estende `authorize_publisher_form_token` com 3 args opcionais:
--       p_user_publisher_id, p_user_publisher_name, p_user_agent
--     Quando `p_user_publisher_id` é fornecido, o nome é resolvido pelo
--     servidor (via `publishers.name`) — evita spoofing trivial do nome.
--   • RPC `list_publisher_form_token_uses(token_id, limit)` para o admin
--     consultar o histórico (também SECURITY DEFINER + checagem de role).
--
-- A versão antiga de 1 argumento é DROPada para evitar ambiguidade no
-- PostgREST.
-- =============================================================================

CREATE TABLE IF NOT EXISTS publisher_form_token_uses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id uuid NOT NULL REFERENCES publisher_form_tokens(id) ON DELETE CASCADE,
    used_at timestamptz NOT NULL DEFAULT now(),
    user_publisher_id text REFERENCES publishers(id) ON DELETE SET NULL,
    user_publisher_name text,
    user_agent text
);

CREATE INDEX IF NOT EXISTS idx_pft_uses_token_id
    ON publisher_form_token_uses(token_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_pft_uses_publisher_id
    ON publisher_form_token_uses(user_publisher_id, used_at DESC);

ALTER TABLE publisher_form_token_uses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS publisher_form_token_uses_admin_select ON publisher_form_token_uses;
CREATE POLICY publisher_form_token_uses_admin_select ON publisher_form_token_uses
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Remove versão antiga (1 argumento) para evitar ambiguidade no PostgREST.
DROP FUNCTION IF EXISTS authorize_publisher_form_token(text);

CREATE OR REPLACE FUNCTION authorize_publisher_form_token(
    p_token text,
    p_user_publisher_id text DEFAULT NULL,
    p_user_publisher_name text DEFAULT NULL,
    p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    v_row publisher_form_tokens%ROWTYPE;
    v_resolved_name text;
BEGIN
    IF p_token IS NULL OR length(btrim(p_token)) = 0 THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'missing_token');
    END IF;

    SELECT * INTO v_row FROM publisher_form_tokens WHERE token = btrim(p_token) LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'invalid_token');
    END IF;

    IF v_row.revoked_at IS NOT NULL THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'revoked');
    END IF;

    IF v_row.expires_at IS NOT NULL AND v_row.expires_at <= now() THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'expired');
    END IF;

    -- Resolve nome a partir do publisher_id (se fornecido) — evita spoof do nome.
    v_resolved_name := p_user_publisher_name;
    IF p_user_publisher_id IS NOT NULL THEN
        SELECT name INTO v_resolved_name FROM publishers WHERE id = p_user_publisher_id;
    END IF;

    IF p_user_publisher_id IS NOT NULL OR v_resolved_name IS NOT NULL THEN
        INSERT INTO publisher_form_token_uses (
            token_id, user_publisher_id, user_publisher_name, user_agent
        )
        VALUES (v_row.id, p_user_publisher_id, v_resolved_name, p_user_agent);
    END IF;

    UPDATE publisher_form_tokens
    SET use_count = use_count + 1, last_used_at = now()
    WHERE id = v_row.id;

    RETURN jsonb_build_object(
        'authorized', true,
        'token', v_row.token,
        'label', v_row.label,
        'role', v_row.role,
        'created_at', v_row.created_at,
        'expires_at', v_row.expires_at
    );
END;
$func$;

REVOKE ALL ON FUNCTION authorize_publisher_form_token(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION authorize_publisher_form_token(text, text, text, text) TO anon, authenticated;

-- RPC para admin listar log de um token
CREATE OR REPLACE FUNCTION list_publisher_form_token_uses(
    p_token_id uuid,
    p_limit int DEFAULT 100
)
RETURNS TABLE (
    id uuid,
    used_at timestamptz,
    user_publisher_id text,
    user_publisher_name text,
    user_agent text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT u.id, u.used_at, u.user_publisher_id, u.user_publisher_name, u.user_agent
    FROM publisher_form_token_uses u
    WHERE u.token_id = p_token_id
      AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    ORDER BY u.used_at DESC
    LIMIT GREATEST(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION list_publisher_form_token_uses(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_publisher_form_token_uses(uuid, int) TO authenticated;
