-- ============================================================
-- RM Fase 1 — Fix: remover FK de rm.submission_audit → rm.monthly_reports
-- Motivo: o trigger AFTER DELETE em monthly_reports insere um registro de auditoria
-- referenciando o relatório recém-excluído, violando a FK e impedindo QUALQUER
-- exclusão de relatório (e cascatas de publisher/congregação). Auditoria é log
-- append-only e deve sobreviver à exclusão do registro auditado.
-- No-op em bases novas (a migration de schema já não cria a FK).
-- ============================================================
ALTER TABLE rm.submission_audit DROP CONSTRAINT IF EXISTS submission_audit_monthly_report_id_fkey;
