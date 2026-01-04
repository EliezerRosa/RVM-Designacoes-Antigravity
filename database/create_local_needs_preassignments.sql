-- ============================================================================
-- Migração: Pré-Designação de Necessidades Locais
-- Cria tabela de fila e adiciona campo theme em workbook_parts
-- ============================================================================

-- 1. Criar tabela de pré-designações de Necessidades Locais
CREATE TABLE IF NOT EXISTS local_needs_preassignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    theme TEXT NOT NULL,
    assignee_name TEXT NOT NULL,
    order_position INTEGER NOT NULL DEFAULT 1,
    assigned_to_part_id UUID REFERENCES workbook_parts(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Índices para performance
CREATE INDEX IF NOT EXISTS idx_local_needs_order ON local_needs_preassignments(order_position) 
    WHERE assigned_to_part_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_local_needs_assigned ON local_needs_preassignments(assigned_to_part_id);

-- 3. Adicionar campo de tema em workbook_parts (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'workbook_parts' AND column_name = 'local_needs_theme'
    ) THEN
        ALTER TABLE workbook_parts ADD COLUMN local_needs_theme TEXT;
    END IF;
END $$;

-- 4. Habilitar RLS
ALTER TABLE local_needs_preassignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on local_needs_preassignments" ON local_needs_preassignments
    FOR ALL USING (true) WITH CHECK (true);

-- 5. Função para atualizar order_position automaticamente
CREATE OR REPLACE FUNCTION reorder_local_needs_queue()
RETURNS TRIGGER AS $$
BEGIN
    -- Reordenar quando uma pré-designação é atribuída a uma parte
    IF NEW.assigned_to_part_id IS NOT NULL AND OLD.assigned_to_part_id IS NULL THEN
        -- Decrementar order_position de todos que vinham depois
        UPDATE local_needs_preassignments
        SET order_position = order_position - 1
        WHERE order_position > OLD.order_position
          AND assigned_to_part_id IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reorder_local_needs
    AFTER UPDATE ON local_needs_preassignments
    FOR EACH ROW
    EXECUTE FUNCTION reorder_local_needs_queue();

-- 6. Trigger para auto-atualizar updated_at
CREATE OR REPLACE FUNCTION update_local_needs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_local_needs_updated_at
    BEFORE UPDATE ON local_needs_preassignments
    FOR EACH ROW
    EXECUTE FUNCTION update_local_needs_updated_at();

-- ============================================================================
-- Verificação
-- ============================================================================
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'local_needs_preassignments';
