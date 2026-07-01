-- ================================================================
-- Restringe a aba 'agent' ao Ajudante SRVM (Servo Ministerial) e Admin.
-- Admin tem bypass automático no código (FULL_ADMIN_PERMISSIONS).
--
-- ANTES: Todas as 7 policies tinham 'agent' em allowed_tabs.
-- DEPOIS: Apenas a policy do Ajudante SRVM (SM) mantém 'agent'.
--
-- Os Anciãos SRVM/CCA/genéricos e Publicadores perdem visibilidade da aba.
-- Funcionalidades da aba workbook/outras permanecem inalteradas.
-- ================================================================

-- Step 1: Remove 'agent' from ALL policies
UPDATE public.permission_policies
SET allowed_tabs = array_remove(allowed_tabs, 'agent'),
    updated_at = now()
WHERE 'agent' = ANY(allowed_tabs)
  AND is_active = true;

-- Step 2: Add 'agent' ONLY to the Ajudante SRVM (Servo Ministerial) policy
UPDATE public.permission_policies
SET allowed_tabs = array_append(allowed_tabs, 'agent'),
    updated_at = now()
WHERE target_funcao = 'Ajudante do Superintendente da Reunião Vida e Ministério'
  AND target_condition = 'Servo Ministerial'
  AND is_active = true
  AND NOT ('agent' = ANY(allowed_tabs));

-- Note: Admin users (profile.role = 'admin') bypass all policy checks
-- via FULL_ADMIN_PERMISSIONS in permissionService.ts — no DB change needed.
-- The SRVM (Ancião) does NOT need 'agent' in policy because he is 'admin' role.
