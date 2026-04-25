-- =============================================================================
-- Hardening dos tokens do portal `publisher-form`.
--
-- Antes:
--   Os tokens eram armazenados em app_settings['publisher_form_tokens'] como
--   um JSON publicamente legível e validados client-side. Qualquer leitor da
--   tabela app_settings poderia listar/forjar tokens.
--
-- Depois:
--   Tokens passam a viver em uma tabela dedicada (`publisher_form_tokens`)
--   com Row Level Security:
--     • Apenas admins podem listar / criar / revogar / reativar / deletar.
--     • Validação para uso público (sem login) acontece via uma RPC
--       SECURITY DEFINER (`authorize_publisher_form_token`) que devolve
--       apenas os campos seguros (label, role, expires_at) e incrementa
--       `use_count` + `last_used_at` para auditoria.
--   Mesmo padrão usado em `confirmation_portal_tokens`.
-- =============================================================================

CREATE TABLE IF NOT EXISTS publisher_form_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18), 'hex'),
    label text NOT NULL,
    role text NOT NULL DEFAULT 'CCA' CHECK (role IN ('CCA', 'SEC', 'SS', 'SRVM', 'AjSRVM')),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    created_by_email text,
    expires_at timestamptz,                       -- NULL = sem expiração intrínseca
    revoked_at timestamptz,                       -- NULL = ativo
    revoked_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    last_used_at timestamptz,
    use_count int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_publisher_form_tokens_token
    ON publisher_form_tokens(token);
CREATE INDEX IF NOT EXISTS idx_publisher_form_tokens_status
    ON publisher_form_tokens(revoked_at, expires_at);

ALTER TABLE publisher_form_tokens ENABLE ROW LEVEL SECURITY;

-- ── RLS: apenas admin enxerga / mexe direto ───────────────────────────────
DROP POLICY IF EXISTS publisher_form_tokens_admin_select ON publisher_form_tokens;
CREATE POLICY publisher_form_tokens_admin_select ON publisher_form_tokens
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS publisher_form_tokens_admin_insert ON publisher_form_tokens;
CREATE POLICY publisher_form_tokens_admin_insert ON publisher_form_tokens
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS publisher_form_tokens_admin_update ON publisher_form_tokens;
CREATE POLICY publisher_form_tokens_admin_update ON publisher_form_tokens
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS publisher_form_tokens_admin_delete ON publisher_form_tokens;
CREATE POLICY publisher_form_tokens_admin_delete ON publisher_form_tokens
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ── RPC pública: valida token sem login ───────────────────────────────────
-- SECURITY DEFINER → atravessa RLS, mas devolve apenas campos seguros e
-- registra uso (use_count + last_used_at).
CREATE OR REPLACE FUNCTION authorize_publisher_form_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row publisher_form_tokens%ROWTYPE;
BEGIN
    IF p_token IS NULL OR length(btrim(p_token)) = 0 THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'missing_token');
    END IF;

    SELECT *
    INTO v_row
    FROM publisher_form_tokens
    WHERE token = btrim(p_token)
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'invalid_token');
    END IF;

    IF v_row.revoked_at IS NOT NULL THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'revoked');
    END IF;

    IF v_row.expires_at IS NOT NULL AND v_row.expires_at <= now() THEN
        RETURN jsonb_build_object('authorized', false, 'reason', 'expired');
    END IF;

    UPDATE publisher_form_tokens
    SET use_count = use_count + 1,
        last_used_at = now()
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
$$;

REVOKE ALL ON FUNCTION authorize_publisher_form_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION authorize_publisher_form_token(text) TO anon, authenticated;

-- ── Migração de dados: importa tokens de app_settings se existirem ───────
DO $$
DECLARE
    v_legacy jsonb;
    v_item jsonb;
    v_role text;
BEGIN
    SELECT value
    INTO v_legacy
    FROM app_settings
    WHERE key = 'publisher_form_tokens';

    IF v_legacy IS NULL OR jsonb_typeof(v_legacy) <> 'array' THEN
        RETURN;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_legacy)
    LOOP
        v_role := COALESCE(v_item->>'role', 'CCA');
        IF v_role NOT IN ('CCA', 'SEC', 'SS', 'SRVM', 'AjSRVM') THEN
            v_role := 'CCA';
        END IF;

        INSERT INTO publisher_form_tokens (
            token, label, role,
            created_at, created_by_email,
            revoked_at
        )
        VALUES (
            v_item->>'token',
            COALESCE(v_item->>'label', '(sem rótulo)'),
            v_role,
            COALESCE((v_item->>'createdAt')::timestamptz, now()),
            v_item->>'createdBy',
            CASE
                WHEN COALESCE((v_item->>'active')::boolean, true) THEN NULL
                ELSE COALESCE((v_item->>'createdAt')::timestamptz, now())
            END
        )
        ON CONFLICT (token) DO NOTHING;
    END LOOP;
END;
$$;
