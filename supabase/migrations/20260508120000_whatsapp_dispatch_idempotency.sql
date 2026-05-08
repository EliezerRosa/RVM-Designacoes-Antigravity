-- ===========================================================================
-- Idempotência server-side de envios WhatsApp
-- ---------------------------------------------------------------------------
-- Motivação: dois admins do CS podem abrir o WhatsAppDispatcher em paralelo
-- para o mesmo evento. Hoje a marca "já enviado" é apenas calculada no UI,
-- então ambos veem "não enviado" e podem disparar dupla mensagem ao mesmo
-- destinatário. Esta migration:
--   1. Deduplica linhas históricas por (event_id, recipient_publisher_id,
--      message_hash) mantendo a mais antiga.
--   2. Cria índice único parcial — só vincula quando publisher_id e hash
--      estão presentes (envio avulso fica fora; pode repetir).
--   3. Substitui log_whatsapp_dispatch para usar ON CONFLICT DO NOTHING e
--      retornar { success:true, already_dispatched:true, dispatch_id } quando
--      o destinatário já foi contemplado para aquele texto. Não duplica
--      linha em announcement_history quando já existe.
-- ===========================================================================

-- 1. Dedup defensivo (só sobrescreve se houver duplicata real)
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY event_id, recipient_publisher_id, message_hash
               ORDER BY created_at, id
           ) AS rn
      FROM public.whatsapp_dispatch_log
     WHERE recipient_publisher_id IS NOT NULL
       AND message_hash IS NOT NULL
)
DELETE FROM public.whatsapp_dispatch_log
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Índice único parcial — idempotência por (evento, destinatário, conteúdo)
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_dispatch_idempotency
    ON public.whatsapp_dispatch_log (event_id, recipient_publisher_id, message_hash)
    WHERE recipient_publisher_id IS NOT NULL
      AND message_hash IS NOT NULL;

-- 3. RPC com ON CONFLICT
CREATE OR REPLACE FUNCTION public.log_whatsapp_dispatch(
    p_event_id UUID,
    p_actor_label TEXT,
    p_recipient_role TEXT,
    p_recipient_publisher_id TEXT,
    p_recipient_label TEXT,
    p_phone_masked TEXT,
    p_message_hash TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id BIGINT;
    v_already BOOLEAN := FALSE;
BEGIN
    IF NOT public.can_dispatch_announcement_whatsapp() THEN
        RAISE EXCEPTION 'Sem permissão para registrar envio WhatsApp' USING ERRCODE='42501';
    END IF;

    INSERT INTO public.whatsapp_dispatch_log
        (event_id, recipient_role, recipient_publisher_id, recipient_label,
         phone_masked, message_hash, dispatched_by_id, dispatched_by_label, metadata)
    VALUES (p_event_id, p_recipient_role, p_recipient_publisher_id, p_recipient_label,
            p_phone_masked, p_message_hash, auth.uid(), p_actor_label,
            COALESCE(p_metadata, '{}'::jsonb))
    ON CONFLICT ON CONSTRAINT uq_whatsapp_dispatch_idempotency DO NOTHING
    RETURNING id INTO v_id;

    -- Já dispachado para este destinatário/conteúdo: localiza linha existente.
    IF v_id IS NULL AND p_recipient_publisher_id IS NOT NULL AND p_message_hash IS NOT NULL THEN
        SELECT id INTO v_id
          FROM public.whatsapp_dispatch_log
         WHERE event_id = p_event_id
           AND recipient_publisher_id = p_recipient_publisher_id
           AND message_hash = p_message_hash
         ORDER BY created_at
         LIMIT 1;
        v_already := TRUE;
    END IF;

    -- Só registra histórico em envios novos.
    IF NOT v_already THEN
        INSERT INTO public.announcement_history
            (event_id, action, actor_id, actor_label, metadata)
        VALUES (p_event_id, 'whatsapp_dispatched', auth.uid(), p_actor_label,
                jsonb_build_object('dispatch_id', v_id, 'recipient_role', p_recipient_role,
                                   'recipient_label', p_recipient_label));
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'dispatch_id', v_id,
        'already_dispatched', v_already
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_whatsapp_dispatch(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

COMMENT ON INDEX public.uq_whatsapp_dispatch_idempotency IS
    'Idempotência: impede duplicar envio do mesmo conteúdo para o mesmo destinatário no mesmo evento. Avulsos (publisher_id NULL) ficam de fora.';
