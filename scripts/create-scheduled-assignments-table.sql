-- ============================================================================
-- Tabela: scheduled_assignments
-- Designações geradas pelo motor, em fluxo de aprovação
-- ============================================================================

-- Dropar se existir (para desenvolvimento)
DROP TABLE IF EXISTS scheduled_assignments;

CREATE TABLE scheduled_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week_id TEXT NOT NULL,
    part_id TEXT NOT NULL,
    part_title TEXT NOT NULL,
    part_type TEXT NOT NULL,
    teaching_category TEXT NOT NULL,
    
    -- Designados
    principal_publisher_id UUID,
    principal_publisher_name TEXT NOT NULL,
    secondary_publisher_id UUID,
    secondary_publisher_name TEXT,
    
    -- Timing
    date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    duration_min INTEGER DEFAULT 0,
    room TEXT,
    
    -- Status de Aprovação
    status TEXT NOT NULL DEFAULT 'DRAFT',
    approved_by_elder_id UUID,
    approved_by_elder_name TEXT,
    approval_date TIMESTAMPTZ,
    rejection_reason TEXT,
    
    -- Metadados da seleção
    selection_reason TEXT,
    score FLOAT DEFAULT 0,
    pairing_reason TEXT,
    
    -- Promoção para History
    promoted_to_history_id UUID,
    promoted_at TIMESTAMPTZ,
    
    -- Auditoria
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT valid_status CHECK (
        status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'COMPLETED')
    )
);

-- Índices para consultas frequentes
CREATE INDEX idx_scheduled_week ON scheduled_assignments(week_id);
CREATE INDEX idx_scheduled_status ON scheduled_assignments(status);
CREATE INDEX idx_scheduled_date ON scheduled_assignments(date);
CREATE INDEX idx_scheduled_principal ON scheduled_assignments(principal_publisher_id);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_scheduled_assignments_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scheduled_assignments_updated
    BEFORE UPDATE ON scheduled_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_scheduled_assignments_timestamp();

-- Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE scheduled_assignments;

-- Comentários
COMMENT ON TABLE scheduled_assignments IS 'Designações geradas pelo motor de regras, em fluxo de aprovação';
COMMENT ON COLUMN scheduled_assignments.status IS 'DRAFT → PENDING_APPROVAL → APPROVED → COMPLETED (ou REJECTED)';
COMMENT ON COLUMN scheduled_assignments.promoted_to_history_id IS 'ID do HistoryRecord criado após COMPLETED';
