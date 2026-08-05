-- =============================================================================
-- RLS Hardening — Fase 4a: RPCs curadas SECURITY DEFINER
-- =============================================================================
-- Aditivo. Zero breakage. Cria funções que expõem SOMENTE campos permitidos
-- ao publicador comum sobre seu próprio registro, para que a Fase 4c possa
-- restringir SELECT direto na tabela crua sem quebrar o portal do publicador.
--
-- Campos ocultados do próprio publicador (decisão Eliezer 2026-08-05):
--   publishers.data:
--     - notQualifiedReason, restrictions, requestedNoParticipation (pastoral)
--     - privileges, privilegesBySection (pastoral agregado)
--     - profileMeta, aliases (metadados internos)
--     - isNotQualified, isServing (flags derivadas)
--   workbook_parts:
--     - reassignment_reason, reassignment_marked_at, needs_reassignment
--     - raw_publisher_name, match_confidence, is_manual_override,
--       is_chairman_derived, had_refusal (bastidor de matching)
--     - approved_by_id, approved_at, rejected_reason, cancel_reason
--       (fluxo aprovação editor)
--     - pending_event_id, affected_by_event_id, created_by_event_id (eventos)
--     - batch_id, status_changed_at, local_needs_theme (bastidor)
--
-- Rollback: DROP FUNCTION public.get_publisher_self();
--           DROP FUNCTION public.get_my_workbook_parts();
--           DROP FUNCTION public.get_my_permissions();
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. get_publisher_self() — retorna registro próprio, colunas curadas
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_publisher_self()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'data', jsonb_build_object(
      'name',                    p.data->>'name',
      'gender',                  p.data->>'gender',
      'ageGroup',                p.data->>'ageGroup',
      'condition',               p.data->>'condition',
      'funcao',                  p.data->>'funcao',
      'isBaptized',              (p.data->>'isBaptized')::boolean,
      'isHelperOnly',            COALESCE((p.data->>'isHelperOnly')::boolean, false),
      'spouseId',                p.data->>'spouseId',
      'parentIds',               COALESCE(p.data->'parentIds', '[]'::jsonb),
      'canPairWithNonParent',    COALESCE((p.data->>'canPairWithNonParent')::boolean, false),
      'phone',                   p.data->>'phone',
      'contact_phone',           p.data->>'contact_phone',
      'email',                   p.data->>'email',
      'availability',            COALESCE(p.data->'availability', '[]'::jsonb),
      'availabilityMeta',        COALESCE(p.data->'availabilityMeta', '{}'::jsonb)
      -- OCULTOS DO PRÓPRIO (só editor lê via tabela crua):
      --   notQualifiedReason, restrictions, requestedNoParticipation,
      --   privileges, privilegesBySection, profileMeta, aliases,
      --   isNotQualified, isServing
    )
  )
  FROM public.publishers p
  JOIN public.profiles pr ON pr.publisher_id = p.id
  WHERE pr.id = auth.uid()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_publisher_self() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_publisher_self() TO authenticated;

COMMENT ON FUNCTION public.get_publisher_self() IS
  'Retorna o publisher próprio (linked via profiles.publisher_id) com colunas '
  'curadas — oculta campos pastorais mesmo do próprio publicador. '
  'Bypassa RLS via SECURITY DEFINER. Fase 4a do RLS hardening (2026-08-05).';

-- -----------------------------------------------------------------------------
-- 2. get_my_workbook_parts() — retorna partes designadas ao próprio, curadas
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_workbook_parts()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(t) FROM (
    SELECT
      wp.id,
      wp.week_id,
      wp.week_display,
      wp.date,
      wp.section,
      wp.tipo_parte,
      wp.part_title,
      wp.descricao,
      wp.seq,
      wp.funcao,
      wp.duracao,
      wp.hora_inicio,
      wp.hora_fim,
      wp.resolved_publisher_id,
      wp.resolved_publisher_name,
      wp.status,
      wp.year,
      wp.modalidade,
      wp.detalhes_parte,
      wp.original_duration,
      wp.completed_at,
      wp.created_at,
      wp.updated_at
      -- OCULTOS DO DESIGNADO:
      --   reassignment_reason, reassignment_marked_at, needs_reassignment,
      --   raw_publisher_name, match_confidence, is_manual_override,
      --   is_chairman_derived, had_refusal, approved_by_id, approved_at,
      --   rejected_reason, cancel_reason, pending_event_id,
      --   affected_by_event_id, created_by_event_id, batch_id,
      --   status_changed_at, local_needs_theme
    FROM public.workbook_parts wp
    WHERE wp.resolved_publisher_id = (
      SELECT publisher_id
      FROM public.profiles
      WHERE id = auth.uid()
      LIMIT 1
    )
    ORDER BY wp.year DESC, wp.week_id DESC, wp.seq
  ) t
$$;

REVOKE ALL ON FUNCTION public.get_my_workbook_parts() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_workbook_parts() TO authenticated;

COMMENT ON FUNCTION public.get_my_workbook_parts() IS
  'Retorna as partes onde o publisher próprio está designado, com colunas '
  'curadas — oculta bastidor de matching, aprovação, reassign e eventos. '
  'Bypassa RLS via SECURITY DEFINER. Fase 4a (2026-08-05).';

-- -----------------------------------------------------------------------------
-- 3. get_my_permissions() — retorna flags de permissão computadas
-- -----------------------------------------------------------------------------
-- Necessário porque permissionService hoje lê publishers.data->>'isNotQualified'
-- diretamente. Esta RPC entrega apenas os booleans/labels que a UI precisa,
-- sem expor os inputs pastorais crus.
CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT
      pr.id             AS profile_id,
      pr.role           AS profile_role,
      pr.publisher_id   AS publisher_id,
      p.data            AS pdata
    FROM public.profiles pr
    LEFT JOIN public.publishers p ON p.id = pr.publisher_id
    WHERE pr.id = auth.uid()
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'profileId',        me.profile_id,
    'profileRole',      me.profile_role,
    'publisherId',      me.publisher_id,
    'isAdmin',          me.profile_role = 'admin',
    'isEditor',         public.is_editor(),
    'condition',        me.pdata->>'condition',
    'funcao',           me.pdata->>'funcao',
    'isNotQualified',   COALESCE((me.pdata->>'isNotQualified')::boolean, false),
    'isServing',        COALESCE((me.pdata->>'isServing')::boolean, true),
    'isHelperOnly',     COALESCE((me.pdata->>'isHelperOnly')::boolean, false),
    'isBaptized',       COALESCE((me.pdata->>'isBaptized')::boolean, false),
    'name',             me.pdata->>'name'
  ) FROM me
$$;

REVOKE ALL ON FUNCTION public.get_my_permissions() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;

COMMENT ON FUNCTION public.get_my_permissions() IS
  'Retorna flags de permissão computadas para o próprio profile+publisher. '
  'Substitui a leitura direta de publishers.data->>''isNotQualified'' pelo '
  'permissionService. Bypassa RLS via SECURITY DEFINER. Fase 4a (2026-08-05).';
