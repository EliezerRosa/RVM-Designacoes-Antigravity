-- =============================================================================
-- Migration: 20261009200000_agent_action_server_gate.sql
-- Descrição: Revalidação SERVER-SIDE das permissões granulares do agente.
--
-- Contexto (auditoria 2026-10-09, docs/auditoria-agente-permissoes-2026-10-09.md):
--   • RLS (Fases 3/4c) garante que só `is_editor()` lê/escreve em publishers e
--     workbook_parts — mas é binário. As permissões GRANULARES por ação
--     (permission_policies.allowed_agent_actions / blocked_agent_actions e
--     user_permission_overrides) eram avaliadas apenas no cliente
--     (permissionService.createPermissionGate → canAgentAction).
--   • Esta migration espelha exatamente essa resolução no banco, para que
--     `agentActionService.executeAction` revalide ações de ESCRITA
--     (GENERATE_WEEK, ASSIGN_PART, CLEAR_WEEK, UPDATE_PUBLISHER, ...) antes de gravar.
--
-- Regras espelhadas do cliente (manter sincronizado com permissionService.ts):
--   1. auth.uid() nulo → false
--   2. profiles.role = 'admin' → true
--   3. ADMIN_ONLY_ACTIONS ('MANAGE_PERMISSIONS') → false para não-admin
--   4. policy = maior priority ativa com (target_condition IS NULL OR = condition)
--      AND (target_funcao IS NULL OR = funcao)
--   5. sem policy → FALLBACK (apenas leituras)
--   6. override ativo: allowed_agent_actions substitui; blocked é unido ao da policy
--   7. blocked vence allowed
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.assert_agent_action(text);
--   DROP FUNCTION IF EXISTS public.can_agent_action(text);
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_agent_action(p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_role       text;
  v_pub_id     text;
  v_condition  text;
  v_funcao     text;
  v_policy     public.permission_policies%ROWTYPE;
  v_override   public.user_permission_overrides%ROWTYPE;
  v_allowed    text[];
  v_blocked    text[];
  c_fallback   CONSTANT text[] := ARRAY[
    'CHECK_SCORE','EXPLAIN_SCORE','EXPLAIN_PART','EXPLAIN_RANKING','GET_ENGINE_RULES',
    'GET_ELIGIBILITY_VERSION','FETCH_DATA','GET_ANALYTICS','NAVIGATE_WEEK','VIEW_S140',
    'SHOW_MODAL','QUERY_PUBLISHER_ASSIGNMENTS','QUERY_WEEK_ASSIGNMENTS','QUERY_VACANT_PARTS',
    'QUERY_ELIGIBILITY','QUERY_PUBLISHER_PROFILE','QUERY_PUBLISHER_LIST'
  ];
BEGIN
  IF v_uid IS NULL OR p_action IS NULL THEN
    RETURN false;
  END IF;

  SELECT role, publisher_id INTO v_role, v_pub_id
  FROM public.profiles WHERE id = v_uid;

  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  -- Hard-gate: funcionalidades exclusivas da aba Admin
  IF p_action IN ('MANAGE_PERMISSIONS') THEN
    RETURN false;
  END IF;

  IF v_pub_id IS NOT NULL THEN
    SELECT data->>'condition', data->>'funcao' INTO v_condition, v_funcao
    FROM public.publishers WHERE id = v_pub_id;
  END IF;

  SELECT * INTO v_policy
  FROM public.permission_policies
  WHERE is_active = true
    AND (target_condition IS NULL OR target_condition = v_condition)
    AND (target_funcao   IS NULL OR target_funcao   = v_funcao)
  ORDER BY priority DESC, created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN p_action = ANY(c_fallback);
  END IF;

  SELECT * INTO v_override
  FROM public.user_permission_overrides
  WHERE profile_id = v_uid AND is_active = true
  LIMIT 1;

  IF FOUND THEN
    v_allowed := COALESCE(v_override.allowed_agent_actions, v_policy.allowed_agent_actions);
    v_blocked := COALESCE(v_policy.blocked_agent_actions, '{}') || COALESCE(v_override.blocked_agent_actions, '{}');
  ELSE
    v_allowed := v_policy.allowed_agent_actions;
    v_blocked := COALESCE(v_policy.blocked_agent_actions, '{}');
  END IF;

  IF p_action = ANY(v_blocked) THEN
    RETURN false;
  END IF;

  RETURN p_action = ANY(COALESCE(v_allowed, '{}'));
END;
$$;

REVOKE ALL ON FUNCTION public.can_agent_action(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_agent_action(text) TO authenticated;

COMMENT ON FUNCTION public.can_agent_action(text) IS
  'Espelho server-side de permissionService.canAgentAction (policy por condição+função, override, blocked, ADMIN_ONLY). '
  'Usado por assert_agent_action para revalidar escritas do agente. 2026-10-09.';

-- Lança 42501 (insufficient_privilege) quando a ação não é permitida.
CREATE OR REPLACE FUNCTION public.assert_agent_action(p_action text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_agent_action(p_action) THEN
    RAISE EXCEPTION 'agent_action_denied: % não permitida para este perfil', p_action
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_agent_action(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assert_agent_action(text) TO authenticated;

COMMENT ON FUNCTION public.assert_agent_action(text) IS
  'Falha com 42501 se can_agent_action(p_action) for falso. Chamada por agentActionService antes de ações de escrita. 2026-10-09.';
