CREATE TABLE IF NOT EXISTS zapi_dispatch_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    part_id text NOT NULL,
    dispatch_type text NOT NULL,
    recipient_phone text,
    status text NOT NULL,
    dispatched_at timestamp with time zone DEFAULT now()
);

-- Create index for quick idempotency checks
CREATE INDEX IF NOT EXISTS idx_zapi_dispatch_log_part_type ON zapi_dispatch_log(part_id, dispatch_type);

-- Enable RLS
ALTER TABLE zapi_dispatch_log ENABLE ROW LEVEL SECURITY;

-- Allow authenticated admins to read/write, edge functions (service role) bypass RLS
CREATE POLICY "Admins can manage zapi logs" ON zapi_dispatch_log
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles pr
            WHERE pr.id = auth.uid()
            AND pr.email = 'zico.josias@gmail.com'
        )
    );

-- Insert default configurations into settings table
INSERT INTO settings (key, value) 
VALUES ('zapi_automation_active', 'false'::jsonb) 
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value) 
VALUES ('zapi_group_id', '""'::jsonb) 
ON CONFLICT (key) DO NOTHING;
