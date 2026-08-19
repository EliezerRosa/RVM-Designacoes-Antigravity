-- ============================================================
-- Phase 1 Security Hardening: Auth System
-- 2026-08-19
--
-- 1.1 Migrar geração de código 2FA para o servidor (CRÍTICO)
-- 1.2 Rate-limiting nas RPCs de 2FA (ALTO)
-- 1.4 Expiração de challenges WebAuthn (ALTO)
-- 1.5 Suporte a múltiplos admins via app_settings (ALTO)
-- ============================================================

-- ============================================================
-- 1.1 + 1.2: Nova versão da RPC create_whatsapp_auth_request
-- Agora gera o código no SERVIDOR usando gen_random_bytes()
-- e inclui rate-limiting (máx 1 solicitação a cada 2 min)
-- ============================================================

-- Drop da assinatura antiga (2 parâmetros) antes de criar com 1 parâmetro
DROP FUNCTION IF EXISTS create_whatsapp_auth_request(text, text);

CREATE OR REPLACE FUNCTION create_whatsapp_auth_request(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_code text;
    v_recent_count integer;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    IF COALESCE(length(trim(p_phone)), 0) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
    END IF;

    -- RATE LIMIT: máximo 1 solicitação a cada 2 minutos por perfil
    SELECT count(*) INTO v_recent_count
    FROM auth_requests
    WHERE profile_id = auth.uid()
      AND status = 'pending'
      AND created_at > now() - interval '2 minutes';

    IF v_recent_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'rate_limited',
            'message', 'Aguarde 2 minutos antes de solicitar um novo código.');
    END IF;

    -- GERAR CÓDIGO NO SERVIDOR com CSPRNG (gen_random_bytes)
    -- Gera número entre 100000 e 999999
    v_code := lpad(
        (100000 + (get_byte(gen_random_bytes(3), 0) * 65536 +
                   get_byte(gen_random_bytes(3), 1) * 256 +
                   get_byte(gen_random_bytes(3), 2)) % 900000)::text,
        6, '0'
    );

    -- Expirar solicitações anteriores
    UPDATE auth_requests
    SET status = 'expired'
    WHERE profile_id = auth.uid()
      AND status = 'pending';

    -- Inserir nova solicitação com código gerado pelo servidor
    INSERT INTO auth_requests (profile_id, phone, code, status)
    VALUES (auth.uid(), trim(p_phone), v_code, 'pending');

    -- Retornar o código para que o AuthContext possa enviá-lo via WhatsApp
    RETURN jsonb_build_object('success', true, 'code', v_code);
END;
$$;

GRANT EXECUTE ON FUNCTION create_whatsapp_auth_request(text) TO authenticated;


-- ============================================================
-- 1.2: Rate-limiting na verificação de código 2FA
-- Máximo 5 tentativas a cada 10 minutos por perfil
-- ============================================================

CREATE OR REPLACE FUNCTION verify_whatsapp_auth_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request auth_requests%ROWTYPE;
    v_failed_count integer;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    -- RATE LIMIT: máximo 5 tentativas de verificação a cada 10 minutos
    -- Conta tentativas que resultaram em falha (códigos errados)
    -- Usamos auth_logs para não poluir auth_requests
    SELECT count(*) INTO v_failed_count
    FROM auth_logs
    WHERE profile_id = auth.uid()
      AND event_type = '2fa_failed'
      AND created_at > now() - interval '10 minutes';

    IF v_failed_count >= 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'rate_limited',
            'message', 'Muitas tentativas. Aguarde 10 minutos.');
    END IF;

    -- Expirar solicitações vencidas
    UPDATE auth_requests
    SET status = 'expired'
    WHERE profile_id = auth.uid()
      AND status = 'pending'
      AND expires_at <= now();

    -- Buscar solicitação válida
    SELECT *
    INTO v_request
    FROM auth_requests
    WHERE profile_id = auth.uid()
      AND code = trim(p_code)
      AND status = 'pending'
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired');
    END IF;

    -- Marcar como verificado (double-check atômico)
    UPDATE auth_requests
    SET status = 'verified'
    WHERE id = v_request.id
      AND profile_id = auth.uid()
      AND status = 'pending'
      AND expires_at > now();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired');
    END IF;

    -- Atualizar perfil como verificado
    UPDATE profiles
    SET whatsapp_verified = true,
        phone = v_request.phone,
        updated_at = now()
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'profile_not_found';
    END IF;

    -- Expirar solicitações restantes
    UPDATE auth_requests
    SET status = 'expired'
    WHERE profile_id = auth.uid()
      AND status = 'pending'
      AND id <> v_request.id;

    RETURN jsonb_build_object('success', true, 'phone', v_request.phone);
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION verify_whatsapp_auth_code(text) TO authenticated;


-- ============================================================
-- 1.4: Expiração de challenges WebAuthn
-- Adiciona coluna expires_at (default 5 minutos)
-- ============================================================

ALTER TABLE public.webauthn_challenges
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE
    DEFAULT (timezone('utc'::text, now()) + interval '5 minutes');

-- Limpar challenges antigos (>1h) que já estão no banco
DELETE FROM public.webauthn_challenges
WHERE created_at < now() - interval '1 hour';


-- ============================================================
-- 1.5: Suporte a múltiplos admins — substituir hardcoded trigger
-- O trigger agora consulta app_settings para admin_seed_emails
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_email text;
    v_is_admin boolean := false;
    v_admin_emails text;
BEGIN
    v_email := LOWER(COALESCE(NEW.email, ''));

    -- Verificar se o e-mail está na lista de admins configurada em app_settings
    SELECT value::text INTO v_admin_emails
    FROM app_settings
    WHERE key = 'admin_seed_emails';

    -- Se a configuração existir, checar se o e-mail está na lista (JSON array de strings)
    IF v_admin_emails IS NOT NULL THEN
        BEGIN
            v_is_admin := EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(v_admin_emails::jsonb) AS admin_email
                WHERE LOWER(TRIM(admin_email)) = v_email
            );
        EXCEPTION WHEN OTHERS THEN
            -- Fallback: se o valor não for um JSON array válido, comparar diretamente
            v_is_admin := LOWER(TRIM(v_admin_emails)) = v_email;
        END;
    ELSE
        -- Fallback de segurança: se app_settings não estiver configurada,
        -- manter o admin original para não perder acesso
        v_is_admin := v_email = 'zico.josias@gmail.com';
    END IF;

    INSERT INTO profiles (id, email, full_name, role, whatsapp_verified)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        CASE WHEN v_is_admin THEN 'admin' ELSE 'publicador' END,
        v_is_admin  -- Admins entram pré-verificados
    );

    RETURN NEW;
END;
$$;

-- Recriar trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Seed a configuração de admin_seed_emails (se não existir)
INSERT INTO app_settings (key, value)
VALUES ('admin_seed_emails', '["zico.josias@gmail.com"]')
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- Adicionar event_types novos ao auth_logs CHECK constraint
-- (device_biometric_login, device_biometric_registered,
--  webauthn_unsupported, rate_limited)
-- ============================================================

-- Remover constraint antiga e adicionar nova com todos os tipos
ALTER TABLE auth_logs DROP CONSTRAINT IF EXISTS auth_logs_event_type_check;
ALTER TABLE auth_logs ADD CONSTRAINT auth_logs_event_type_check
    CHECK (event_type IN (
        'login', 'logout',
        '2fa_request', '2fa_verified', '2fa_failed',
        'device_biometric_login', 'device_biometric_registered',
        'webauthn_unsupported', 'rate_limited'
    ));
