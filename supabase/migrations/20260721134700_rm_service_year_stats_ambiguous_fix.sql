DROP FUNCTION IF EXISTS public.rm_get_service_year_stats(int, uuid);
DROP FUNCTION IF EXISTS rm.get_service_year_stats(int, uuid);

CREATE OR REPLACE FUNCTION rm.get_service_year_stats(p_service_year int, p_congregation_id uuid)
RETURNS TABLE (
    reference_year int,
    reference_month int,
    congregation_id uuid,
    total_reports int,
    total_preached int,
    publisher_count int,
    auxiliary_pioneer_count int,
    regular_pioneer_count int,
    special_pioneer_count int,
    total_studies int,
    pioneer_hours numeric,
    auxiliary_hours numeric,
    late_count int,
    inactive_count int,
    irregular_count int,
    removed_count int,
    readmitted_count int,
    is_closed boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_month_date date;
    v_start_date date;
    v_end_date date;
    v_month int;
    v_year int;
    v_month_idx int;
BEGIN
    v_start_date := make_date(p_service_year - 1, 9, 1);
    
    FOR i IN 0..11 LOOP
        v_month_date := v_start_date + (i || ' months')::interval;
        v_year := extract(year from v_month_date);
        v_month := extract(month from v_month_date);
        v_month_idx := v_year * 12 + v_month;
        
        RETURN QUERY
        WITH s1 AS (
            SELECT * FROM rm.v_s1_consolidation 
            WHERE v_s1_consolidation.reference_year = v_year 
              AND v_s1_consolidation.reference_month = v_month
              AND v_s1_consolidation.congregation_id = p_congregation_id
        ),
        pub_stats AS (
            SELECT p.id,
                   (SELECT count(DISTINCT r.reference_year * 12 + r.reference_month)
                    FROM rm.monthly_reports r
                    WHERE r.publisher_id = p.id
                      AND r.has_preached = true
                      AND (r.reference_year * 12 + r.reference_month) BETWEEN (v_month_idx - 5) AND v_month_idx
                   ) as months_preached
            FROM rm.publishers p
            WHERE p.congregation_id = p_congregation_id
              AND (p.deactivated_at IS NULL OR p.deactivated_at >= v_month_date)
              AND (p.publisher_date IS NULL OR p.publisher_date < (v_month_date + interval '1 month'))
        )
        SELECT 
            v_year,
            v_month,
            p_congregation_id,
            COALESCE(s.total_reports, 0)::int,
            COALESCE(s.total_preached, 0)::int,
            COALESCE(s.publisher_count, 0)::int,
            COALESCE(s.auxiliary_pioneer_count, 0)::int,
            COALESCE(s.regular_pioneer_count, 0)::int,
            COALESCE(s.special_pioneer_count, 0)::int,
            COALESCE(s.total_studies, 0)::int,
            COALESCE(s.pioneer_hours, 0)::numeric,
            COALESCE(s.auxiliary_hours, 0)::numeric,
            COALESCE(s.late_count, 0)::int,
            (SELECT count(*)::int FROM pub_stats WHERE months_preached = 0),
            (SELECT count(*)::int FROM pub_stats WHERE months_preached BETWEEN 1 AND 5),
            (SELECT count(*)::int FROM rm.publishers p2 WHERE p2.congregation_id = p_congregation_id AND extract(year from p2.deactivated_at) = v_year AND extract(month from p2.deactivated_at) = v_month),
            (SELECT count(*)::int FROM rm.publishers p3 WHERE p3.congregation_id = p_congregation_id AND extract(year from p3.readmitted_at) = v_year AND extract(month from p3.readmitted_at) = v_month),
            COALESCE((SELECT mc.is_open = false FROM rm.month_control mc WHERE mc.reference_year = v_year AND mc.reference_month = v_month AND mc.congregation_id = p_congregation_id LIMIT 1), false)::boolean
        FROM (SELECT 1) dummy
        LEFT JOIN s1 s ON true;
        
    END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION rm.get_service_year_stats(int, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rm_get_service_year_stats(p_service_year int, p_congregation_id uuid)
RETURNS TABLE (
    reference_year int,
    reference_month int,
    congregation_id uuid,
    total_reports int,
    total_preached int,
    publisher_count int,
    auxiliary_pioneer_count int,
    regular_pioneer_count int,
    special_pioneer_count int,
    total_studies int,
    pioneer_hours numeric,
    auxiliary_hours numeric,
    late_count int,
    inactive_count int,
    irregular_count int,
    removed_count int,
    readmitted_count int,
    is_closed boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY SELECT * FROM rm.get_service_year_stats(p_service_year, p_congregation_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rm_get_service_year_stats(int, uuid) TO authenticated, service_role;
