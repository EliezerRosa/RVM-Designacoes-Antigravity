import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkDetailedStatus() {
    const { data: publishers } = await supabase.from('publishers').select('*');
    const pubMap = new Map();
    for (const p of publishers) {
        if (p.data && p.data.phone) {
            pubMap.set(p.id, p);
        }
    }

    const { data: parts } = await supabase.from('workbook_parts').select('*').eq('status', 'PROPOSTA');
    if (!parts || parts.length === 0) return;

    for (const part of parts) {
        let pubId = part.resolved_publisher_id;
        if (!pubId) {
            const p = publishers.find(p => p.data?.name?.trim() === part.raw_publisher_name?.trim());
            pubId = p?.id;
        }
        
        const pub = pubMap.get(pubId);
        const name = pub ? pub.data.name : (part.raw_publisher_name || 'Desconhecido');

        const { data: logs } = await supabase
            .from('zapi_dispatch_log')
            .select('dispatch_type, status, dispatched_at, recipient_phone')
            .eq('part_id', part.id)
            .order('dispatched_at', { ascending: false });

        console.log('\n==============================================');
        console.log('Parte: ' + part.tipo_parte + ' | Titulo: ' + (part.titulo_parte || 'N/A'));
        console.log('Semana: ' + part.week_id + ' | Publicador: ' + name);
        console.log('Status da Parte no App: ' + part.status);
        
        if (!logs || logs.length === 0) {
            console.log('-> NENHUMA mensagem enviada para esta parte via Z-API.');
        } else {
            console.log('-> Encontrei ' + logs.length + ' envios via Z-API para esta parte:');
            for (const log of logs) {
                console.log('   [' + log.dispatched_at + '] Tipo: ' + log.dispatch_type + ' | Status: ' + log.status + ' | Fone: ' + log.recipient_phone);
            }
        }
    }
}

checkDetailedStatus();
