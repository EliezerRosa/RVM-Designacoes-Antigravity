-- ============================================================
-- Script: Atualizar Status das Partes da Apostila
-- Data: 2025-12-31
-- ============================================================

-- A semana atual (31/12/2025) começa em 29/12/2025 (segunda-feira)
-- Semana de 12/01/2026 começa em 12/01/2026

-- ============================================================
-- 1. Semanas PASSADAS (antes de 29/12/2025) COM publicador
--    Setar status = 'CONCLUIDA'
-- ============================================================

UPDATE workbook_parts
SET status = 'CONCLUIDA',
    updated_at = NOW()
WHERE date < '2025-12-29'
  AND raw_publisher_name IS NOT NULL 
  AND raw_publisher_name != '';

-- Verificar quantas foram atualizadas
-- SELECT COUNT(*) as total_concluidas 
-- FROM workbook_parts 
-- WHERE status = 'CONCLUIDA' AND date < '2025-12-29';

-- ============================================================
-- 2. Semanas ATUAIS até 12/01/2026 COM publicador
--    Setar status = 'APROVADA'
-- ============================================================

UPDATE workbook_parts
SET status = 'APROVADA',
    updated_at = NOW()
WHERE date >= '2025-12-29'
  AND date <= '2026-01-18'  -- Domingo da semana de 12-18 de janeiro
  AND raw_publisher_name IS NOT NULL 
  AND raw_publisher_name != '';

-- Verificar quantas foram atualizadas
-- SELECT COUNT(*) as total_aprovadas 
-- FROM workbook_parts 
-- WHERE status = 'APROVADA' AND date >= '2025-12-29' AND date <= '2026-01-18';

-- ============================================================
-- Resumo: Verificar distribuição de status
-- ============================================================
-- SELECT status, COUNT(*) as total
-- FROM workbook_parts
-- GROUP BY status
-- ORDER BY total DESC;
