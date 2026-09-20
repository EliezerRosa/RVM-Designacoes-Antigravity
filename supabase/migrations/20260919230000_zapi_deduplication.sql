-- Migration: 20260919230000_zapi_deduplication.sql
-- Descrição: P3 - Adiciona constraint UNIQUE ao inbound_message_id para deduplicação da Z-API

-- 1. Remove duplicatas existentes mantendo apenas a mais recente (resolvendo o problema retroativo)
DELETE FROM public.zapi_smart_interactions a
USING public.zapi_smart_interactions b
WHERE a.inbound_message_id = b.inbound_message_id 
  AND a.inbound_message_id IS NOT NULL
  AND a.created_at < b.created_at;

-- 2. Aplica a constraint UNIQUE
ALTER TABLE public.zapi_smart_interactions 
ADD CONSTRAINT zapi_smart_interactions_inbound_message_id_key UNIQUE (inbound_message_id);
