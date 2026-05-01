-- Returns latest portal response per part for a given week.
-- SECURITY DEFINER bypasses RLS on confirmation_portal_* tables (which have no SELECT policies).
-- Caller must be an authenticated admin.

CREATE OR REPLACE FUNCTION get_portal_responses_for_week(p_week_id text)
RETURNS TABLE (
    part_id text,
    response text,
    response_reason text,
    responded_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
    IF v_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'forbidden';
    END IF;

    RETURN QUERY
    SELECT DISTINCT ON (cpr.part_id)
        cpr.part_id,
        cpr.response,
        cpr.response_reason,
        cpr.created_at AS responded_at
    FROM confirmation_portal_responses cpr
    JOIN workbook_parts wp ON wp.id::text = cpr.part_id
    WHERE wp.week_id = p_week_id
    ORDER BY cpr.part_id, cpr.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_portal_responses_for_week(text) TO authenticated;
