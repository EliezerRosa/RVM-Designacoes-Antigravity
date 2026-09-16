-- Migration: 20260915164000_canonical_communication_log.sql
-- Descrição: Cria a View vw_canonical_communication_log que une as 3 frentes de comunicação 
-- (Z-API Outbound, Web Push Outbound, Z-API Smart Inbound).

CREATE OR REPLACE VIEW public.vw_canonical_communication_log AS

-- 1. Z-API OUTBOUND (Disparos do Robô via WhatsApp)
SELECT 
    z.id,
    z.dispatched_at AS log_timestamp,
    'WHATSAPP'::text AS channel,
    'OUTBOUND'::text AS direction,
    'Sistema'::text AS sender_name,
    COALESCE(pub.data->>'name', 'Desconhecido') AS recipient_name,
    pub.id::text AS publisher_id,
    z.part_id,
    z.dispatch_type AS interaction_type,
    z.status AS status_or_action,
    z.recipient_phone AS phone,
    NULL::text AS content
FROM public.zapi_dispatch_log z
LEFT JOIN public.workbook_parts wp ON wp.id::text = z.part_id::text
LEFT JOIN public.publishers pub ON pub.id::text = wp.resolved_publisher_id::text

UNION ALL

-- 2. WEB PUSH OUTBOUND (Notificações Nativas)
SELECT 
    p.id,
    p.created_at AS log_timestamp,
    'WEB_PUSH'::text AS channel,
    'OUTBOUND'::text AS direction,
    'Sistema'::text AS sender_name,
    COALESCE(pub.data->>'name', 'Desconhecido') AS recipient_name,
    p.publisher_id::text,
    p.part_id,
    p.dispatch_type AS interaction_type,
    p.status AS status_or_action,
    NULL::text AS phone,
    'Aviso de ' || p.dispatch_type AS content
FROM public.push_dispatch_log p
LEFT JOIN public.publishers pub ON pub.id::text = p.publisher_id::text

UNION ALL

-- 3. Z-API SMART INBOUND (Interações do Usuário)
SELECT 
    s.id,
    s.created_at AS log_timestamp,
    'WHATSAPP'::text AS channel,
    'INBOUND'::text AS direction,
    COALESCE(s.publisher_name, 'Desconhecido') AS sender_name,
    'Sistema'::text AS recipient_name,
    s.publisher_id::text,
    s.workbook_part_id::text AS part_id,
    s.detected_intent AS interaction_type,
    s.action_taken AS status_or_action,
    s.phone,
    s.inbound_text AS content
FROM public.zapi_smart_interactions s;

-- Permissões
GRANT SELECT ON public.vw_canonical_communication_log TO authenticated;
GRANT SELECT ON public.vw_canonical_communication_log TO service_role;
