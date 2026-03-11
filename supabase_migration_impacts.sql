ALTER TABLE special_events ADD COLUMN impacts jsonb DEFAULT '[]'::jsonb;
