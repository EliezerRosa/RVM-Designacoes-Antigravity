-- ============================================================
-- Admin RPCs to list auth_logs / transaction_logs / auth_requests
-- bypassing RLS recursion issues on profiles join
-- ============================================================

CREATE OR REPLACE FUNCTION admin_list_auth_logs(p_limit int DEFAULT 200)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  profile_id uuid,
  email text,
  event_type text,
  ip_address text,
  user_agent text,
  metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM admin_assert_admin();
  RETURN QUERY
    SELECT l.id, l.created_at, l.profile_id, l.email, l.event_type,
           l.ip_address, l.user_agent, l.metadata
    FROM auth_logs l
    ORDER BY l.created_at DESC
    LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION admin_list_transaction_logs(p_limit int DEFAULT 200)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  profile_id uuid,
  email text,
  action text,
  entity_type text,
  entity_id text,
  description text,
  old_data jsonb,
  new_data jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM admin_assert_admin();
  RETURN QUERY
    SELECT t.id, t.created_at, t.profile_id, t.email, t.action,
           t.entity_type, t.entity_id, t.description, t.old_data, t.new_data
    FROM transaction_logs t
    ORDER BY t.created_at DESC
    LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION admin_list_auth_requests(p_limit int DEFAULT 100)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  profile_id uuid,
  profile_email text,
  profile_full_name text,
  phone text,
  code text,
  status text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM admin_assert_admin();
  RETURN QUERY
    SELECT r.id, r.created_at, r.profile_id,
           p.email, p.full_name,
           r.phone, r.code, r.status, r.expires_at
    FROM auth_requests r
    LEFT JOIN profiles p ON p.id = r.profile_id
    ORDER BY r.created_at DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_list_auth_logs(int) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_transaction_logs(int) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_auth_requests(int) TO authenticated;

NOTIFY pgrst, 'reload schema';
