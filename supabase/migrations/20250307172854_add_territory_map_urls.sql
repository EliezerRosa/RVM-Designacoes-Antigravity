-- Add new fields to support Map Integration
ALTER TABLE public.territories 
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS google_maps_url TEXT;
