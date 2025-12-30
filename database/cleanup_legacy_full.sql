-- ============================================================================
-- SCRIPT DE LIMPEZA DO BANCO DE DADOS (LEGADO)
-- DATA: 2025-12-30
-- AUTOR: Antigravity Agent
--
-- ATENÇÃO: ESTE SCRIPT DELETA TABELAS PERMANENTEMENTE.
-- FAÇA BACKUP SE NECESSÁRIO ANTES DE RODAR.
-- ============================================================================

-- 1. Remover tabelas do sistema antigo de designações
DROP TABLE IF EXISTS participations;
DROP TABLE IF EXISTS meetings;
DROP TABLE IF EXISTS assignments; -- Tabela de S-89 legado

-- 2. Remover outras tabelas auxiliares que não são mais usadas (se existirem)
-- (Verifique se 'historical_imports' ainda é usada para log; se não, descomente abaixo)
-- DROP TABLE IF EXISTS historical_imports;

-- 3. Confirmação
-- Se você rodou isso no SQL Editor do Supabase, verifique se as tabelas sumiram da barra lateral.

-- NOTA: As tabelas vitais para o novo sistema (v2.0) são:
-- - publishers (Manter!)
-- - workbook_parts (Manter! Fonte da Verdade)
-- - app_settings (Manter!)
-- - special_events (Manter! Novo recurso)
-- - event_templates (Manter! Novo recurso)

-- FIM DO SCRIPT
