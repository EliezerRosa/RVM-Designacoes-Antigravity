-- Migration: 20261119180000_fix_canonical_log_recipient_lookup.sql
-- Descrição: Restaura a resolução de destinatário em vw_canonical_communication_log
-- priorizando z.publisher_id e z.recipient_phone (evitando "para Desconhecido" ou
-- nome do novo titular em ALERTA_REMOCAO após substituição ou limpeza da parte),
-- preservando o 4º ramo SMART_REPLY introduzido em 20260917000000.

CREATE OR REPLACE VIEW public.vw_canonical_communication_log AS

-- 1. Z-API OUTBOUND (Disparos do Robô via WhatsApp)
SELECT
    z.id,
    z.dispatched_at AS log_timestamp,
    'WHATSAPP'::text AS channel,
    'OUTBOUND'::text AS direction,
    'Sistema'::text AS sender_name,
    COALESCE(
        (SELECT p.data->>'name' FROM public.publishers p WHERE p.id::text = z.publisher_id::text LIMIT 1),
        (
            SELECT p.data->>'name'
            FROM public.publishers p
            WHERE right(regexp_replace(COALESCE(p.data->>'phone', p.data->>'contact_phone', ''), '\D', '', 'g'), 10)
                = right(regexp_replace(COALESCE(z.recipient_phone, ''), '\D', '', 'g'), 10)
              AND length(regexp_replace(COALESCE(z.recipient_phone, ''), '\D', '', 'g')) >= 10
            LIMIT 1
        ),
        pub.data->>'name',
        'Desconhecido'
    ) AS recipient_name,
    COALESCE(z.publisher_id::text, pub.id::text) AS publisher_id,
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
FROM public.zapi_smart_interactions s

UNION ALL

-- 4. Z-API SMART OUTBOUND (Respostas do Bot)
SELECT
    s.id,
    s.created_at + interval '1 second' AS log_timestamp,
    'WHATSAPP'::text AS channel,
    'OUTBOUND'::text AS direction,
    'Sistema'::text AS sender_name,
    COALESCE(s.publisher_name, 'Desconhecido') AS recipient_name,
    s.publisher_id::text,
    s.workbook_part_id::text AS part_id,
    'SMART_REPLY'::text AS interaction_type,
    'SUCCESS'::text AS status_or_action,
    s.phone,
    s.outbound_reply_text AS content
FROM public.zapi_smart_interactions s
WHERE s.outbound_reply_text IS NOT NULL AND s.outbound_reply_text != '';

GRANT SELECT ON public.vw_canonical_communication_log TO authenticated;
GRANT SELECT ON public.vw_canonical_communication_log TO service_role;
