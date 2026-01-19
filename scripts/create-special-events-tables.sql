-- ============================================================================
-- RVM Designações - Tabelas para Eventos Especiais
-- Executar no Supabase SQL Editor
-- ============================================================================

-- 1. Tabela de Eventos Especiais
CREATE TABLE IF NOT EXISTS special_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tipo do evento (template_id)
    template_id TEXT NOT NULL,
    
    -- Semana afetada (formato YYYY-MM-DD)
    week TEXT NOT NULL,
    
    -- Campos comuns
    theme TEXT,                          -- Tema (obrigatório para alguns)
    responsible TEXT,                     -- Responsável (obrigatório para alguns)
    duration INTEGER,                     -- Duração em minutos
    
    -- Campos específicos para Boletim CG
    boletim_year INTEGER,                 -- Ano do boletim (ex: 2024)
    boletim_number INTEGER,               -- Número do boletim (ex: 1, 2, 3...)
    
    -- Orientações e Observações (obrigatório em TODOS)
    guidelines TEXT,                      -- Orientações
    observations TEXT,                    -- Observações
    
    -- Metadados adicionais em JSON (flexível)
    details JSONB DEFAULT '{}',
    
    -- Controle
    is_applied BOOLEAN DEFAULT FALSE,     -- Se o impacto já foi aplicado
    applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    created_by TEXT
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_special_events_week ON special_events(week);
CREATE INDEX IF NOT EXISTS idx_special_events_template ON special_events(template_id);
CREATE INDEX IF NOT EXISTS idx_special_events_applied ON special_events(is_applied);

-- 2. Adicionar colunas extras em workbook_parts (se não existirem)
DO $$ 
BEGIN
    -- Coluna para motivo de cancelamento
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'workbook_parts' AND column_name = 'cancel_reason') THEN
        ALTER TABLE workbook_parts ADD COLUMN cancel_reason TEXT;
    END IF;
    
    -- Coluna para duração original (backup para rollback)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'workbook_parts' AND column_name = 'original_duration') THEN
        ALTER TABLE workbook_parts ADD COLUMN original_duration TEXT;
    END IF;
    
    -- Coluna para ID do evento que afetou esta parte
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'workbook_parts' AND column_name = 'affected_by_event_id') THEN
        ALTER TABLE workbook_parts ADD COLUMN affected_by_event_id UUID REFERENCES special_events(id) ON DELETE SET NULL;
    END IF;
    
    -- Coluna para ID do evento pendente (indicador visual)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'workbook_parts' AND column_name = 'pending_event_id') THEN
        ALTER TABLE workbook_parts ADD COLUMN pending_event_id UUID REFERENCES special_events(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. RLS Policies
ALTER TABLE special_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on special_events" ON special_events
    FOR ALL USING (true) WITH CHECK (true);

-- 4. Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_special_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_special_events_updated_at ON special_events;
CREATE TRIGGER trigger_special_events_updated_at
    BEFORE UPDATE ON special_events
    FOR EACH ROW
    EXECUTE FUNCTION update_special_events_updated_at();

-- ============================================================================
-- Verificação
-- ============================================================================
-- SELECT * FROM special_events LIMIT 5;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'workbook_parts';
