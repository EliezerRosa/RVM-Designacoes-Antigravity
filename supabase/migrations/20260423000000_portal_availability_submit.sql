-- Portal de Disponibilidade: gravação autoritativa via token (SECURITY DEFINER).
-- O portal é acessado anonimamente com token da query string. Sem RPC, o upsert
-- direto na tabela publishers depende de RLS aberto e pode silenciosamente
-- falhar em produção (0 linhas afetadas, sem erro). Esta RPC valida o token
-- contra app_settings.availability_tokens e atualiza apenas a chave
-- "availability" do JSONB do publicador correspondente, sem expor a tabela.

CREATE OR REPLACE FUNCTION submit_publisher_availability(
    p_token text,
    p_availability jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tokens jsonb;
    v_match jsonb;
    v_publisher_id text;
    v_updated jsonb;
BEGIN
    IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'missing_token');
    END IF;

    IF p_availability IS NULL OR jsonb_typeof(p_availability) <> 'object' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
    END IF;

    -- Buscar tokens (lista) salvos em app_settings sob a chave 'availability_tokens'
    SELECT value
      INTO v_tokens
      FROM app_settings
     WHERE key = 'availability_tokens'
     LIMIT 1;

    IF v_tokens IS NULL OR jsonb_typeof(v_tokens) <> 'array' THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_tokens_configured');
    END IF;

    -- Encontrar o token ativo correspondente
    SELECT t
      INTO v_match
      FROM jsonb_array_elements(v_tokens) AS t
     WHERE t->>'token' = trim(p_token)
       AND COALESCE((t->>'active')::boolean, false) = true
     LIMIT 1;

    IF v_match IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_or_revoked_token');
    END IF;

    v_publisher_id := v_match->>'publisherId';

    IF v_publisher_id IS NULL OR length(v_publisher_id) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'token_missing_publisher');
    END IF;

    -- Atualizar o JSONB do publicador, preservando todos os outros campos.
    UPDATE publishers
       SET data = jsonb_set(
                COALESCE(data, '{}'::jsonb),
                '{availability}',
                p_availability,
                true
            )
     WHERE id = v_publisher_id
   RETURNING data INTO v_updated;

    IF v_updated IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'publisher_not_found');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'publisherId', v_publisher_id,
        'availability', v_updated->'availability'
    );
END;
$$;

REVOKE ALL ON FUNCTION submit_publisher_availability(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_publisher_availability(text, jsonb) TO anon, authenticated;
