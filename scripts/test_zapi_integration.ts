import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_PHONE = '5527992035302';

async function run() {
    console.log('🔄 Iniciando script de testes do Z-API...');

    // 1. Ativar automação
    console.log('1️⃣ Ativando automação Z-API...');
    await supabase.from('settings').upsert({ key: 'zapi_automation_active', value: 'true' });
    
    // 2. Definir o test phone como o Admin Group ID para receber os Alertas de Recusa
    await supabase.from('settings').upsert({ key: 'zapi_group_id', value: TEST_PHONE });

    // 3. Buscar uma parte da semana de 22 de junho de 2026 que esteja DESIGNADA
    console.log('2️⃣ Buscando uma parte não respondida de 2026-06-22...');
    const { data: parts, error: partsErr } = await supabase
        .from('workbook_parts')
        .select('*')
        .eq('week_id', '2026-06-22')
        .eq('status', 'DESIGNADA')
        .limit(1);

    if (partsErr || !parts || parts.length === 0) {
        console.error('❌ Nenhuma parte encontrada.', partsErr);
        return;
    }

    const part = parts[0];
    console.log(`✅ Parte encontrada: ${part.tipo_parte} - ${part.raw_publisher_name}`);

    // 4. Temporariamente alterar o telefone do publicador para o TEST_PHONE
    let pubId = null;
    const { data: profiles } = await supabase.from('profiles').select('publisher_id').eq('full_name', part.raw_publisher_name).maybeSingle();
    if (profiles && profiles.publisher_id) {
        pubId = profiles.publisher_id;
    } else {
        const { data: pubs } = await supabase.from('publishers').select('id').eq('name', part.raw_publisher_name).maybeSingle();
        pubId = pubs?.id;
    }

    let oldPhone = null;
    if (pubId) {
        const { data: pubData } = await supabase.from('publishers').select('phone').eq('id', pubId).single();
        oldPhone = pubData?.phone;
        console.log(`3️⃣ Alterando temporariamente o telefone do publicador ${part.raw_publisher_name} de ${oldPhone} para ${TEST_PHONE}`);
        await supabase.from('publishers').update({ phone: TEST_PHONE }).eq('id', pubId);
    }

    // 5. Gerar link de confirmação público
    console.log('4️⃣ Gerando link público de confirmação...');
    const { data: tokenData, error: tokenErr } = await supabase.rpc('create_confirmation_portal_token', {
        p_part_id: part.id,
        p_publisher_id: pubId
    });

    if (tokenErr) {
        console.error('❌ Falha ao gerar token', tokenErr);
    } else {
        const tokenStr = typeof tokenData === 'string' ? tokenData : (tokenData as any)?.token;
        const link = `http://localhost:5173/?portal=confirm&id=${part.id}&publisherId=${pubId}&token=${tokenStr}`;
        console.log(`\n======================================\n🔗 LINK PÚBLICO GERADO:\n${link}\n======================================\n`);
        console.log('Opcional: Você pode abrir este link no navegador (logando com qualquer conta Google) e clicar em Aceitar ou Recusar.');
    }

    // 6. Teste da Edge Function Z-API usando o método sendText
    console.log('\n5️⃣ Disparando uma mensagem de teste do Edge Function Z-API...');
    
    const msgPayload = {
        phone: TEST_PHONE,
        message: `🤖 *Teste Automático Antigravity*\n\nOlá! Este é um teste da integração Z-API.\nA parte selecionada foi: *${part.tipo_parte}*.\nSe você recebeu isso, a Edge Function está funcionando!`,
        action: 'send-text'
    };

    try {
        const response = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify(msgPayload)
        });
        
        const resData = await response.json();
        console.log('Resultado do Envio Z-API:', resData);
    } catch (err) {
        console.error('❌ Erro na chamada da Edge Function:', err);
    }

    // 7. Restaurar o telefone
    if (pubId && oldPhone !== null) {
        console.log(`6️⃣ Restaurando telefone original do publicador... (${oldPhone})`);
        await supabase.from('publishers').update({ phone: oldPhone }).eq('id', pubId);
    }

    console.log('\n✅ Script de testes finalizado.');
}

run();
