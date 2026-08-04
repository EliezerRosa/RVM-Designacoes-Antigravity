-- 2026-08-04 — Pré-aprovação de 2FA via verificação de grupo do WhatsApp
--
-- Contexto: o admin audita a lista de participantes do grupo oficial do WhatsApp
-- da congregação e confirma visualmente que cada número de telefone pertence à
-- pessoa identificada como aquele publicador ("Sincronizar Telefones e Aprovar
-- 2FA" em ZApiGroupSyncModal.tsx). Essa verificação NÃO pode criar um `profiles`
-- diretamente — `profiles.id` é FK obrigatória para `auth.users`, só existe após
-- o primeiro login (Google OAuth). O que ela PODE fazer é registrar a decisão do
-- admin para ser aplicada automaticamente no momento em que o publicador vier a
-- ser vinculado a um profile (1º login com auto-match por nome, ou vínculo
-- manual pelo admin).
--
-- Escopo: só afeta os publicadores explicitamente selecionados/ticados pelo
-- admin nesta rodada (não é uma regra geral de "confiar no grupo" para sempre;
-- novos membros futuros do grupo seguem o fluxo padrão de 2FA).

CREATE TABLE IF NOT EXISTS whatsapp_2fa_preapprovals (
    publisher_id text PRIMARY KEY REFERENCES publishers(id) ON DELETE CASCADE,
    phone text,
    reason text NOT NULL DEFAULT 'whatsapp_group_verified',
    preapproved_by uuid REFERENCES auth.users(id),
    preapproved_at timestamptz NOT NULL DEFAULT now(),
    consumed_at timestamptz,
    consumed_profile_id uuid REFERENCES profiles(id)
);

ALTER TABLE whatsapp_2fa_preapprovals ENABLE ROW LEVEL SECURITY;

-- Só admin pode ler/escrever diretamente na tabela (as RPCs SECURITY DEFINER
-- abaixo contornam RLS internamente, pois rodam com o dono da função).
DROP POLICY IF EXISTS "admin manages whatsapp_2fa_preapprovals" ON whatsapp_2fa_preapprovals;
CREATE POLICY "admin manages whatsapp_2fa_preapprovals"
    ON whatsapp_2fa_preapprovals
    FOR ALL
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Consome a pré-aprovação (se existir e ainda não tiver sido consumida) para o
-- publisher_id recém-vinculado a um profile. Chamada internamente por
-- sync_profile_publisher_link() (auto-match por nome no 1º login) e por
-- admin_link_profile_to_publisher() (vínculo manual pelo admin).
CREATE OR REPLACE FUNCTION consume_whatsapp_2fa_preapproval(p_publisher_id text, p_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_found boolean := false;
BEGIN
    UPDATE whatsapp_2fa_preapprovals
    SET consumed_at = now(), consumed_profile_id = p_profile_id
    WHERE publisher_id = p_publisher_id
      AND consumed_at IS NULL
    RETURNING true INTO v_found;

    IF v_found THEN
        UPDATE profiles
        SET whatsapp_verified = true,
            updated_at = now()
        WHERE id = p_profile_id;
    END IF;

    RETURN coalesce(v_found, false);
END;
$$;

GRANT EXECUTE ON FUNCTION consume_whatsapp_2fa_preapproval(text, uuid) TO authenticated;

-- Hook 1: reaplica sync_profile_publisher_link() consumindo a pré-aprovação
-- imediatamente após o auto-match por nome no primeiro login.
CREATE OR REPLACE FUNCTION sync_profile_publisher_link()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile profiles%ROWTYPE;
    v_candidate_name text;
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

    v_candidate_name := normalize_identity_text(v_profile.full_name);

    IF v_candidate_name = '' THEN
        RETURN jsonb_build_object('success', true, 'publisher_id', null, 'matched', false, 'reason', 'missing_full_name');
    END IF;

    WITH possible_matches AS (
        SELECT p.id
        FROM publishers p
        WHERE normalize_identity_text(p.data->>'name') = v_candidate_name
           OR EXISTS (
               SELECT 1
               FROM jsonb_array_elements_text(coalesce(p.data->'aliases', '[]'::jsonb)) AS alias(value)
               WHERE normalize_identity_text(alias.value) = v_candidate_name
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

        RETURN jsonb_build_object('success', true, 'publisher_id', v_publisher_id, 'matched', true, 'reason', 'linked_by_name');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'publisher_id', null,
        'matched', false,
        'reason', CASE WHEN v_match_count > 1 THEN 'ambiguous_match' ELSE 'no_match' END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION sync_profile_publisher_link() TO authenticated;

-- Hook 2: consome a pré-aprovação imediatamente após o vínculo manual pelo admin.
CREATE OR REPLACE FUNCTION admin_link_profile_to_publisher(
    p_profile_id uuid,
    p_publisher_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile profiles%ROWTYPE;
    v_publisher_email text;
    v_publisher_exists boolean;
BEGIN
    PERFORM admin_assert_admin();

    SELECT * INTO v_profile FROM profiles WHERE id = p_profile_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
    END IF;

    SELECT EXISTS(SELECT 1 FROM publishers WHERE id = p_publisher_id) INTO v_publisher_exists;
    IF NOT v_publisher_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'publisher_not_found');
    END IF;

    UPDATE profiles
    SET publisher_id = p_publisher_id, updated_at = now()
    WHERE id = p_profile_id;

    PERFORM consume_whatsapp_2fa_preapproval(p_publisher_id, p_profile_id);

    -- Espelha o e-mail do profile no publisher se ainda vazio
    SELECT lower(coalesce(data->>'email', '')) INTO v_publisher_email
    FROM publishers WHERE id = p_publisher_id;

    IF (v_publisher_email IS NULL OR v_publisher_email = '')
        AND v_profile.email IS NOT NULL AND v_profile.email <> '' THEN
        UPDATE publishers
        SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{email}', to_jsonb(lower(v_profile.email)), true)
        WHERE id = p_publisher_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'publisher_id', p_publisher_id, 'profile_id', p_profile_id);
END;
$$;
