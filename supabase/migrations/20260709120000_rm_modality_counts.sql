-- ============================================================
-- RM — Contagens exclusivas de modalidade de serviço na v_s1_consolidation
-- Invariante de negócio: cada publicador tem UMA modalidade por mês
--   Publicador → nem aux, nem regular, nem especial
--   Pioneiro Auxiliar → is_auxiliary_pioneer (flag no relatório mensal)
--   Pioneiro Regular  → is_regular_pioneer (flag no cadastro do publicador)
--   Pioneiro Especial → is_special_pioneer (flag no cadastro; não exibido no dashboard)
-- As contagens de horas (pioneer_hours, auxiliary_hours) são mantidas para KPIs.
-- ============================================================

CREATE OR REPLACE VIEW rm.v_s1_consolidation
WITH (security_invoker = true) AS
SELECT
    r.reference_year,
    r.reference_month,
    r.congregation_id,
    COUNT(*)                                                            AS total_reports,
    COUNT(*) FILTER (WHERE r.has_preached)                              AS total_preached,
    -- ── Contagens EXCLUSIVAS por modalidade de serviço ───────────────────
    COUNT(*) FILTER (
        WHERE r.has_preached
          AND NOT r.is_auxiliary_pioneer
          AND NOT p.is_regular_pioneer
          AND NOT p.is_special_pioneer
    )                                                                   AS publisher_count,
    COUNT(*) FILTER (WHERE r.is_auxiliary_pioneer)                      AS auxiliary_pioneer_count,
    COUNT(*) FILTER (WHERE p.is_regular_pioneer AND NOT r.is_auxiliary_pioneer)
                                                                        AS regular_pioneer_count,
    -- ── Totais de horas (para KPIs de pioneiros) ─────────────────────────
    COALESCE(SUM(r.bible_studies), 0)                                   AS total_studies,
    COALESCE(SUM(r.hours) FILTER (
        WHERE p.is_regular_pioneer OR p.is_special_pioneer
    ), 0)                                                               AS pioneer_hours,
    COALESCE(SUM(r.hours) FILTER (
        WHERE r.is_auxiliary_pioneer
    ), 0)                                                               AS auxiliary_hours,
    COUNT(*) FILTER (WHERE r.is_late_report)                            AS late_count
FROM rm.monthly_reports r
JOIN rm.publishers p ON p.id = r.publisher_id
GROUP BY r.reference_year, r.reference_month, r.congregation_id;

GRANT SELECT ON rm.v_s1_consolidation TO authenticated, service_role;
