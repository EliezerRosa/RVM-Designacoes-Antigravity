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
    readmitted_count int
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY SELECT * FROM rm.get_service_year_stats(p_service_year, p_congregation_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rm_get_service_year_stats(int, uuid) TO authenticated, service_role;
