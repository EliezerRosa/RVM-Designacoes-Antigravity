-- Migration: whatsapp_queue
-- Description: Creates a queue table for decoupling WhatsApp message sending (Event-Driven Headless Strategy)

CREATE TABLE IF NOT EXISTS public.whatsapp_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL, -- e.g., 'LEMBRETE_D9', 'LEMBRETE_D7', 'LEMBRETE_D2', 'PING_72H', 'RELATORIO_LIDERANCA'
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PROCESSED', 'ERROR'
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Index for fast FIFO querying by the Headless Bot
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_status_created 
ON public.whatsapp_queue (status, created_at ASC);

-- Enable RLS
ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;

-- Grant permissions (Service Role needs full access)
GRANT ALL ON TABLE public.whatsapp_queue TO service_role;
GRANT SELECT ON TABLE public.whatsapp_queue TO authenticated;

-- Policies
CREATE POLICY "Service Role full access to whatsapp_queue"
ON public.whatsapp_queue
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can view whatsapp_queue"
ON public.whatsapp_queue
FOR SELECT
TO authenticated
USING (true);
