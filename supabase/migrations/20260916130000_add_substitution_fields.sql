-- Migration: 20260916130000_add_substitution_fields.sql
-- Adiciona campos para registrar substituições e persistir avisos de S-140

ALTER TABLE public.workbook_parts 
ADD COLUMN IF NOT EXISTS is_substitution BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS substituted_publisher_name TEXT;
