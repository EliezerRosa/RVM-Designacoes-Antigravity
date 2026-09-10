import './node-shims.cjs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pevstuyzlewvjidjkmea.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_PHONE = '5527992035302'; // Celular real para receber o teste (Eliezer Rosa)
const BASE_URL = 'https://rvm-designacoes-antigravity.vercel.app';
const BOT_TOKEN = 'rvm_bot_8f4a1c9e2b7d3f5a0e6c8b1d4e7a9f2c';

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

async function runOpcaoBCardsTest() {
  console.log('================================================================');
  console.log('🚀 DISPARO REAL — TESTE OPÇÃO B: 3 CARDS INDEPENDENTES');
  console.log('================================================================\n');

  // 1. Localizar o publicador fictício no Supabase
  const { data: pubs, error: pubErr } = await supabase
    .from('publishers')
    .select('id, data');

  if (pubErr || !pubs) {
    throw new Error('Falha ao carregar publicadores do Supabase.');
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

  // 2. Criar ou resetar parte de teste no banco para o publicador fictício
  const testPartId = 'test-part-opcao-b-ficticio';
  const testWeekId = '2026-10-05';

  const { data: existingPart } = await supabase
    .from('workbook_parts')
    .select('*')
    .eq('id', testPartId)
    .maybeSingle();

  if (!existingPart) {
    console.log('📝 Criando registro de designação de teste para o Fictício...');
    await supabase.from('workbook_parts').insert({
      id: testPartId,
      week_id: testWeekId,
      date: '2026-10-08',
      section: 'faça seu melhor',
      tipo_parte: '5. Iniciando conversas',
      part_title: '5. Iniciando conversas (Demonstração Opção B)',
      modalidade: 'Principal',
      seq: 5,
      status: 'ENVIADA',
      raw_publisher_name: ficticioName,
      resolved_publisher_name: ficticioName,
      resolved_publisher_id: ficticioId,
      hora_inicio: '19:35',
    });
  } else {
    console.log('📝 Resetando parte de teste no banco...');
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

  // 3. Gerar tokens de acesso para os links dos cards
  const confirmToken = `tok-b-${Date.now()}`;
  await supabase.from('confirmation_portal_tokens').insert({
    part_id: testPartId,
    publisher_id: ficticioId,
    token: confirmToken,
    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
  });

  // Token de disponibilidade
  const availToken = `avail-b-${Date.now()}`;
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'availability_tokens')
    .maybeSingle();

  const currentTokens = Array.isArray(settingsRow?.value) ? settingsRow.value : [];
  currentTokens.push({
    token: availToken,
    publisherId: ficticioId,
    publisherName: ficticioName,
    createdAt: new Date().toISOString(),
    active: true,
  });

  await supabase.from('settings').upsert({
    key: 'availability_tokens',
    value: currentTokens,
  });

  console.log(`🔑 Tokens gerados com sucesso:`);
  console.log(`   - Confirmação/Recusa: ${confirmToken}`);
  console.log(`   - Disponibilidade: ${availToken}\n`);

  // URLs dos cards
  const confirmUrl = `${BASE_URL}/?portal=confirm&id=${testPartId}&publisher_id=${ficticioId}&token=${confirmToken}&action=confirm`;
  const declineUrl = `${BASE_URL}/?portal=confirm&id=${testPartId}&publisher_id=${ficticioId}&token=${confirmToken}&action=decline`;
  const availUrl = `${BASE_URL}/?portal=availability&token=${availToken}`;

  // Baixar ícones oficiais e converter em Base64 para a Z-API
  console.log('🎨 Baixando e convertendo ícones visuais em Base64...');
  const checkIconB64 = await fetchAsBase64('https://raw.githubusercontent.com/google/material-design-icons/master/png/action/check_circle/materialicons/48dp/2x/baseline_check_circle_black_48dp.png');
  const cancelIconB64 = await fetchAsBase64('https://raw.githubusercontent.com/google/material-design-icons/master/png/navigation/cancel/materialicons/48dp/2x/baseline_cancel_black_48dp.png');
  const calendarIconB64 = await fetchAsBase64('https://raw.githubusercontent.com/google/material-design-icons/master/png/action/event/materialicons/48dp/2x/baseline_event_black_48dp.png');
  console.log('   ✅ Ícones convertidos com sucesso.\n');

  // Helper para chamar send-whatsapp
  async function dispatch(payload: any, label: string) {
    console.log(`📤 Enviando: ${label}...`);
    const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-token': BOT_TOKEN,
        'Authorization': `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data.success) {
      console.log(`   ✅ ${label} enviado! Message ID: ${data.messageId}`);
      if (data.messageId) {
        await supabase.from('zapi_dispatch_log').insert({
          part_id: testPartId,
          message_id: data.messageId,
          dispatch_type: `OPCAO_B_${label.toUpperCase().replace(/\s+/g, '_')}`,
          recipient_phone: TEST_PHONE,
          status: 'SUCCESS',
        });
      }
    } else {
      console.error(`   ❌ Falha ao enviar ${label}:`, data);
    }
    return data;
  }

  // 4. Mensagem Principal do S-89
  const s89Message = `📋 *Designação S-89 — Reunião Vida e Ministério*
👤 *Publicador:* ${ficticioName}
📅 *Data da Reunião:* quinta-feira, 8 de outubro de 2026
⏰ *Horário:* 19:35
🏛️ *Local:* SALÃO PRINCIPAL
📖 *Parte:* 5. Iniciando conversas
📝 *Tema:* "5. Iniciando conversas (Demonstração)"

Por favor, escolha uma das 3 opções abaixo para responder à sua designação:`;

  await dispatch({
    action: 'send-text',
    phone: TEST_PHONE,
    message: s89Message,
  }, 'S-89 Mensagem Base');

  // Intervalo de 1.5s entre envios para garantir ordem de entrega no WhatsApp
  await new Promise(r => setTimeout(r, 1500));

  // 5. Card 1: Confirmar Presença
  await dispatch({
    action: 'send-link',
    phone: TEST_PHONE,
    message: '👉 *Opção 1: Se você puder realizar a parte*',
    linkUrl: confirmUrl,
    title: '✅ Confirmar Participação',
    linkDescription: 'Toque para confirmar sua presença nesta designação',
    image: checkIconB64,
  }, 'Card 1 (Confirmar)');

  await new Promise(r => setTimeout(r, 1500));

  // 6. Card 2: Não Poderei
  await dispatch({
    action: 'send-link',
    phone: TEST_PHONE,
    message: '👉 *Opção 2: Se você tiver algum impedimento*',
    linkUrl: declineUrl,
    title: '❌ Não Poderei Participar',
    linkDescription: 'Toque para informar sua impossibilidade e justificativa',
    image: cancelIconB64,
  }, 'Card 2 (Não Poderei)');

  await new Promise(r => setTimeout(r, 1500));

  // 7. Card 3: Informar Disponibilidade
  await dispatch({
    action: 'send-link',
    phone: TEST_PHONE,
    message: '👉 *Opção 3: Se precisar registrar datas de ausência ou viagens*',
    linkUrl: availUrl,
    title: '📅 Atualizar Disponibilidade',
    linkDescription: 'Toque para gerenciar sua agenda teocrática e viagens',
    image: calendarIconB64,
  }, 'Card 3 (Disponibilidade)');

  console.log('\n================================================================');
  console.log('🎉 DISPARO DA OPÇÃO B CONCLUÍDO COM SUCESSO!');
  console.log('Verifique agora as 4 mensagens recebidas no WhatsApp 5527992035302:');
  console.log(' 1. S-89 Base');
  console.log(' 2. Card [ ✅ Confirmar Participação ]');
  console.log(' 3. Card [ ❌ Não Poderei Participar ]');
  console.log(' 4. Card [ 📅 Atualizar Disponibilidade ]');
  console.log('================================================================\n');
}

runOpcaoBCardsTest().catch(err => {
  console.error('Erro fatal durante teste da Opção B:', err);
  process.exit(1);
});
