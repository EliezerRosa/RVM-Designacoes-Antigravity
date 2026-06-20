-- ============================================================
-- Migration: Add 'workbook' tab to SRVM and Ajudante
-- ============================================================

UPDATE permission_policies 
SET allowed_tabs = array_append(allowed_tabs, 'workbook')
WHERE target_funcao = 'Ajudante do Superintendente da Reunião Vida e Ministério' 
  AND NOT ('workbook' = ANY(allowed_tabs));

UPDATE permission_policies 
SET allowed_tabs = array_append(allowed_tabs, 'workbook')
WHERE target_funcao = 'Superintendente da Reunião Vida e Ministério' 
  AND NOT ('workbook' = ANY(allowed_tabs));
