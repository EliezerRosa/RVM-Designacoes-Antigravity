-- ============================================================
-- RM Fase 1 — Views: consolidação S-1 e cartão S-21
-- ============================================================

-- ------------------------------------------------------------
-- v_s1_consolidation
-- Consolidação mensal por congregação (base do relatório S-1).
-- security_invoker=true: a RLS das tabelas subjacentes se aplica ao chamador.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW rm.v_s1_consolidation
WITH (security_invoker = true) AS
SELECT
    r.reference_year,
    r.reference_month,
    r.congregation_id,
    COUNT(*)                                                  AS total_reports,
    COUNT(*) FILTER (WHERE r.has_preached)                    AS total_preached,
    COALESCE(SUM(r.bible_studies), 0)                         AS total_studies,
    COALESCE(SUM(r.hours) FILTER (
        WHERE p.is_regular_pioneer OR p.is_special_pioneer
    ), 0)                                                     AS pioneer_hours,
    COALESCE(SUM(r.hours) FILTER (
        WHERE r.is_auxiliary_pioneer
    ), 0)                                                     AS auxiliary_hours,
    COUNT(*) FILTER (WHERE r.is_late_report)                  AS late_count
FROM rm.monthly_reports r
JOIN rm.publishers p ON p.id = r.publisher_id
GROUP BY r.reference_year, r.reference_month, r.congregation_id;

-- ------------------------------------------------------------
-- v_s21_publisher_card
-- Garante 12 linhas (meses 1..12) por publicador para cada ano de serviço
-- presente em monthly_reports, mesmo quando o publicador não relatou no mês.
-- security_invoker=true: a RLS das tabelas subjacentes se aplica ao chamador.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW rm.v_s21_publisher_card
WITH (security_invoker = true) AS
WITH publisher_years AS (
    SELECT DISTINCT publisher_id, reference_year
    FROM rm.monthly_reports
)
SELECT
    p.id                              AS publisher_id,
    p.name                            AS publisher_name,
    p.congregation_id,
    p.current_group_id,
    py.reference_year,
    m.reference_month,
    r.id                              AS report_id,
    COALESCE(r.has_preached, false)   AS has_preached,
    r.hours,
    COALESCE(r.bible_studies, 0)      AS bible_studies,
    COALESCE(r.modalities, '{}')      AS modalities,
    COALESCE(r.is_auxiliary_pioneer, false) AS is_auxiliary_pioneer,
    COALESCE(r.is_late_report, false) AS is_late_report,
    r.notes
FROM rm.publishers p
JOIN publisher_years py ON py.publisher_id = p.id
CROSS JOIN generate_series(1, 12) AS m(reference_month)
LEFT JOIN rm.monthly_reports r
    ON r.publisher_id = p.id
   AND r.reference_year = py.reference_year
   AND r.reference_month = m.reference_month;

GRANT SELECT ON rm.v_s1_consolidation TO authenticated, service_role;
GRANT SELECT ON rm.v_s21_publisher_card TO authenticated, service_role;
