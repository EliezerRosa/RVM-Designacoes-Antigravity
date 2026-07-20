
-- ============================================================
-- RM Fase 2 — Status de Campo Dinâmico e Desancorado
-- Regra: A inatividade agora avança livremente com o tempo real.
-- ============================================================

-- 1. Remover Trigger e Função Antiga
DROP TRIGGER IF EXISTS trg_monthly_reports_recalc_status ON rm.monthly_reports;
DROP FUNCTION IF EXISTS rm.trg_recalc_publisher_status();

-- 2. Reescrever calculate_publisher_status ancorando no mês atual oficial
CREATE OR REPLACE FUNCTION rm.calculate_publisher_status(p_publisher_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_curr_idx     integer;   -- índice absoluto do mês de REFERÊNCIA COBRADA (CURRENT_DATE - 1 month)
    v_latest_pre   boolean;
    v_months_pre   integer;
BEGIN
    -- Mês alvo de cobrança = data do sistema - 1 mês (Ex: 1º de Julho cobra relatórios de Junho)
    v_curr_idx := extract(year from (current_date - interval '1 month')) * 12 + 
                  extract(month from (current_date - interval '1 month'));

    -- A pessoa pregou no mês alvo exato?
    SELECT has_preached INTO v_latest_pre
    FROM rm.monthly_reports
    WHERE publisher_id = p_publisher_id
      AND (reference_year * 12 + reference_month) = v_curr_idx
    LIMIT 1;
    
    v_latest_pre := COALESCE(v_latest_pre, false);

    -- Quantos meses pregou na janela de 6 meses? (mês alvo + 5 anteriores)
    SELECT COUNT(DISTINCT (reference_year * 12 + reference_month))
      INTO v_months_pre
    FROM rm.monthly_reports
    WHERE publisher_id = p_publisher_id
      AND has_preached = true
      AND (reference_year * 12 + reference_month) BETWEEN (v_curr_idx - 5) AND v_curr_idx;

    IF v_months_pre = 0 THEN
        RETURN 'INATIVO';
    ELSIF v_months_pre = 6 THEN
        RETURN 'ATIVO';
    ELSE
        RETURN 'IRREGULAR';
    END IF;
END;
$$;

-- 3. Remover a coluna física estática (que era dependente de triggers)
ALTER TABLE rm.publishers DROP COLUMN field_service_status;

-- 4. Criar a View para retornar os dados vivos
-- Como a View tem o mesmo formato da tabela antiga com o status junto, não vai quebrar os GETs do front.
CREATE OR REPLACE VIEW rm.v_publishers_status AS
SELECT *, rm.calculate_publisher_status(id) AS field_service_status
FROM rm.publishers;

GRANT SELECT ON rm.v_publishers_status TO authenticated;
GRANT SELECT ON rm.v_publishers_status TO anon;
