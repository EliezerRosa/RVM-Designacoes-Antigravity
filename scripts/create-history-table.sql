-- Script SQL para criar tabela history_records no Supabase
-- Execute este script no SQL Editor do Supabase Dashboard

-- Criar tabela history_records
CREATE TABLE IF NOT EXISTS history_records (
    id TEXT PRIMARY KEY,
    week_id TEXT NOT NULL,
    semana TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    import_source TEXT,
    import_batch_id TEXT,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para busca eficiente
CREATE INDEX IF NOT EXISTS idx_history_week_id ON history_records(week_id);
CREATE INDEX IF NOT EXISTS idx_history_semana ON history_records(semana);
CREATE INDEX IF NOT EXISTS idx_history_status ON history_records(status);
CREATE INDEX IF NOT EXISTS idx_history_batch ON history_records(import_batch_id);

-- RLS (Row Level Security) - permitir acesso público para leitura/escrita
ALTER TABLE history_records ENABLE ROW LEVEL SECURITY;

-- Policy para permitir todas as operações (ajuste conforme necessário)
DROP POLICY IF EXISTS "Allow all operations" ON history_records;
CREATE POLICY "Allow all operations" ON history_records
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_history_updated_at ON history_records;
CREATE TRIGGER trigger_update_history_updated_at
    BEFORE UPDATE ON history_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Verificar criação
SELECT 'Tabela history_records criada com sucesso!' as status;
