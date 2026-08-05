-- =============================================================================
-- MIGRATION: rls_hardening_phase3_writes_only_editors (2026-08-05)
-- =============================================================================
-- FASE 3a do endurecimento RLS (versão conservadora)
--
-- Substitui as policies "Allow all" USING(true) WITH CHECK(true) por policies
-- restritivas para WRITES; mantém SELECT público para não quebrar leituras
-- anônimas que ainda possam existir.
--
-- Fecha vulnerabilidades #1 (publishers writes) e #2 (workbook_parts writes)
-- do relatório de segurança 2026-08-04.
--
-- SELECT restrito a authenticated (Fase 3b) fica para migração posterior após
-- auditoria confirmar zero acessos anônimos fora das RPCs SECURITY DEFINER.
--
-- Rollback:
--   BEGIN;
--   DROP POLICY publishers_select_public ON public.publishers;
--   DROP POLICY publishers_write_insert_editors ON public.publishers;
--   DROP POLICY publishers_write_update_editors ON public.publishers;
--   DROP POLICY publishers_write_delete_editors ON public.publishers;
--   CREATE POLICY "Allow all" ON public.publishers FOR ALL TO public USING (true) WITH CHECK (true);
--   -- (idem workbook_parts, alterando o nome da policy dropada para
--   --  workbook_parts_select_public + as 3 writes)
--   COMMIT;
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "Allow all" ON public.publishers;

CREATE POLICY publishers_select_public
  ON public.publishers
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY publishers_write_insert_editors
  ON public.publishers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_editor());

CREATE POLICY publishers_write_update_editors
  ON public.publishers
  FOR UPDATE
  TO authenticated
  USING (public.is_editor())
  WITH CHECK (public.is_editor());

CREATE POLICY publishers_write_delete_editors
  ON public.publishers
  FOR DELETE
  TO authenticated
  USING (public.is_editor());

DROP POLICY IF EXISTS "Allow all operations on workbook_parts" ON public.workbook_parts;

CREATE POLICY workbook_parts_select_public
  ON public.workbook_parts
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY workbook_parts_write_insert_editors
  ON public.workbook_parts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_editor());

CREATE POLICY workbook_parts_write_update_editors
  ON public.workbook_parts
  FOR UPDATE
  TO authenticated
  USING (public.is_editor())
  WITH CHECK (public.is_editor());

CREATE POLICY workbook_parts_write_delete_editors
  ON public.workbook_parts
  FOR DELETE
  TO authenticated
  USING (public.is_editor());

COMMIT;
