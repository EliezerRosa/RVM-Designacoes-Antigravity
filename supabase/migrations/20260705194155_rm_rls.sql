-- ============================================================
-- RM Fase 1 — Row Level Security
-- Fase 1: somente Admin acessa. Não-admins são negados pela ausência de policy
-- (RLS habilitado sem policy correspondente = deny). Liberação multi-role = Fase 2.
-- ============================================================

-- Habilita RLS em todas as tabelas rm.*
ALTER TABLE rm.congregations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.field_groups         ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.publishers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.monthly_reports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.submission_audit     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.publisher_sync_map   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.month_control        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.congregation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm.settings             ENABLE ROW LEVEL SECURITY;

-- Policy única por tabela: Admin = ALL (mesmo padrão de public.permission_policies)
CREATE POLICY rm_admin_all ON rm.congregations FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY rm_admin_all ON rm.field_groups FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY rm_admin_all ON rm.publishers FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY rm_admin_all ON rm.monthly_reports FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY rm_admin_all ON rm.submission_audit FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY rm_admin_all ON rm.publisher_sync_map FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY rm_admin_all ON rm.month_control FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY rm_admin_all ON rm.congregation_members FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY rm_admin_all ON rm.settings FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
