import './node-shims.cjs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pevstuyzlewvjidjkmea.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_PHONE = '5527981170400'; // Novo número de teste
const BOT_TOKEN = 'rvm_bot_8f4a1c9e2b7d3f5a0e6c8b1d4e7a9f2c';

async function runInteractiveTest() {
    console.log('================================================================');
    console.log('🚀 TESTE INTERATIVO DO S-89 (COM BOTÕES NATIVOS)');
    console.log('================================================================\n');

    // 1. Criar um publicador mockado para o telefone do bot para o Webhook achar a parte pendente
    const botPubId = '99999';
    await supabase.from('publishers').upsert({
        id: botPubId,
        data: { 
            name: 'Bot Teste', 
            phone: '5527981170400', 
            gender: 'M',
            privileges: { canPreside: false, canPray: false, canGiveTalks: false, canGiveStudentTalks: false, canReadCBS: false, canConductCBS: false }
        }
    });

    const testPartId = 'f26aa5d3-004f-41f8-8055-6b6ecd860938';
    
    const { error: updateError } = await supabase.from('workbook_parts').update({
        status: 'PROPOSTA',
        raw_publisher_name: 'Bot Teste',
        resolved_publisher_name: 'Bot Teste',
        resolved_publisher_id: botPubId
    }).eq('id', testPartId);
    if (updateError) throw new Error(`Update failed: ${updateError.message}`);
    console.log('✅ Parte criada com status PROPOSTA.');

    // 3. Criar token
    const { data: tokenData } = await supabase.from('confirmation_portal_tokens').insert({
        part_id: testPartId,
        publisher_id: botPubId
    }).select('token').single();
    const token = tokenData?.token;
    console.log(`✅ Token de confirmação criado: ${token}`);

    const availabilityUrl = `https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/?portal=confirm&partId=${testPartId}&publisherId=${botPubId}&token=${token}`;

    // 3. Texto do S-89 (semelhante ao S-89 normal sem a imagem)
    const content = `📋 *Designação S-89 — Reunião Vida e Ministério*\n👤 *Publicador:* Eliezer Rosa\n📅 *Data da Reunião:* quinta-feira, 15 de outubro de 2026\n⏰ *Horário:* 19:35\n📖 *Parte:* 5. Iniciando conversas\n\nPor favor, informe sua disponibilidade abaixo:`;

    const buttonActions = [
        { id: `CONFIRMAR:${testPartId}`, type: 'REPLY', label: '✅ Confirmar' },
        { id: `RECUSAR:${testPartId}`, type: 'REPLY', label: '❌ Não Poderei' },
        { id: `DISPONIBILIDADE:${testPartId}`, type: 'URL', label: '📅 Disponibilidade', url: availabilityUrl }
    ];

    console.log('📤 Enviando mensagem com botões nativos...');
    const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bot-token': BOT_TOKEN },
        body: JSON.stringify({
            action: 'send-button-actions',
            phone: TEST_PHONE,
            message: content,
            buttonActions
        })
    });

    const resJson = await res.json();
    if (resJson.success && resJson.messageId) {
        console.log(`✅ Mensagem enviada com sucesso! Message ID: ${resJson.messageId}`);
        
        await supabase.from('zapi_dispatch_log').insert({
            part_id: testPartId,
            message_id: resJson.messageId,
            dispatch_type: 'PUBLICACAO_S89',
            recipient_phone: TEST_PHONE,
            status: 'SUCCESS'
        });
        console.log('✅ Logado no zapi_dispatch_log.');
        console.log('\n⏳ AGUARDANDO SUA INTERAÇÃO NO WHATSAPP...');
    } else {
        console.error('❌ Falha ao enviar:', resJson);
    }
}

runInteractiveTest().catch(console.error);
