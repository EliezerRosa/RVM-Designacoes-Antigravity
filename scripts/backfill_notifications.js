import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function backfill() {
    console.log('Iniciando backfill (retroativo) da tabela notifications para zapi_dispatch_log...');
    
    const { data: notifications, error: notifError } = await supabase
        .from('notifications')
        .select('*')
        .in('type', ['S89', 'S140'])
        .eq('status', 'SENT');

    if (notifError) {
        console.error('Erro ao buscar notificações:', notifError);
        return;
    }

    console.log(`Encontradas ${notifications.length} notificações elegíveis.`);

    let inserted = 0;
    let skipped = 0;

    for (const notif of notifications) {
        const partId = notif.metadata?.partId || null;
        if (notif.type === 'S89' && !partId) {
            skipped++;
            continue;
        }

        const dispatchType = notif.type === 'S89' ? 'PUBLICACAO_S89' : 'PUBLICACAO_S140';
        const messageId = notif.metadata?.messageId || 'MANUAL_WHATSAPP';
        const isManual = String(messageId).startsWith('MANUAL');
        const status = isManual ? 'SUCCESS_MANUAL' : 'SUCCESS';

        let existingQuery = supabase
            .from('zapi_dispatch_log')
            .select('id')
            .eq('dispatch_type', dispatchType)
            .eq('message_id', messageId);

        if (partId) {
            existingQuery = existingQuery.eq('part_id', partId);
        } else {
            existingQuery = existingQuery.is('part_id', null);
        }

        const { data: existing } = await existingQuery.maybeSingle();

        if (existing) {
            skipped++;
            continue;
        }

        const { error: insertError } = await supabase
            .from('zapi_dispatch_log')
            .insert({
                part_id: partId,
                dispatch_type: dispatchType,
                recipient_phone: notif.recipient_phone || '',
                status: status,
                message_id: messageId,
                dispatched_at: notif.created_at // Mantém a data original do disparo
            });

        if (insertError) {
            console.error(`Erro ao inserir log para partId ${partId}:`, insertError);
        } else {
            inserted++;
        }
    }

    console.log(`Backfill concluído! Inseridos: ${inserted}. Ignorados/Já existentes: ${skipped}.`);
}

backfill();
