import './node-shims.cjs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pevstuyzlewvjidjkmea.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_PHONE = '5527992035302'; // Celular real do Eliezer Rosa para receber o teste
const BOT_TOKEN = 'rvm_bot_8f4a1c9e2b7d3f5a0e6c8b1d4e7a9f2c';

async function runEnqueteNativaTest() {
  console.log('================================================================');
  console.log('🚀 TESTE COM ENQUETE NATIVA DO WHATSAPP (POLL) — Z-API');
  console.log('================================================================\n');

  // 1. Identificar o publicador fictício
  const { data: pubs, error: pubErr } = await supabase
    .from('publishers')
    .select('id, data');

  if (pubErr || !pubs) {
    throw new Error('Falha ao consultar publicadores do Supabase.');
  }

  const ficticio = pubs.find(p => p.data?.name === 'Fictício Teste' && Boolean(p.id))
    || pubs.find(p => /fict[íi]cio/i.test(p.data?.name || '') && Boolean(p.id));

  if (!ficticio) {
    throw new Error('Publicador "Fictício Teste" não encontrado com ID válido.');
  }

  const ficticioId = String(ficticio.id);
  const ficticioName = ficticio.data.name;
  console.log(`👤 Publicador fictício designado: ${ficticioName} (ID: ${ficticioId})`);
  console.log(`📱 Telefone real de recebimento: ${TEST_PHONE}\n`);

  // 2. Criar ou resetar a parte de teste no banco
  const testPartId = 'fa000000-0000-4000-8000-000000000001';
  const testWeekId = '2026-10-05';

  const { data: samplePart } = await supabase
    .from('workbook_parts')
    .select('batch_id')
    .limit(1)
    .single();
  const sampleBatchId = samplePart?.batch_id;

  const { data: existingPart } = await supabase
    .from('workbook_parts')
    .select('*')
    .eq('id', testPartId)
    .maybeSingle();

  if (!existingPart) {
    console.log('📝 Criando registro de designação de teste para o Fictício...');
    const { error: insErr } = await supabase.from('workbook_parts').insert({
      id: testPartId,
      batch_id: sampleBatchId,
      week_id: testWeekId,
      week_display: '5-11 de Outubro',
      date: '2026-10-08',
      section: 'faça seu melhor',
      tipo_parte: '5. Iniciando conversas',
      part_title: '5. Iniciando conversas (Demonstração com Enquete Nativa)',
      modalidade: 'Principal',
      seq: 5,
      status: 'ENVIADA',
      raw_publisher_name: ficticioName,
      resolved_publisher_name: ficticioName,
      resolved_publisher_id: ficticioId,
      hora_inicio: '19:35',
    });
    if (insErr) console.error('Erro ao inserir parte de teste:', insErr);
  } else {
    console.log('📝 Resetando status da parte para ENVIADA...');
    await supabase.from('workbook_parts').update({
      status: 'ENVIADA',
      resolved_publisher_id: ficticioId,
      resolved_publisher_name: ficticioName,
      raw_publisher_name: ficticioName,
      had_refusal: false,
      needs_reassignment: false,
      rejected_reason: null,
    }).eq('id', testPartId);
  }

  // 3. Disparar a mensagem de texto base com os dados do S-89
  const s89Message = `📋 *Designação S-89 — Reunião Vida e Ministério*
👤 *Publicador:* ${ficticioName}
📅 *Data da Reunião:* quinta-feira, 8 de outubro de 2026
⏰ *Horário:* 19:35
🏛️ *Local:* SALÃO PRINCIPAL
📖 *Parte:* 5. Iniciando conversas
📝 *Tema:* "5. Iniciando conversas (Demonstração com Enquete)"`;

  console.log('📤 1. Enviando mensagem base S-89...');
  const resMsg = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bot-token': BOT_TOKEN,
      'Authorization': `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      action: 'send-text',
      phone: TEST_PHONE,
      message: s89Message,
    }),
  });

  const dataMsg = await resMsg.json();
  if (!dataMsg.success) {
    throw new Error(`Falha ao enviar mensagem base S-89: ${JSON.stringify(dataMsg)}`);
  }
  console.log(`   ✅ S-89 enviado com sucesso! Message ID: ${dataMsg.messageId}\n`);

  // Pequena pausa para garantir ordem no WhatsApp
  await new Promise(r => setTimeout(r, 1000));

  // 4. Disparar a Enquete Nativa (Poll)
  console.log('📤 2. Enviando Enquete Nativa (Poll) de 1 toque...');
  const pollQuestion = 'Como você responde à sua designação de 5. Iniciando conversas?';
  const pollOptions = [
    { name: '✅ Confirmar Participação' },
    { name: '❌ Não Poderei' },
    { name: '📅 Informar Disponibilidade' },
  ];

  const resPoll = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bot-token': BOT_TOKEN,
      'Authorization': `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      action: 'send-poll',
      phone: TEST_PHONE,
      message: pollQuestion,
      poll: pollOptions,
    }),
  });

  const dataPoll = await resPoll.json();
  if (!dataPoll.success || !dataPoll.messageId) {
    throw new Error(`Falha ao enviar Enquete Z-API: ${JSON.stringify(dataPoll)}`);
  }

  console.log(`   ✅ Enquete enviada com sucesso!`);
  console.log(`   - Message ID da Enquete: ${dataPoll.messageId}`);
  console.log(`   - Part ID vinculado: ${testPartId}`);

  // 5. Vincular a mensagem da Enquete ao part_id no zapi_dispatch_log
  // O zapi-smart-webhook consulta esta tabela para saber qual designação foi votada!
  await supabase.from('zapi_dispatch_log').insert({
    part_id: testPartId,
    message_id: dataPoll.messageId,
    dispatch_type: 'S89_POLL_NATIVE',
    recipient_phone: TEST_PHONE,
    status: 'SUCCESS',
  });

  console.log(`   ✅ Registrado no zapi_dispatch_log para rastreamento de voto pelo webhook.`);

  console.log('\n================================================================');
  console.log('🎉 DISPARO DA ENQUETE CONCLUÍDO!');
  console.log('Verifique o WhatsApp agora no seu celular.');
  console.log('Você pode votar em uma das opções para ver a resposta imediata do robô!');
  console.log('================================================================\n');
}

runEnqueteNativaTest().catch(err => {
  console.error('Erro no teste da Enquete Nativa:', err);
  process.exit(1);
});
