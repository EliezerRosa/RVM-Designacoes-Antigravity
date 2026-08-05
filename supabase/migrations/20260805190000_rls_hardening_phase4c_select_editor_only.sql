-- =============================================================================
-- RLS Hardening — Fase 4c: SELECT só para editors (bloqueio DevTools)
-- =============================================================================
-- Depois desta migration:
--   • Publicador comum via DevTools:
--       SELECT * FROM publishers;      → 0 rows
--       SELECT * FROM workbook_parts;  → 0 rows
--   • Publicador comum via app:
--       supabase.rpc('get_publisher_self')     → seu registro curado
--       supabase.rpc('get_my_workbook_parts')  → suas partes curadas
--       supabase.rpc('get_my_permissions')     → flags computadas
--   • Editor via qualquer caminho: acesso total (is_editor() = true)
--   • Admin via qualquer caminho: acesso total (is_editor() vira true em role=admin)
--   • anon: sem acesso (mantido da Fase 3b via REVOKE)
--
-- Rollback:
--   DROP POLICY publishers_select_editor_only ON public.publishers;
--   DROP POLICY workbook_parts_select_editor_only ON public.workbook_parts;
--   CREATE POLICY publishers_select_authenticated ON public.publishers
--     FOR SELECT TO authenticated USING (true);
--   CREATE POLICY workbook_parts_select_authenticated ON public.workbook_parts
--     FOR SELECT TO authenticated USING (true);
-- =============================================================================

-- publishers: SELECT só para editor
DROP POLICY IF EXISTS publishers_select_authenticated ON public.publishers;
DROP POLICY IF EXISTS publishers_select_editor_only ON public.publishers;

CREATE POLICY publishers_select_editor_only ON public.publishers
  FOR SELECT
  TO authenticated
  USING (public.is_editor());

-- workbook_parts: SELECT só para editor
DROP POLICY IF EXISTS workbook_parts_select_authenticated ON public.workbook_parts;
DROP POLICY IF EXISTS workbook_parts_select_editor_only ON public.workbook_parts;

CREATE POLICY workbook_parts_select_editor_only ON public.workbook_parts
  FOR SELECT
  TO authenticated
  USING (public.is_editor());

COMMENT ON POLICY publishers_select_editor_only ON public.publishers IS
  'Fase 4c RLS hardening (2026-08-05): SELECT direto restrito a editores. '
  'Publicador comum deve usar RPC get_publisher_self() SECURITY DEFINER.';

COMMENT ON POLICY workbook_parts_select_editor_only ON public.workbook_parts IS
  'Fase 4c RLS hardening (2026-08-05): SELECT direto restrito a editores. '
  'Publicador comum deve usar RPC get_my_workbook_parts() SECURITY DEFINER.';
