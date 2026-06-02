-- ═══════════════════════════════════════════════════════════════════════
-- MY ASSIGNMENTS PORTAL — token table, RPCs, trigger
-- Portal URL: ?portal=my-assignments&publisher_id=<id>&token=<tok>
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. Token table
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.publisher_portal_tokens (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    publisher_id    TEXT        NOT NULL,
    token           TEXT        NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    bound_email     TEXT        NULL,        -- locked to first Google account on first use
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    is_blocked      BOOLEAN     NOT NULL DEFAULT false,
    blocked_by      TEXT        NULL,        -- profile.id of blocking admin
    blocked_at      TIMESTAMPTZ NULL,
    block_reason    TEXT        NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ppt_publisher_id ON public.publisher_portal_tokens (publisher_id);
CREATE INDEX IF NOT EXISTS idx_ppt_token        ON public.publisher_portal_tokens (token) WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Auto-update timestamp
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ppt_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ppt_updated_at ON public.publisher_portal_tokens;
CREATE TRIGGER ppt_updated_at
    BEFORE UPDATE ON public.publisher_portal_tokens
    FOR EACH ROW EXECUTE FUNCTION public.ppt_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.publisher_portal_tokens ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies to be idempotent
DROP POLICY IF EXISTS ppt_admin_all  ON public.publisher_portal_tokens;
DROP POLICY IF EXISTS ppt_anon_none  ON public.publisher_portal_tokens;

-- Admins can do everything
CREATE POLICY ppt_admin_all ON public.publisher_portal_tokens
    FOR ALL TO authenticated
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()::text) = 'admin'
    )
    WITH CHECK (
        (SELECT role FROM public.profiles WHERE id = auth.uid()::text) = 'admin'
    );

-- Non-admins have no direct access; all access goes through SECURITY DEFINER functions
CREATE POLICY ppt_anon_none ON public.publisher_portal_tokens
    FOR ALL TO authenticated
    USING (false);

-- ─────────────────────────────────────────────────────────────────────
-- 4. Trigger: auto-generate token when a publisher is inserted
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_create_publisher_portal_token()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.publisher_portal_tokens (publisher_id, token)
    SELECT NEW.id, gen_random_uuid()::text
    WHERE NOT EXISTS (
        SELECT 1 FROM public.publisher_portal_tokens
        WHERE publisher_id = NEW.id AND is_active = true
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_publisher_portal_token ON public.publishers;
CREATE TRIGGER trg_auto_publisher_portal_token
    AFTER INSERT ON public.publishers
    FOR EACH ROW EXECUTE FUNCTION public.auto_create_publisher_portal_token();

-- ─────────────────────────────────────────────────────────────────────
-- 5. RPC: get_or_create_my_assignments_portal_token
--    Admin-only. Returns the active token for a publisher, creating one if needed.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_or_create_my_assignments_portal_token(
    p_publisher_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_role TEXT;
    v_token       TEXT;
    v_bound_email TEXT;
    v_is_blocked  BOOLEAN;
BEGIN
    -- Admin-only guard
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid()::text;

    IF v_caller_role IS DISTINCT FROM 'admin' THEN
        RETURN jsonb_build_object('error', 'unauthorized');
    END IF;

    -- Look for active token
    SELECT token, bound_email, is_blocked
    INTO v_token, v_bound_email, v_is_blocked
    FROM public.publisher_portal_tokens
    WHERE publisher_id = p_publisher_id AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1;

    -- Create if none
    IF v_token IS NULL THEN
        v_token := gen_random_uuid()::text;
        INSERT INTO public.publisher_portal_tokens (publisher_id, token)
        VALUES (p_publisher_id, v_token);
        v_bound_email := NULL;
        v_is_blocked  := false;
    END IF;

    RETURN jsonb_build_object(
        'token',       v_token,
        'bound_email', v_bound_email,
        'is_blocked',  COALESCE(v_is_blocked, false)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_my_assignments_portal_token(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 6. RPC: regenerate_my_assignments_portal_token
--    Admin-only. Deactivates all existing tokens for the publisher and creates a fresh one.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.regenerate_my_assignments_portal_token(
    p_publisher_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_role TEXT;
    v_token       TEXT;
BEGIN
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid()::text;

    IF v_caller_role IS DISTINCT FROM 'admin' THEN
        RETURN jsonb_build_object('error', 'unauthorized');
    END IF;

    -- Deactivate all existing tokens for this publisher
    UPDATE public.publisher_portal_tokens
    SET is_active = false
    WHERE publisher_id = p_publisher_id;

    -- Create fresh token (no bound_email)
    v_token := gen_random_uuid()::text;
    INSERT INTO public.publisher_portal_tokens (publisher_id, token, bound_email)
    VALUES (p_publisher_id, v_token, NULL);

    RETURN jsonb_build_object('token', v_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.regenerate_my_assignments_portal_token(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 7. RPC: bulk_generate_my_assignments_portal_tokens
--    Admin-only. Creates tokens for all publishers that don't yet have one.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_generate_my_assignments_portal_tokens()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_role TEXT;
    v_count       INTEGER := 0;
BEGIN
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid()::text;

    IF v_caller_role IS DISTINCT FROM 'admin' THEN
        RETURN jsonb_build_object('error', 'unauthorized');
    END IF;

    -- Insert token for every publisher that has no active token
    INSERT INTO public.publisher_portal_tokens (publisher_id, token)
    SELECT p.id, gen_random_uuid()::text
    FROM public.publishers p
    WHERE NOT EXISTS (
        SELECT 1 FROM public.publisher_portal_tokens t
        WHERE t.publisher_id = p.id AND t.is_active = true
    );

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object('created', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_generate_my_assignments_portal_tokens() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 8. RPC: authorize_my_assignments_portal
--    Called by authenticated users (Google OAuth, no WhatsApp 2FA required).
--    - Validates token
--    - Checks global block (app_settings key 'my_assignments_portal_global_block')
--    - Checks per-publisher block
--    - On first access: binds current Google email to the token
--    - On subsequent accesses: verifies email matches bound_email (unless admin)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.authorize_my_assignments_portal(
    p_publisher_id  TEXT,
    p_token         TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_email  TEXT;
    v_caller_role   TEXT;
    v_is_admin      BOOLEAN;
    v_token_row     RECORD;
    v_global_block  BOOLEAN;
    v_pub_name      TEXT;
    v_setting       JSONB;
BEGIN
    -- Resolve caller identity
    SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
    SELECT role  INTO v_caller_role  FROM public.profiles WHERE id = auth.uid()::text;
    v_is_admin := COALESCE(v_caller_role = 'admin', false);

    -- Check global block (stored as JSONB in app_settings)
    SELECT value INTO v_setting
    FROM public.app_settings
    WHERE key = 'my_assignments_portal_global_block';

    IF v_setting IS NOT NULL THEN
        v_global_block := COALESCE((v_setting ->> 'blocked')::boolean, false);
    ELSE
        v_global_block := false;
    END IF;

    -- Admin bypasses global block for inspection, but we still report it
    IF v_global_block AND NOT v_is_admin THEN
        RETURN jsonb_build_object(
            'authorized', false,
            'reason',     'global_block'
        );
    END IF;

    -- Look up the token
    SELECT * INTO v_token_row
    FROM public.publisher_portal_tokens
    WHERE publisher_id = p_publisher_id
      AND token = p_token
      AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'authorized', false,
            'reason',     'invalid_token'
        );
    END IF;

    -- Check per-publisher block
    IF v_token_row.is_blocked AND NOT v_is_admin THEN
        RETURN jsonb_build_object(
            'authorized', false,
            'reason',     'publisher_blocked'
        );
    END IF;

    -- Get publisher name
    SELECT (data ->> 'name') INTO v_pub_name
    FROM public.publishers
    WHERE id = p_publisher_id;

    -- First access: bind email
    IF v_token_row.bound_email IS NULL THEN
        UPDATE public.publisher_portal_tokens
        SET bound_email = v_caller_email
        WHERE id = v_token_row.id;

        RETURN jsonb_build_object(
            'authorized',      true,
            'first_access',    true,
            'publisher_id',    p_publisher_id,
            'publisher_name',  COALESCE(v_pub_name, ''),
            'bound_email',     v_caller_email,
            'is_admin',        v_is_admin,
            'global_blocked',  v_global_block
        );
    END IF;

    -- Subsequent accesses: check email matches (admin bypasses)
    IF NOT v_is_admin AND v_token_row.bound_email <> v_caller_email THEN
        RETURN jsonb_build_object(
            'authorized',   false,
            'reason',       'email_mismatch',
            'bound_email',  v_token_row.bound_email
        );
    END IF;

    RETURN jsonb_build_object(
        'authorized',      true,
        'first_access',    false,
        'publisher_id',    p_publisher_id,
        'publisher_name',  COALESCE(v_pub_name, ''),
        'bound_email',     v_token_row.bound_email,
        'is_admin',        v_is_admin,
        'is_blocked',      v_token_row.is_blocked,
        'global_blocked',  v_global_block
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.authorize_my_assignments_portal(text, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 9. RPC: admin_set_publisher_portal_block
--    Admin-only. Block or unblock a specific publisher's portal.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_publisher_portal_block(
    p_publisher_id  TEXT,
    p_blocked       BOOLEAN,
    p_reason        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_role TEXT;
    v_rows        INTEGER;
BEGIN
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid()::text;

    IF v_caller_role IS DISTINCT FROM 'admin' THEN
        RETURN jsonb_build_object('error', 'unauthorized');
    END IF;

    UPDATE public.publisher_portal_tokens
    SET
        is_blocked   = p_blocked,
        blocked_by   = CASE WHEN p_blocked THEN auth.uid()::text ELSE NULL END,
        blocked_at   = CASE WHEN p_blocked THEN NOW() ELSE NULL END,
        block_reason = CASE WHEN p_blocked THEN p_reason ELSE NULL END
    WHERE publisher_id = p_publisher_id AND is_active = true;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN jsonb_build_object('updated', v_rows, 'blocked', p_blocked);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_publisher_portal_block(text, boolean, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 10. RPC: admin_set_global_portal_block
--     Admin-only. Globally enable/disable the portal for all publishers.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_global_portal_block(
    p_blocked BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid()::text;

    IF v_caller_role IS DISTINCT FROM 'admin' THEN
        RETURN jsonb_build_object('error', 'unauthorized');
    END IF;

    INSERT INTO public.app_settings (key, value)
    VALUES (
        'my_assignments_portal_global_block',
        jsonb_build_object('blocked', p_blocked, 'set_by', auth.uid()::text, 'set_at', NOW()::text)
    )
    ON CONFLICT (key) DO UPDATE
    SET value = jsonb_build_object('blocked', p_blocked, 'set_by', auth.uid()::text, 'set_at', NOW()::text);

    RETURN jsonb_build_object('blocked', p_blocked);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_global_portal_block(boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 11. RPC: admin_list_publisher_portal_tokens
--     Admin-only. Returns all publishers with their portal token status.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_publisher_portal_tokens()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_role TEXT;
    v_result      JSONB;
BEGIN
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid()::text;

    IF v_caller_role IS DISTINCT FROM 'admin' THEN
        RETURN jsonb_build_object('error', 'unauthorized');
    END IF;

    SELECT jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.publisher_name)
    INTO v_result
    FROM (
        SELECT
            p.id                AS publisher_id,
            (p.data ->> 'name') AS publisher_name,
            t.id                AS token_row_id,
            t.token,
            t.bound_email,
            t.is_active,
            t.is_blocked,
            t.block_reason,
            t.created_at,
            t.updated_at
        FROM public.publishers p
        LEFT JOIN LATERAL (
            SELECT *
            FROM public.publisher_portal_tokens tt
            WHERE tt.publisher_id = p.id AND tt.is_active = true
            ORDER BY tt.created_at DESC
            LIMIT 1
        ) t ON true
    ) sub;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_publisher_portal_tokens() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 12. Bulk-generate tokens for all existing publishers that have none
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.publisher_portal_tokens (publisher_id, token)
SELECT p.id, gen_random_uuid()::text
FROM public.publishers p
WHERE NOT EXISTS (
    SELECT 1 FROM public.publisher_portal_tokens t
    WHERE t.publisher_id = p.id AND t.is_active = true
);
