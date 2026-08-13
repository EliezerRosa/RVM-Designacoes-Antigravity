-- =============================================================================
-- Fix: RLS hardening quebrou o portal de confirmação
-- O portal precisa carregar dados da parte + parceiro, mas não tem acesso direto
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_portal_part_data(p_part_id text, p_publisher_id text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_part_uuid uuid;
    v_publisher_uuid uuid;
    v_auth_result jsonb;
    v_part_row record;
    v_partner_row record;
    v_partner_pub record;
    v_setting_val jsonb;
    v_meeting_day integer := 4; -- default quinta-feira
    v_part_num text;
    v_solo_modalidades text[] := ARRAY['Discurso (Estudante)', 'Leitura (Estudante)'];
    v_titular_mod text;
BEGIN
    -- 1. Validar inputs e converter UUIDs
    BEGIN
        v_part_uuid := nullif(trim(p_part_id), '')::uuid;
        v_publisher_uuid := nullif(trim(p_publisher_id), '')::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RETURN jsonb_build_object('error', 'invalid_uuid');
    END;

    -- 2. Validar token chamando a função existente (reuso de lógica)
    v_auth_result := authorize_confirmation_portal(p_part_id, p_publisher_id, p_token);
    
    IF NOT (v_auth_result->>'authorized')::boolean THEN
        RETURN jsonb_build_object('error', v_auth_result->>'reason');
    END IF;

    -- 3. Buscar a parte principal
    SELECT * INTO v_part_row
    FROM workbook_parts
    WHERE id = v_part_uuid
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'part_not_found');
    END IF;

    -- 4. Buscar o dia da reunião configurado para a semana
    SELECT value INTO v_setting_val
    FROM app_settings
    WHERE key = 's89_meeting_day_by_week'
    LIMIT 1;
    
    IF v_setting_val IS NOT NULL AND v_setting_val ? v_part_row.week_id THEN
        v_meeting_day := (v_setting_val->>v_part_row.week_id)::integer;
    END IF;

    -- 5. Lógica de Parceiro (Titular/Ajudante)
    v_part_num := substring(COALESCE(v_part_row.part_title, v_part_row.tipo_parte, '') from '^(\d+)');
    
    -- Busca candidato a parceiro na mesma semana
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

    -- Verifica se é parte solo
    IF FOUND THEN
        IF v_part_row.funcao = 'Ajudante' THEN
            v_titular_mod := COALESCE(v_partner_row.modalidade, '');
        ELSE
            v_titular_mod := COALESCE(v_part_row.modalidade, '');
        END IF;
        
        IF v_titular_mod = ANY(v_solo_modalidades) THEN
            v_partner_row := NULL; -- Invalida o parceiro se a modalidade for solo
        END IF;
    END IF;

    -- Busca telefone do parceiro, se houver
    IF v_partner_row IS NOT NULL THEN
        SELECT * INTO v_partner_pub
        FROM publishers
        WHERE btrim(data->>'name') = btrim(COALESCE(v_partner_row.resolved_publisher_name, v_partner_row.raw_publisher_name))
        LIMIT 1;
    END IF;

    -- 6. Retorno consolidado
    RETURN jsonb_build_object(
        'success', true,
        'part', row_to_json(v_part_row),
        'meetingDay', v_meeting_day,
        'partner', CASE 
            WHEN v_partner_row IS NOT NULL THEN
                jsonb_build_object(
                    'name', COALESCE(v_partner_row.resolved_publisher_name, v_partner_row.raw_publisher_name),
                    'funcao', v_partner_row.funcao,
                    'phone', v_partner_pub.data->>'phone'
                )
            ELSE NULL
        END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_part_data(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_part_data(text, text, text) TO anon;

COMMENT ON FUNCTION public.get_portal_part_data(text, text, text) IS
  'Carrega dados da parte e parceiro para o portal de confirmação, bypassando RLS e validando o token.';
