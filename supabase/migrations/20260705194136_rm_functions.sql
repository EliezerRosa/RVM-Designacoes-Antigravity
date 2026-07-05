-- ============================================================
-- RM Fase 1 — Funções, triggers e RPCs de controle de mês
-- ============================================================

-- ------------------------------------------------------------
-- rm.calculate_publisher_status(publisher_id)
-- Deriva field_service_status a partir da janela dos últimos 6 meses
-- (relativa ao relatório mais recente do publicador).
--   INATIVO       → nenhum mês com pregação na janela
--   ATIVO         → pregou no mês mais recente
--   IRREGULAR     → pregou em >= 3 dos 6 meses (mas não no mais recente)
--   QUASE-INATIVO → pregou em 1 ou 2 dos 6 meses
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION rm.calculate_publisher_status(p_publisher_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_ref_idx      integer;   -- índice absoluto do mês mais recente (year*12 + month)
    v_latest_pre   boolean;
    v_months_pre   integer;
BEGIN
    SELECT (reference_year * 12 + reference_month), has_preached
      INTO v_ref_idx, v_latest_pre
    FROM rm.monthly_reports
    WHERE publisher_id = p_publisher_id
    ORDER BY reference_year DESC, reference_month DESC
    LIMIT 1;

    IF v_ref_idx IS NULL THEN
        RETURN NULL;  -- sem relatórios: não altera
    END IF;

    SELECT COUNT(DISTINCT (reference_year * 12 + reference_month))
      INTO v_months_pre
    FROM rm.monthly_reports
    WHERE publisher_id = p_publisher_id
      AND has_preached = true
      AND (reference_year * 12 + reference_month) BETWEEN (v_ref_idx - 5) AND v_ref_idx;

    IF v_months_pre = 0 THEN
        RETURN 'INATIVO';
    ELSIF v_latest_pre THEN
        RETURN 'ATIVO';
    ELSIF v_months_pre >= 3 THEN
        RETURN 'IRREGULAR';
    ELSE
        RETURN 'QUASE-INATIVO';
    END IF;
END;
$$;

-- ------------------------------------------------------------
-- Trigger: recalcula status do publicador após mudança em relatórios
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION rm.trg_recalc_publisher_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_publisher_id uuid;
    v_status       text;
BEGIN
    v_publisher_id := COALESCE(NEW.publisher_id, OLD.publisher_id);
    v_status := rm.calculate_publisher_status(v_publisher_id);
    IF v_status IS NOT NULL THEN
        UPDATE rm.publishers
        SET field_service_status = v_status,
            updated_at = now()
        WHERE id = v_publisher_id;
    END IF;
    RETURN NULL;  -- AFTER trigger
END;
$$;

CREATE TRIGGER trg_monthly_reports_recalc_status
    AFTER INSERT OR UPDATE OR DELETE ON rm.monthly_reports
    FOR EACH ROW EXECUTE FUNCTION rm.trg_recalc_publisher_status();

-- ------------------------------------------------------------
-- Trigger: auditoria de submissões (INSERT/UPDATE/DELETE)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION rm.trg_audit_submission()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_changed_by uuid := auth.uid();
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO rm.submission_audit (monthly_report_id, changed_by, action, previous_data)
        VALUES (OLD.id, v_changed_by, 'DELETE', to_jsonb(OLD));
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO rm.submission_audit (monthly_report_id, changed_by, action, previous_data)
        VALUES (NEW.id, v_changed_by, 'UPDATE', to_jsonb(OLD));
        RETURN NEW;
    ELSE  -- INSERT
        INSERT INTO rm.submission_audit (monthly_report_id, changed_by, action, previous_data)
        VALUES (NEW.id, v_changed_by, 'INSERT', NULL);
        RETURN NEW;
    END IF;
END;
$$;

CREATE TRIGGER trg_monthly_reports_audit
    AFTER INSERT OR UPDATE OR DELETE ON rm.monthly_reports
    FOR EACH ROW EXECUTE FUNCTION rm.trg_audit_submission();

-- ------------------------------------------------------------
-- RPCs de controle de mês (em public p/ não depender de schema rm exposto)
-- SECURITY DEFINER + guarda de admin.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rm_open_month(
    p_congregation_id uuid,
    p_year            smallint,
    p_month           smallint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, rm
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Acesso negado: somente admin pode abrir mês';
    END IF;

    INSERT INTO rm.month_control (congregation_id, reference_year, reference_month, is_open, opened_at, opened_by)
    VALUES (p_congregation_id, p_year, p_month, true, now(), auth.uid())
    ON CONFLICT (congregation_id, reference_year, reference_month)
    DO UPDATE SET is_open = true, opened_at = now(), opened_by = auth.uid(), updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.rm_close_month(
    p_congregation_id uuid,
    p_year            smallint,
    p_month           smallint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, rm
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Acesso negado: somente admin pode fechar mês';
    END IF;

    INSERT INTO rm.month_control (congregation_id, reference_year, reference_month, is_open, closed_at, closed_by)
    VALUES (p_congregation_id, p_year, p_month, false, now(), auth.uid())
    ON CONFLICT (congregation_id, reference_year, reference_month)
    DO UPDATE SET is_open = false, closed_at = now(), closed_by = auth.uid(), updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.rm_open_month(uuid, smallint, smallint) FROM public;
REVOKE ALL ON FUNCTION public.rm_close_month(uuid, smallint, smallint) FROM public;
GRANT EXECUTE ON FUNCTION public.rm_open_month(uuid, smallint, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rm_close_month(uuid, smallint, smallint) TO authenticated;
