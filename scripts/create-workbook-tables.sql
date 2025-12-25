-- ============================================================================
-- RVM Designações - Tabelas para Funcionalidade Apostila
-- Executar no Supabase SQL Editor
-- ============================================================================

-- 1. Tabela de Batches (controle de versões de importação)
CREATE TABLE IF NOT EXISTS workbook_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name TEXT NOT NULL,
    upload_date TIMESTAMPTZ DEFAULT NOW(),
    total_parts INTEGER DEFAULT 0,
    draft_count INTEGER DEFAULT 0,
    refined_count INTEGER DEFAULT 0,
    promoted_count INTEGER DEFAULT 0,
    week_range TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    promoted_at TIMESTAMPTZ,
    promoted_to_participation_ids UUID[]
);

-- Índices para batches
CREATE INDEX IF NOT EXISTS idx_workbook_batches_active ON workbook_batches(is_active);
CREATE INDEX IF NOT EXISTS idx_workbook_batches_upload_date ON workbook_batches(upload_date DESC);

-- 2. Tabela de Parts (partes extraídas da apostila)
CREATE TABLE IF NOT EXISTS workbook_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES workbook_batches(id) ON DELETE CASCADE,
    
    -- Campos do Excel (mesma estrutura do script extract_detailed_parts.py)
    week_id TEXT NOT NULL,
    week_display TEXT NOT NULL,
    date TEXT NOT NULL,
    section TEXT NOT NULL,
    tipo_parte TEXT NOT NULL,
    part_title TEXT NOT NULL,
    descricao TEXT,
    seq INTEGER NOT NULL,
    funcao TEXT NOT NULL DEFAULT 'Titular',
    duracao TEXT,
    hora_inicio TEXT,
    hora_fim TEXT,
    raw_publisher_name TEXT,
    
    -- Resolução de publicador (fuzzy matching)
    resolved_publisher_id UUID,
    resolved_publisher_name TEXT,
    match_confidence REAL,
    
    -- Status e metadados
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- Índices para parts
CREATE INDEX IF NOT EXISTS idx_workbook_parts_batch ON workbook_parts(batch_id);
CREATE INDEX IF NOT EXISTS idx_workbook_parts_week ON workbook_parts(week_id);
CREATE INDEX IF NOT EXISTS idx_workbook_parts_status ON workbook_parts(status);
CREATE INDEX IF NOT EXISTS idx_workbook_parts_section ON workbook_parts(section);

-- 3. Habilitar Realtime para workbook_parts
ALTER TABLE workbook_parts REPLICA IDENTITY FULL;

-- 4. RLS Policies (Row Level Security)
-- Habilitar RLS
ALTER TABLE workbook_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE workbook_parts ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas (ajustar conforme necessário para produção)
CREATE POLICY "Allow all operations on workbook_batches" ON workbook_batches
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on workbook_parts" ON workbook_parts
    FOR ALL USING (true) WITH CHECK (true);

-- 5. Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_workbook_parts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_workbook_parts_updated_at
    BEFORE UPDATE ON workbook_parts
    FOR EACH ROW
    EXECUTE FUNCTION update_workbook_parts_updated_at();

-- 6. Trigger para atualizar contadores no batch
CREATE OR REPLACE FUNCTION update_batch_counts()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE workbook_batches
    SET 
        total_parts = (SELECT COUNT(*) FROM workbook_parts WHERE batch_id = COALESCE(NEW.batch_id, OLD.batch_id)),
        draft_count = (SELECT COUNT(*) FROM workbook_parts WHERE batch_id = COALESCE(NEW.batch_id, OLD.batch_id) AND status = 'DRAFT'),
        refined_count = (SELECT COUNT(*) FROM workbook_parts WHERE batch_id = COALESCE(NEW.batch_id, OLD.batch_id) AND status = 'REFINED'),
        promoted_count = (SELECT COUNT(*) FROM workbook_parts WHERE batch_id = COALESCE(NEW.batch_id, OLD.batch_id) AND status = 'PROMOTED')
    WHERE id = COALESCE(NEW.batch_id, OLD.batch_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_batch_counts
    AFTER INSERT OR UPDATE OR DELETE ON workbook_parts
    FOR EACH ROW
    EXECUTE FUNCTION update_batch_counts();

-- ============================================================================
-- Verificação: Listar tabelas criadas
-- ============================================================================
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'workbook%';
