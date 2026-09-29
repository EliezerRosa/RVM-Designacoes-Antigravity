import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkPendingPings() {
    const nowBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const utcToday = Date.UTC(nowBRT.getUTCFullYear(), nowBRT.getUTCMonth(), nowBRT.getUTCDate());

    console.log('Hoje (UTC para calculo BRT): ' + utcToday);

    // Busca publishers para avaliar a aquiescencia
    const { data: publishers } = await supabase.from('publishers').select('*');
    const pubMap = new Map();
    for (const p of publishers) {
        if (p.data && p.data.phone) {
            pubMap.set(p.id, p);
        }
    }

    // Partes com status PROPOSTA
    const { data: parts } = await supabase.from('workbook_parts').select('*').eq('status', 'PROPOSTA');
    console.log('Encontradas ' + (parts ? parts.length : 0) + ' partes em status PROPOSTA.');

    if (!parts || parts.length === 0) return;

    for (const part of parts) {
        // Ignorar ruidos (canticos/oracoes)
        const tipo = (part.tipo_parte || '').toLowerCase();
        if (tipo.includes('cântico') || tipo.includes('oração') || tipo.includes('cantico') || tipo.includes('oracao')) {
            continue;
        }

        let pubId = part.resolved_publisher_id;
        if (!pubId) {
            // Busca por nome
            const p = publishers.find(p => p.data?.name?.trim() === part.raw_publisher_name?.trim());
            pubId = p?.id;
        }

        const pub = pubMap.get(pubId);
        if (!pub) {
            console.log('[IGNORADA] Parte ' + part.id + ' (' + part.tipo_parte + ') - Publicador nao encontrado ou sem telefone.');
            continue;
        }

        const condition = pub.data?.condition || '';
        const isAcquiescence = ['Ancião', 'Anciao', 'Servo Ministerial'].includes(condition);

        if (isAcquiescence) {
            console.log('[IGNORADA] Parte ' + part.id + ' (' + part.tipo_parte + ') - Publicador ' + pub.data.name + ' eh ' + condition + ' (Aquiescencia Tacita).');
            continue;
        }

        // Verifica envio de PUBLICACAO_S89
        const { data: s89Log } = await supabase
            .from('zapi_dispatch_log')
            .select('id')
            .eq('part_id', part.id)
            .eq('dispatch_type', 'PUBLICACAO_S89')
            .eq('status', 'SUCCESS')
            .limit(1)
            .maybeSingle();

        if (!s89Log) {
            console.log('[IGNORADA] Parte ' + part.id + ' (' + part.tipo_parte + ') - Publicador ' + pub.data.name + ' nao teve PUBLICACAO_S89 enviado.');
            continue;
        }

        // Verifica ultimo envio (para contar os 3 dias)
        const { data: latestDispatch } = await supabase
            .from('zapi_dispatch_log')
            .select('dispatched_at')
            .eq('part_id', part.id)
            .eq('recipient_phone', pub.data.phone)
            .eq('status', 'SUCCESS')
            .order('dispatched_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (latestDispatch) {
            const dispatchTime = new Date(latestDispatch.dispatched_at);
            const dispatchBRT = new Date(dispatchTime.getTime() - 3 * 60 * 60 * 1000);
            const utcDispatch = Date.UTC(dispatchBRT.getUTCFullYear(), dispatchBRT.getUTCMonth(), dispatchBRT.getUTCDate());
            
            const diffDays = Math.round((utcToday - utcDispatch) / (1000 * 60 * 60 * 24));
            
            if (diffDays >= 3) {
                console.log('[ELEGIVEL!] Parte ' + part.id + ' (' + part.tipo_parte + ') - Publicador ' + pub.data.name + ' - Ultimo envio ha ' + diffDays + ' dias.');
            } else {
                console.log('[IGNORADA] Parte ' + part.id + ' (' + part.tipo_parte + ') - Publicador ' + pub.data.name + ' - Ultimo envio ha ' + diffDays + ' dias (precisa ser >= 3).');
            }
        } else {
            console.log('[IGNORADA] Parte ' + part.id + ' (' + part.tipo_parte + ') - Sem log de ultimo disparo para contar dias.');
        }
    }
}

checkPendingPings();
