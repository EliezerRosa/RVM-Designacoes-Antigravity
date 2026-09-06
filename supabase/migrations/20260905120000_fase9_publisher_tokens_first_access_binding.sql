-- =============================================================================
-- Migration: 20260905120000_fase9_publisher_tokens_first_access_binding.sql
-- Descrição: Blindagem total de tokens de formulário com amarração de publisher_id,
--            First-Access Binding com Google Auth e rejeição estrita de email mismatch.
-- Invariante: O publisher_id gravado no token é a única fonte da verdade (anti-spoofing),
--             anulando qualquer adulteração de query params na URL (?u=).
-- =============================================================================

-- 1. Novas colunas em publisher_form_tokens
ALTER TABLE public.publisher_form_tokens 
    ADD COLUMN IF NOT EXISTS publisher_id text REFERENCES public.publishers(id),
    ADD COLUMN IF NOT EXISTS bound_email text;

CREATE INDEX IF NOT EXISTS idx_pub_form_tokens_pub_id ON public.publisher_form_tokens(publisher_id);
CREATE INDEX IF NOT EXISTS idx_pub_form_tokens_bound_email ON public.publisher_form_tokens(bound_email);

-- 2. RPC: authorize_publisher_form_token
CREATE OR REPLACE FUNCTION public.authorize_publisher_form_token(
    p_token text, 
    p_user_publisher_id text DEFAULT NULL::text, 
    p_user_publisher_name text DEFAULT NULL::text, 
    p_user_agent text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_token_id uuid;
    v_label text;
    v_role text;
    v_created_at timestamptz;
    v_revoked_at timestamptz;
    v_expires_at timestamptz;
    v_token_pub_id text;
    v_bound_email text;
    v_resolved_name text;
    v_caller_email text;
    v_caller_uid uuid;
    v_is_admin boolean := false;
BEGIN
    -- 1. Busca o token
    SELECT id, label, role, created_at, revoked_at, expires_at, publisher_id, bound_email
    INTO v_token_id, v_label, v_role, v_created_at, v_revoked_at, v_expires_at, v_token_pub_id, v_bound_email
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

    -- 2. Determinação estrita da identidade do publicador (antes de validar e-mail)
    -- NOTA: O publisher_id gravado no token é a ÚNICA fonte de verdade,
    -- impedindo qualquer tentativa de falsificação via URL (?u=).
    IF v_token_pub_id IS NOT NULL THEN
        SELECT data->>'name'
        INTO v_resolved_name
        FROM publishers
        WHERE id = v_token_pub_id;
    ELSE
        -- Fallback apenas se o token for legado e não tiver publisher_id
        IF p_user_publisher_id IS NOT NULL THEN
            SELECT data->>'name'
            INTO v_resolved_name
            FROM publishers
            WHERE id = p_user_publisher_id;
            v_token_pub_id := p_user_publisher_id;
        END IF;
    END IF;

    -- 3. Identifica o usuário logado via Supabase Auth
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NOT NULL THEN
        SELECT email INTO v_caller_email
        FROM profiles
        WHERE id = v_caller_uid;
        
        IF v_caller_email IS NULL THEN
            v_caller_email := auth.jwt() ->> 'email';
        END IF;

        -- Verifica se o chamador é admin
        v_is_admin := public.is_admin();
    ELSE
        -- Usuário não está logado
        RETURN jsonb_build_object(
            'authorized', false, 
            'reason', 'authentication_required',
            'label', v_label,
            'role', v_role
        );
    END IF;

    -- 4. Validação e Amarração de E-mail (bound_email)
    IF v_bound_email IS NULL THEN
        -- First-access binding: vincula permanentemente a conta Google logada ao token!
        v_bound_email := LOWER(TRIM(v_caller_email));
        UPDATE publisher_form_tokens
           SET bound_email = v_bound_email
         WHERE id = v_token_id;

        -- Se o cadastro do publicador ainda não tiver e-mail, sincroniza no cadastro também
        IF v_token_pub_id IS NOT NULL THEN
            UPDATE publishers
               SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{email}', to_jsonb(v_bound_email), false)
             WHERE id = v_token_pub_id
               AND (data->>'email' IS NULL OR data->>'email' = '');
        END IF;
    ELSE
        -- Validação estrita de e-mail (Admin tem bypass)
        IF NOT v_is_admin AND LOWER(TRIM(v_caller_email)) <> LOWER(TRIM(v_bound_email)) THEN
            RETURN jsonb_build_object(
                'authorized', false,
                'reason', 'email_mismatch',
                'bound_email', v_bound_email,
                'expected_email', v_bound_email,
                'caller_email', v_caller_email,
                'label', v_label,
                'expected_publisher_name', COALESCE(v_resolved_name, v_label)
            );
        END IF;
    END IF;

    -- 5. Atualiza estatísticas de uso
    UPDATE publisher_form_tokens
    SET last_used_at = now(),
        use_count = COALESCE(use_count, 0) + 1
    WHERE id = v_token_id;

    -- 6. Log de auditoria de uso
    BEGIN
        INSERT INTO publisher_form_token_uses (token_id, user_publisher_id, user_publisher_name, user_agent)
        VALUES (
            v_token_id,
            v_token_pub_id,
            COALESCE(v_resolved_name, p_user_publisher_name, v_caller_email),
            format('%s [auth: %s]', COALESCE(p_user_agent, ''), v_caller_email)
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
        'authorized', true,
        'token', p_token,
        'label', v_label,
        'role', v_role,
        'publisher_id', v_token_pub_id,
        'publisher_name', COALESCE(v_resolved_name, v_label),
        'bound_email', v_bound_email,
        'created_at', v_created_at
    );
END;
$function$;
