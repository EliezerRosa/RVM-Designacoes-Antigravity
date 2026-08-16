CREATE OR REPLACE FUNCTION public.reset_push_dispatch_log(p_zapi_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF (SELECT role FROM profiles WHERE id = auth.uid()) != 'admin' THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores podem resetar o log de Web Push.';
    END IF;

    DELETE FROM public.push_dispatch_log WHERE zapi_log_id = p_zapi_log_id;
END;
$$;
