-- Ciclo simplificado Fase H.2: Trigger PL/pgSQL para garantir invariante
-- "is_chairman_derived=true => resolved_publisher = chairman da week_id"
-- atomicamente no banco, sem depender de N call sites client-side.
--
-- Disparo: AFTER UPDATE OR INSERT em workbook_parts quando a row é o Presidente
-- Titular (tipo_parte ILIKE '%presidente%' AND funcao='Titular') e
-- houve mudança em resolved_publisher_* ou status.
--
-- Efeito: propaga publisher para todas as is_chairman_derived=true da mesma
-- week_id. Status das derivadas é forçado a DESIGNADA quando o presidente está
-- em status >= PROPOSTA (derivadas não passam por portal). Quando o presidente
-- vai para PENDENTE (recusa/cancelamento), derivadas também voltam a PENDENTE
-- com publisher null (mantendo o flag para futuro re-sync).
--
-- Não há loop: trigger só atualiza is_chairman_derived=true; presidente tem
-- is_chairman_derived=false, então re-disparo é impossível por construção.

CREATE OR REPLACE FUNCTION public.sync_chairman_derived_parts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_target_status TEXT;
  v_target_pub_id UUID;
  v_target_pub_name TEXT;
BEGIN
  -- Só dispara para Presidente Titular
  IF NEW.tipo_parte NOT ILIKE '%presidente%' OR NEW.funcao IS DISTINCT FROM 'Titular' THEN
    RETURN NEW;
  END IF;

  -- Em UPDATE: só age se publisher ou status mudaram (evita writes inúteis)
  IF TG_OP = 'UPDATE' THEN
    IF NEW.resolved_publisher_id IS NOT DISTINCT FROM OLD.resolved_publisher_id
       AND NEW.resolved_publisher_name IS NOT DISTINCT FROM OLD.resolved_publisher_name
       AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Regra de status para derivadas:
  --   Presidente PENDENTE     -> derivadas PENDENTE  (publisher null)
  --   Presidente PROPOSTA     -> derivadas DESIGNADA (auto, não passa portal)
  --   Presidente DESIGNADA    -> derivadas DESIGNADA
  --   Presidente CONCLUIDA    -> derivadas CONCLUIDA
  --   Presidente CANCELADA    -> derivadas CANCELADA
  --   (legados APROVADA/REJEITADA também mapeados conservadoramente)
  IF NEW.status IN ('PROPOSTA', 'DESIGNADA', 'APROVADA') THEN
    v_target_status := 'DESIGNADA';
    v_target_pub_id := NEW.resolved_publisher_id;
    v_target_pub_name := NEW.resolved_publisher_name;
  ELSIF NEW.status = 'CONCLUIDA' THEN
    v_target_status := 'CONCLUIDA';
    v_target_pub_id := NEW.resolved_publisher_id;
    v_target_pub_name := NEW.resolved_publisher_name;
  ELSIF NEW.status = 'CANCELADA' THEN
    v_target_status := 'CANCELADA';
    v_target_pub_id := NULL;
    v_target_pub_name := NULL;
  ELSE
    -- PENDENTE, REJEITADA (legado), ou outro: limpar derivadas
    v_target_status := 'PENDENTE';
    v_target_pub_id := NULL;
    v_target_pub_name := NULL;
  END IF;

  UPDATE public.workbook_parts
  SET
    resolved_publisher_id = v_target_pub_id,
    resolved_publisher_name = v_target_pub_name,
    status = v_target_status,
    status_changed_at = NOW(),
    updated_at = NOW()
  WHERE week_id = NEW.week_id
    AND is_chairman_derived = TRUE
    AND id <> NEW.id  -- segurança extra (presidente nunca deveria ser derivado dele mesmo)
    AND (
      resolved_publisher_id IS DISTINCT FROM v_target_pub_id
      OR resolved_publisher_name IS DISTINCT FROM v_target_pub_name
      OR status IS DISTINCT FROM v_target_status
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_chairman_derived_parts ON public.workbook_parts;

CREATE TRIGGER trg_sync_chairman_derived_parts
AFTER INSERT OR UPDATE ON public.workbook_parts
FOR EACH ROW
EXECUTE FUNCTION public.sync_chairman_derived_parts();

COMMENT ON FUNCTION public.sync_chairman_derived_parts IS
'Ciclo simplificado Fase H.2: garante invariante "is_chairman_derived=true => publisher = chairman da week_id" no nível do banco. Derivadas vão direto a DESIGNADA quando o presidente é proposto (não passam por portal de confirmação).';
