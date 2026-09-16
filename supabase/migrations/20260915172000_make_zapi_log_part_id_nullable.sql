-- Migration: 20260915172000_make_zapi_log_part_id_nullable.sql
-- Descrição: Remove a restrição NOT NULL da coluna part_id para permitir o registro de 
-- disparos gerenciais (S-140, D-30, alertas avulsos) que não estão atrelados a uma parte.

ALTER TABLE public.zapi_dispatch_log ALTER COLUMN part_id DROP NOT NULL;
