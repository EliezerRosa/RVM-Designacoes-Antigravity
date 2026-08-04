-- 20260805000000_fuzzy_phone_preapproval_match.sql
--
-- Objetivo: substituir o match EXATO de nome completo em sync_profile_publisher_link()
-- por uma cascata mais robusta:
--   Fase 1 — telefone exato (normalizado, sem símbolos/divisores), MAS só quando o
--            publicador candidato já tem telefone cadastrado (data->>'phone' ou
--            data->>'contact_phone'). Telefone é sinal mais forte que nome.
--   Fase 2 — fallback: match de nome por FUZZY (mesma lógica de fuzzyMatchName() do
--            zapiGroupSyncService.ts: 1º nome exato OU Levenshtein<=1 com ambos>=4
--            chars, + contagem de sobrenomes em comum), em vez da igualdade estrita
--            anterior (normalize_identity_text(name) = candidate_name).
--
-- Motivação: profiles.phone só é populado após o fluxo manual de 2FA (verify_whatsapp_auth_code).
-- Um perfil que falhou no match por nome no 1º login mas depois verificou WhatsApp manualmente
-- (ficando "órfão": whatsapp_verified=true, publisher_id=null) agora pode ser religado no
-- próximo fetchProfile() por telefone exato — sinal mais confiável que nome.
--
-- Mantém a exigência de match ÚNICO (count=1) para linkar automaticamente, preservando a
-- postura conservadora já existente (evita falso positivo de auto-aprovação de 2FA).

-- ── Helpers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION normalize_phone_text(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_clean text;
BEGIN
    v_clean := regexp_replace(coalesce(p_value, ''), '\D', '', 'g');
    IF v_clean LIKE '55%' AND length(v_clean) > 11 THEN
        v_clean := substring(v_clean from 3);
    END IF;
    RETURN v_clean;
END;
$$;

COMMENT ON FUNCTION normalize_phone_text(text) IS
    'Normaliza telefone: remove tudo que não é dígito e o prefixo 55 quando sobra DDD+numero (>11 dígitos). Espelha normalizePhone() em zapiGroupSyncService.ts.';

CREATE OR REPLACE FUNCTION remove_accents_pt(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT translate(
        lower(coalesce(p_value, '')),
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'
    );
$$;

CREATE OR REPLACE FUNCTION levenshtein_distance(p_a text, p_b text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    la integer := length(p_a);
    lb integer := length(p_b);
    v0 integer[];
    v1 integer[];
    i integer;
    j integer;
    v_cost integer;
BEGIN
    IF la = 0 THEN RETURN lb; END IF;
    IF lb = 0 THEN RETURN la; END IF;

    v0 := array_fill(0, ARRAY[lb + 1]);
    v1 := array_fill(0, ARRAY[lb + 1]);

    FOR j IN 0..lb LOOP
        v0[j + 1] := j;
    END LOOP;

    FOR i IN 1..la LOOP
        v1[1] := i;
        FOR j IN 1..lb LOOP
            v_cost := CASE WHEN substr(p_a, i, 1) = substr(p_b, j, 1) THEN 0 ELSE 1 END;
            v1[j + 1] := least(v1[j] + 1, v0[j + 1] + 1, v0[j] + v_cost);
        END LOOP;
        FOR j IN 0..lb LOOP
            v0[j + 1] := v1[j + 1];
        END LOOP;
    END LOOP;

    RETURN v1[lb + 1];
END;
$$;

CREATE OR REPLACE FUNCTION clean_name_tokens(p_value text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_noise text[] := ARRAY[
        'sem','nome','nao','identificado','estudante','publicador','parque','jacaraipe',
        'estancia','sao','patricio','pioneiro','auxiliar','regular','irmao','irma',
        'de','da','do','dos','das'
    ];
    v_clean text;
    v_tokens text[];
BEGIN
    v_clean := regexp_replace(remove_accents_pt(p_value), '[^a-z0-9\s]', ' ', 'g');
    SELECT array_agg(w) INTO v_tokens
    FROM unnest(regexp_split_to_array(trim(v_clean), '\s+')) AS w
    WHERE length(w) > 1 AND NOT (w = ANY(v_noise));
    RETURN coalesce(v_tokens, ARRAY[]::text[]);
END;
$$;

-- Porta fiel de fuzzyMatchName() (zapiGroupSyncService.ts): 1º nome exato OU
-- Levenshtein<=1 (ambos >=4 chars), mais contagem de sobrenomes em comum.
CREATE OR REPLACE FUNCTION fuzzy_match_name(p_name_a text, p_name_b text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_tokens_a text[];
    v_tokens_b text[];
    v_first_a text;
    v_first_b text;
    v_first_matches boolean;
    v_surname_count integer := 0;
    i integer;
    j integer;
BEGIN
    IF p_name_a IS NULL OR trim(p_name_a) = ''
        OR p_name_a ILIKE '%sem nome%' OR p_name_a ILIKE '%nao identificado%'
        OR p_name_a ILIKE '%não identificado%' THEN
        RETURN false;
    END IF;

    v_tokens_a := clean_name_tokens(p_name_a);
    v_tokens_b := clean_name_tokens(p_name_b);

    IF array_length(v_tokens_a, 1) IS NULL OR array_length(v_tokens_b, 1) IS NULL THEN
        RETURN false;
    END IF;

    v_first_a := v_tokens_a[1];
    v_first_b := v_tokens_b[1];

    v_first_matches := (v_first_a = v_first_b) OR (
        length(v_first_a) >= 4 AND length(v_first_b) >= 4
        AND levenshtein_distance(v_first_a, v_first_b) <= 1
    );

    IF array_length(v_tokens_a, 1) >= 2 AND array_length(v_tokens_b, 1) >= 2 THEN
        FOR i IN 2..array_length(v_tokens_a, 1) LOOP
            FOR j IN 2..array_length(v_tokens_b, 1) LOOP
                IF v_tokens_a[i] = v_tokens_b[j] THEN
                    v_surname_count := v_surname_count + 1;
                    EXIT;
                END IF;
            END LOOP;
        END LOOP;
    END IF;

    IF v_first_matches AND (array_length(v_tokens_b, 1) <= 2 OR v_surname_count >= 1) THEN
        RETURN true;
    END IF;

    IF v_surname_count >= 2 AND v_first_matches THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;

-- ── Função principal (substitui o match exato de nome) ─────────────────────

CREATE OR REPLACE FUNCTION sync_profile_publisher_link()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile profiles%ROWTYPE;
    v_candidate_name text;
    v_phone_norm text;
    v_match_count integer;
    v_publisher_id text;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;

    SELECT *
    INTO v_profile
    FROM profiles
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
    END IF;

    IF v_profile.role = 'admin' THEN
        RETURN jsonb_build_object('success', true, 'publisher_id', v_profile.publisher_id, 'matched', false, 'reason', 'admin');
    END IF;

    IF v_profile.publisher_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'publisher_id', v_profile.publisher_id, 'matched', true, 'reason', 'already_linked');
    END IF;

    -- Fase 1: telefone exato normalizado, só contra publicadores que já têm telefone cadastrado.
    v_phone_norm := normalize_phone_text(v_profile.phone);

    IF v_phone_norm <> '' THEN
        WITH phone_matches AS (
            SELECT p.id
            FROM publishers p
            WHERE normalize_phone_text(coalesce(p.data->>'phone', p.data->>'contact_phone', '')) <> ''
              AND normalize_phone_text(coalesce(p.data->>'phone', p.data->>'contact_phone', '')) = v_phone_norm
        )
        SELECT count(*), min(id)
        INTO v_match_count, v_publisher_id
        FROM phone_matches;

        IF v_match_count = 1 AND v_publisher_id IS NOT NULL THEN
            UPDATE profiles
            SET publisher_id = v_publisher_id,
                updated_at = now()
            WHERE id = auth.uid();

            PERFORM consume_whatsapp_2fa_preapproval(v_publisher_id, auth.uid());

            RETURN jsonb_build_object('success', true, 'publisher_id', v_publisher_id, 'matched', true, 'reason', 'linked_by_phone');
        END IF;

        IF v_match_count > 1 THEN
            RETURN jsonb_build_object('success', true, 'publisher_id', null, 'matched', false, 'reason', 'ambiguous_phone');
        END IF;
    END IF;

    -- Fase 2: fallback por nome fuzzy (substitui a igualdade estrita anterior).
    v_candidate_name := normalize_identity_text(v_profile.full_name);

    IF v_candidate_name = '' THEN
        RETURN jsonb_build_object('success', true, 'publisher_id', null, 'matched', false, 'reason', 'missing_full_name');
    END IF;

    WITH possible_matches AS (
        SELECT p.id
        FROM publishers p
        WHERE fuzzy_match_name(v_profile.full_name, p.data->>'name')
           OR EXISTS (
               SELECT 1
               FROM jsonb_array_elements_text(coalesce(p.data->'aliases', '[]'::jsonb)) AS alias(value)
               WHERE fuzzy_match_name(v_profile.full_name, alias.value)
           )
    )
    SELECT count(*), min(id)
    INTO v_match_count, v_publisher_id
    FROM possible_matches;

    IF v_match_count = 1 AND v_publisher_id IS NOT NULL THEN
        UPDATE profiles
        SET publisher_id = v_publisher_id,
            updated_at = now()
        WHERE id = auth.uid();

        PERFORM consume_whatsapp_2fa_preapproval(v_publisher_id, auth.uid());

        RETURN jsonb_build_object('success', true, 'publisher_id', v_publisher_id, 'matched', true, 'reason', 'linked_by_name_fuzzy');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'publisher_id', null,
        'matched', false,
        'reason', CASE WHEN v_match_count > 1 THEN 'ambiguous_name' ELSE 'no_match' END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION sync_profile_publisher_link() TO authenticated;
