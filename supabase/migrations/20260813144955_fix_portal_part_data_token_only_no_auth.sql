-- Fix: RPC get_portal_part_data quebrava para 100% dos publicadores em 3 niveis
-- (1) Cast forcado p_publisher_id::uuid falhava (publisher_id e TEXT numerico).
-- (2) Chamava authorize_confirmation_portal, que exige auth.uid() IS NOT NULL.
--     Mas o fluxo do link WhatsApp e ANONIMO por design; a seguranca e o token
--     opaco na URL, nao a sessao. RLS Fase 4c fechou SELECT em workbook_parts,
--     entao esta RPC (SECURITY DEFINER) e a unica maneira de anon ler a parte.
-- (3) Referencia a v_partner_pub no RETURN falhava com "record not assigned yet"
--     quando nao havia parceiro (plpgsql avalia estrutura mesmo em branch morto).
--
-- Nova validacao: exige apenas match part_id + publisher_id + token nao-expirado
-- em confirmation_portal_tokens. Extrai telefone do parceiro em variavel escalar
-- para evitar dependencia do tipo do record em branch morto.

CREATE OR REPLACE FUNCTION public.get_portal_part_data(p_part_id text, p_publisher_id text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_part_uuid uuid;
    v_token confirmation_portal_tokens%ROWTYPE;
    v_part_row record;
    v_partner_row record;
    v_partner_phone text;
    v_partner_found boolean := false;
    v_setting_val jsonb;
    v_meeting_day integer := 4;
    v_part_num text;
    v_solo_modalidades text[] := ARRAY['Discurso (Estudante)', 'Leitura (Estudante)'];
    v_titular_mod text;
BEGIN
    BEGIN
        v_part_uuid := nullif(trim(p_part_id), '')::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RETURN jsonb_build_object('error', 'invalid_uuid');
    END;

    SELECT *
    INTO v_token
    FROM confirmation_portal_tokens
    WHERE part_id = p_part_id
      AND publisher_id = p_publisher_id
      AND token::text = trim(p_token)
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'invalid_or_expired_token');
    END IF;

    SELECT * INTO v_part_row
    FROM workbook_parts
    WHERE id = v_part_uuid
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'part_not_found');
    END IF;

    SELECT value INTO v_setting_val
    FROM app_settings
    WHERE key = 's89_meeting_day_by_week'
    LIMIT 1;

    IF v_setting_val IS NOT NULL AND v_setting_val ? v_part_row.week_id THEN
        v_meeting_day := (v_setting_val->>v_part_row.week_id)::integer;
    END IF;

    v_part_num := substring(COALESCE(v_part_row.part_title, v_part_row.tipo_parte, '') from '^(\d+)');

    SELECT p.* INTO v_partner_row
    FROM workbook_parts p
    WHERE p.week_id = v_part_row.week_id
      AND p.id != v_part_row.id
      AND (p.resolved_publisher_name IS NOT NULL OR p.raw_publisher_name IS NOT NULL)
      AND p.funcao != v_part_row.funcao
      AND (
          (v_part_num IS NOT NULL AND substring(COALESCE(p.part_title, p.tipo_parte, '') from '^(\d+)') = v_part_num)
          OR
          (v_part_num IS NULL AND p.tipo_parte = v_part_row.tipo_parte)
      )
    LIMIT 1;

    v_partner_found := FOUND;

    IF v_partner_found THEN
        IF v_part_row.funcao = 'Ajudante' THEN
            v_titular_mod := COALESCE(v_partner_row.modalidade, '');
        ELSE
            v_titular_mod := COALESCE(v_part_row.modalidade, '');
        END IF;

        IF v_titular_mod = ANY(v_solo_modalidades) THEN
            v_partner_found := false;
        END IF;
    END IF;

    IF v_partner_found THEN
        SELECT data->>'phone' INTO v_partner_phone
        FROM publishers
        WHERE btrim(data->>'name') = btrim(COALESCE(v_partner_row.resolved_publisher_name, v_partner_row.raw_publisher_name))
        LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'part', row_to_json(v_part_row),
        'meetingDay', v_meeting_day,
        'partner', CASE
            WHEN v_partner_found THEN
                jsonb_build_object(
                    'name', COALESCE(v_partner_row.resolved_publisher_name, v_partner_row.raw_publisher_name),
                    'funcao', v_partner_row.funcao,
                    'phone', v_partner_phone
                )
            ELSE NULL
        END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_part_data(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_part_data(text, text, text) TO anon;
