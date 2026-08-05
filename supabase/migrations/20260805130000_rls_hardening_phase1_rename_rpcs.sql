-- =============================================================================
-- MIGRATION: rls_hardening_phase1_rename_rpcs (2026-08-05, follow-up)
-- =============================================================================
-- Aderência ao padrão de nomenclatura pré-existente do repo:
--   - authorize_<contexto>_portal  → autorização + leitura (para portais)
--   - submit_<recurso>_<verbo>     → escrita
-- 
-- Remove portal_availability_save por redundância com submit_publisher_availability
-- (que já existe e é usado por api.submitPublisherAvailability).
-- =============================================================================

DROP FUNCTION IF EXISTS public.portal_availability_save(text, jsonb, jsonb);

ALTER FUNCTION public.portal_availability_authorize(text)
  RENAME TO authorize_availability_portal;

ALTER FUNCTION public.portal_publisher_form_list_weeks(text)
  RENAME TO list_workbook_weeks_for_publisher_form;

ALTER FUNCTION public.portal_preferences_update(text, text, boolean)
  RENAME TO submit_publisher_preference;

COMMENT ON FUNCTION public.authorize_availability_portal(text) IS
  'Autoriza PublisherAvailabilityPortal via token; devolve payload sanitizado.';

COMMENT ON FUNCTION public.list_workbook_weeks_for_publisher_form(text) IS
  'Lista semanas distintas para modais NL/Eventos do PublisherStatusForm; validação por token OU admin bypass.';

COMMENT ON FUNCTION public.submit_publisher_preference(text, text, boolean) IS
  'Atualiza requestedNoParticipation ou isHelperOnly do publisher; autoriza dono (via profiles.publisher_id) ou admin. Fecha vulnerabilidade #3.';
