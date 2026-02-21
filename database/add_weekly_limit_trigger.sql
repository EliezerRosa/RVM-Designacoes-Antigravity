CREATE OR REPLACE FUNCTION check_publisher_weekly_limit()
RETURNS trigger AS $$
DECLARE
    conflict_found boolean;
BEGIN
    -- Verifica se o titular já tem alguma designação na mesma semana (como titular ou ajudante)
    IF NEW.principal_publisher_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM scheduled_assignments
            WHERE week_id = NEW.week_id
              AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
              AND (principal_publisher_id = NEW.principal_publisher_id 
                   OR secondary_publisher_id = NEW.principal_publisher_id)
        ) INTO conflict_found;
        
        IF conflict_found THEN
            -- Mantém apenas como aviso (não bloqueia a gravação)
            RAISE NOTICE 'O publicador titular já possui uma designação na semana %', NEW.week_id;
        END IF;
    END IF;

    -- Verifica se o ajudante já tem alguma designação na mesma semana (como titular ou ajudante)
    IF NEW.secondary_publisher_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM scheduled_assignments
            WHERE week_id = NEW.week_id
              AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
              AND (principal_publisher_id = NEW.secondary_publisher_id 
                   OR secondary_publisher_id = NEW.secondary_publisher_id)
        ) INTO conflict_found;
        
        IF conflict_found THEN
            -- Mantém apenas como aviso (não bloqueia a gravação)
            RAISE NOTICE 'O ajudante já possui uma designação na semana %', NEW.week_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criação da constraint (Trigger)
DROP TRIGGER IF EXISTS trg_check_weekly_limit ON scheduled_assignments;
CREATE TRIGGER trg_check_weekly_limit
BEFORE INSERT OR UPDATE ON scheduled_assignments
FOR EACH ROW
EXECUTE FUNCTION check_publisher_weekly_limit();
