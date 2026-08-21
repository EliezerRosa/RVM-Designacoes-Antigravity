-- Habilita a extensão pg_net para fazer chamadas HTTP
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Criação da função de trigger
CREATE OR REPLACE FUNCTION rm.fn_webhook_whatsapp_orchestrator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  payload JSONB;
  webhook_url TEXT;
  webhook_secret TEXT;
  request_id BIGINT;
BEGIN
  -- Apenas disparar o webhook se o status mudou para DESIGNADA ou REJEITADA
  -- vindo de ENVIADA (para evitar spams em outras transições).
  IF OLD.status = 'ENVIADA' AND (NEW.status = 'DESIGNADA' OR NEW.status = 'REJEITADA') THEN
    
    -- Montar payload no formato esperado pelo pg_net para simular um webhook do Supabase
    payload := jsonb_build_object(
      'type', 'UPDATE',
      'table', 'workbook_parts',
      'schema', 'rm',
      'record', row_to_json(NEW),
      'old_record', row_to_json(OLD)
    );

    -- Pegar a URL do projeto através da env var do Supabase ou montar hardcoded se necessário.
    -- O ideal em Supabase é usar variáveis ou a tabela de secrets se disponível (vault), 
    -- mas como estamos em um script de migration genérico para ambiente gerenciado:
    
    -- Substitua 'YOUR_WEBHOOK_URL_HERE' pela URL real da edge function no ambiente alvo
    -- No Supabase CLI local é algo como: http://kong:8000/functions/v1/webhook-whatsapp-orchestrator
    -- Em produção, será: https://<project_ref>.supabase.co/functions/v1/webhook-whatsapp-orchestrator
    
    -- Vamos assumir que a URL base da Edge Function será passada via env var do projeto
    -- ou usando current_setting se customizado. Para simplificar e garantir funcionamento, 
    -- usamos um sufixo que a gente trata depois, ou configuramos a URL via Supabase UI.
    -- Como a instrução pedia a arquitetura via Trigger + pg_net, vamos deixar a URL configurável
    -- ou assumir o formato padrão do edge function auth bypass.
    
    -- NOTA: O método mais robusto no Supabase cloud é usar a UI de Database Webhooks que faz isso
    -- nos bastidores. Como estamos criando via SQL manual:
    
    webhook_url := current_setting('app.settings.edge_function_url', true) || '/webhook-whatsapp-orchestrator';
    webhook_secret := current_setting('app.settings.webhook_secret', true);
    
    -- Se a configuração não existir (ex: rodando localmente sem a config setada), 
    -- tenta uma URL padrão para fallback local do Supabase CLI
    IF webhook_url IS NULL OR webhook_url = '/webhook-whatsapp-orchestrator' THEN
      webhook_url := 'http://kong:8000/functions/v1/webhook-whatsapp-orchestrator';
    END IF;

    IF webhook_secret IS NOT NULL THEN
      webhook_url := webhook_url || '?secret=' || webhook_secret;
    END IF;

    -- Chamada assíncrona usando pg_net
    SELECT net.http_post(
        url := webhook_url,
        body := payload,
        headers := '{"Content-Type": "application/json"}'::JSONB
    ) INTO request_id;

  END IF;

  RETURN NEW;
END;
$$;

-- Criar (ou recriar) o Trigger na tabela
DROP TRIGGER IF EXISTS trg_webhook_whatsapp_orchestrator ON rm.workbook_parts;

CREATE TRIGGER trg_webhook_whatsapp_orchestrator
AFTER UPDATE OF status ON rm.workbook_parts
FOR EACH ROW
EXECUTE FUNCTION rm.fn_webhook_whatsapp_orchestrator();
