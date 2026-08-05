-- =============================================================================
-- MIGRATION: rls_hardening_phase3b_select_authenticated_only (2026-08-05)
-- =============================================================================
-- FASE 3b — SELECT restrito a authenticated + REVOKE completo do anon
--
-- Complementa Fase 3a (writes restritos). Auditoria de 12 arquivos com
-- 35+ acessos a publishers e 17 arquivos com 87+ acessos a workbook_parts
-- confirmou que TODOS os portais anônimos usam RPCs SECURITY DEFINER:
--   * MyAssignmentsPortal → get_portal_responses_for_week + authorize_my_assignments_portal
--   * DesignationConfirmationPortal → authorize_confirmation_portal + submit_confirmation_portal_response
--   * InvitePortal → useAuth only, nenhum SELECT direto
--   * PublisherStatusForm → list_workbook_weeks_for_publisher_form + authorize_publisher_form_token
--   * PublisherAvailabilityPortal → authorize_availability_portal + list_future_parts_for_availability_portal + submit_publisher_availability
-- Portais que fazem SELECT direto (ReplacementPortal, PreferencesPortal)
-- exigem login via useAuth().signInWithGoogle() → rodam sob role authenticated.
--
-- Fecha vulnerabilidade #3 (leitura anônima de publishers/workbook_parts).
-- Defense-in-depth: REVOKE mesmo com policies bloqueando.
--
-- Validação pós-aplicação:
--   SET LOCAL role = 'anon'; SELECT COUNT(*) FROM public.publishers;
--   → ERROR 42501: permission denied for table publishers ✅
--
--   SET LOCAL role = 'anon'; SELECT public.authorize_availability_portal('bogus');
--   → {"authorized":false, "reason":"invalid_or_revoked_token"} ✅ (RPC OK)
--
-- Rollback:
--   BEGIN;
--   DROP POLICY publishers_select_authenticated ON public.publishers;
--   CREATE POLICY publishers_select_public ON public.publishers FOR SELECT TO public USING (true);
--   GRANT SELECT ON public.publishers TO anon;
--   DROP POLICY workbook_parts_select_authenticated ON public.workbook_parts;
--   CREATE POLICY workbook_parts_select_public ON public.workbook_parts FOR SELECT TO public USING (true);
--   GRANT SELECT ON public.workbook_parts TO anon;
--   COMMIT;
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS publishers_select_public ON public.publishers;

CREATE POLICY publishers_select_authenticated
  ON public.publishers
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.publishers FROM anon;

DROP POLICY IF EXISTS workbook_parts_select_public ON public.workbook_parts;

CREATE POLICY workbook_parts_select_authenticated
  ON public.workbook_parts
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.workbook_parts FROM anon;

COMMIT;
