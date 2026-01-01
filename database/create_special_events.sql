-- Migração para suporte a Eventos Especiais

-- 1. Tabela de Eventos Especiais
CREATE TABLE IF NOT EXISTS special_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week TEXT NOT NULL,
    template_id TEXT NOT NULL, -- Referência ao ID do template (ex: 'visita-sc')
    description TEXT,
    theme TEXT,
    assignee_name TEXT,
    
    -- Status de aplicação
    is_applied BOOLEAN DEFAULT FALSE,
    applied_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Colunas de suporte na tabela workbook_parts (se não existirem)
-- Adiciona cancel_reason
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workbook_parts' AND column_name='cancel_reason') THEN
        ALTER TABLE workbook_parts ADD COLUMN cancel_reason TEXT;
    END IF;
END $$;

-- Adiciona original_duration (para rollback de ajustes de tempo)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workbook_parts' AND column_name='original_duration') THEN
        ALTER TABLE workbook_parts ADD COLUMN original_duration TEXT;
    END IF;
END $$;

-- Adiciona affected_by_event_id (link reverso)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workbook_parts' AND column_name='affected_by_event_id') THEN
        ALTER TABLE workbook_parts ADD COLUMN affected_by_event_id UUID REFERENCES special_events(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_special_events_week ON special_events(week);
CREATE INDEX IF NOT EXISTS idx_workbook_parts_affected_by ON workbook_parts(affected_by_event_id);
