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
