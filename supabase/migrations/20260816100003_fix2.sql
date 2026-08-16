DROP FUNCTION IF EXISTS public.get_pending_push_events();

CREATE OR REPLACE FUNCTION public.get_pending_push_events()
RETURNS TABLE (
    zapi_log_id uuid,
    part_id text,
    dispatch_type text,
    publisher_id text,
    publisher_name text,
    part_title text,
    section text,
    week_id text,
    endpoint text,
    p256dh text,
    auth text,
    token text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        z.id AS zapi_log_id,
        z.part_id::text,
        z.dispatch_type,
        wp.resolved_publisher_id::text AS publisher_id,
        pub.data->>'name' AS publisher_name,
        wp.part_title,
        wp.section,
        wp.week_id,
        ps.endpoint,
        ps.p256dh,
        ps.auth,
        cpt.token::text
    FROM public.zapi_dispatch_log z
    JOIN public.workbook_parts wp ON wp.id::text = z.part_id::text
    JOIN public.publishers pub ON pub.id::text = wp.resolved_publisher_id::text
    JOIN public.push_subscriptions ps ON ps.publisher_id::text = pub.id::text
    LEFT JOIN LATERAL (
        SELECT t.token
        FROM public.confirmation_portal_tokens t
        WHERE t.part_id::text = wp.id::text
          AND t.publisher_id::text = pub.id::text
          AND t.used_at IS NULL
          AND t.expires_at > now()
        ORDER BY t.created_at DESC
        LIMIT 1
    ) cpt ON true
    WHERE 
        z.dispatched_at > now() - interval '2 days'
        AND z.status = 'SUCCESS'
        AND NOT EXISTS (
            SELECT 1 
            FROM public.push_dispatch_log pdl 
            WHERE pdl.part_id::text = z.part_id::text
              AND pdl.dispatch_type = z.dispatch_type 
              AND pdl.endpoint = ps.endpoint
        );
END;
$$;
