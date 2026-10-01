-- Migration to add missing columns for S-38 IA Drafts
ALTER TABLE public.curator_profiles 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'Integrada ao Curador',
ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
