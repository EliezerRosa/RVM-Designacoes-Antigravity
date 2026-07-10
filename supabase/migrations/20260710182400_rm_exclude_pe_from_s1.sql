-- ============================================================
-- RM — Opção A: Excluir P. Especiais (PE) do S-1 congregacional
-- Decisão Eliezer Rosa, 2026-07-10
--
-- CORREÇÃO: is_special_pioneer e is_regular_pioneer são
-- snapshots históricos em rm.monthly_reports (não em rm.publishers).
-- A view deve referenciar r.is_special_pioneer e r.is_regular_pioneer.
--
-- Fundamento: relatórios de PE vão ao escritório da Filial,
-- NÃO à congregação. O S-1 congregacional deve excluí-los
-- para alinhar com o Glide.
--
-- KPIs alvo junho/2026:
--   total_reports  : 79 → 77  (remove 2 PE's do total da view; falta 1 no DB vs Glide)
--   total_studies  : 47 → 41  (remove estudos dos 2 PE's)
--   pioneer_hours  : 692 → 657 (remove horas dos 2 PE's)
--   regular_pioneer_count: 19  (mantido — não são PE's)
--   special_pioneer_count: 2   (auditoria)
-- ============================================================

CREATE OR REPLACE VIEW rm.v_s1_consolidation
WITH (security_invoker = true) AS
SELECT
    r.reference_year,
    r.reference_month,
    r.congregation_id,

    -- ── Totais do S-1 congregacional (excluindo PE's) ─────────────────────
    COUNT(*) FILTER (WHERE NOT r.is_special_pioneer)                    AS total_reports,
    COUNT(*) FILTER (WHERE r.has_preached AND NOT r.is_special_pioneer) AS total_preached,

    -- ── Contagens EXCLUSIVAS por modalidade de serviço ───────────────────
    -- Publicador: pregou, mas não é aux, regular nem especial
    COUNT(*) FILTER (
        WHERE r.has_preached
          AND NOT r.is_auxiliary_pioneer
          AND NOT r.is_regular_pioneer
          AND NOT r.is_special_pioneer
    )                                                                   AS publisher_count,
    COUNT(*) FILTER (WHERE r.is_auxiliary_pioneer)                      AS auxiliary_pioneer_count,
    COUNT(*) FILTER (WHERE r.is_regular_pioneer AND NOT r.is_auxiliary_pioneer)
                                                                        AS regular_pioneer_count,
    -- special_pioneer_count: mantido para auditoria (NÃO soma nos totais acima)
    COUNT(*) FILTER (WHERE r.is_special_pioneer)                        AS special_pioneer_count,

    -- ── Totais numéricos (S-1 congregacional, sem PE) ─────────────────────
    COALESCE(SUM(r.bible_studies) FILTER (WHERE NOT r.is_special_pioneer), 0)
                                                                        AS total_studies,
    -- pioneer_hours: apenas Pioneiros Regulares (PE excluído do S-1)
    COALESCE(SUM(r.hours) FILTER (
        WHERE r.is_regular_pioneer AND NOT r.is_auxiliary_pioneer
    ), 0)                                                               AS pioneer_hours,
    COALESCE(SUM(r.hours) FILTER (
        WHERE r.is_auxiliary_pioneer
    ), 0)                                                               AS auxiliary_hours,
    COUNT(*) FILTER (WHERE r.is_late_report AND NOT r.is_special_pioneer)
                                                                        AS late_count

FROM rm.monthly_reports r
GROUP BY r.reference_year, r.reference_month, r.congregation_id;

GRANT SELECT ON rm.v_s1_consolidation TO authenticated, service_role;
