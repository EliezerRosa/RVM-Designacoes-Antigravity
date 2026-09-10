import './node-shims.cjs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import { generateWhatsAppMessage, generateS89PngBase64 } from '../src/services/s89Generator';
import { zapiOrchestrator } from '../src/services/zapiOrchestrator';
import { communicationService } from '../src/services/communicationService';
import type { WorkbookPart } from '../src/types/workbook';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pevstuyzlewvjidjkmea.supabase.co';
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!).trim();
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_PHONE = '5527992035302'; // Telefone real de Eliezer Rosa

async function runEndToEndTest() {
  console.log('================================================================');
  console.log('🚀 TESTE DE PONTA A PONTA: FLUXO S-89 COM BOTÕES NATIVOS');
  console.log('================================================================\n');

  // 1. Localizar o publicador Eliezer Rosa
  const { data: pubs, error: pubErr } = await supabase
    .from('publishers')
    .select('id, data');

  if (pubErr || !pubs) {
    throw new Error('Falha ao consultar publicadores do Supabase.');
  }

  const eliezer = pubs.find(p => p.id === '3' || (p.data?.name && p.data.name.includes('Eliezer')));
  if (!eliezer) {
    throw new Error('Publicador "Eliezer Rosa" não encontrado.');
  }

  const publisherId = String(eliezer.id);
  const publisherName = eliezer.data?.name || 'Eliezer Rosa';
  const publisherGender = (eliezer.data?.gender as 'brother' | 'sister') || 'brother';

  console.log(`👤 Publicador: ${publisherName} (ID: ${publisherId})`);
  console.log(`📱 Telefone de Teste: ${TEST_PHONE}`);

  // 2. Obter link pessoal de disponibilidade (Eliezer Rosa)
  const availabilityUrl = await communicationService.getOrCreateAvailabilityLink(publisherId, publisherName);
  console.log(`🔗 Link de Disponibilidade Pessoal: ${availabilityUrl}\n`);

  // 3. Obter um batch_id válido no banco
  const { data: samplePart } = await supabase
    .from('workbook_parts')
    .select('batch_id')
    .not('batch_id', 'is', null)
    .limit(1)
    .maybeSingle();
  const sampleBatchId = samplePart?.batch_id || '00000000-0000-0000-0000-000000000000';

  // 4. Criar ou resetar parte de teste no banco
  const testPartId = 'fa000000-0000-4000-8000-000000000001';
  const testWeekId = '2026-10-05';

  const testPart: WorkbookPart = {
    id: testPartId,
    batch_id: sampleBatchId,
    weekId: testWeekId,
    week_id: testWeekId,
    date: '2026-10-08',
    section: 'faça seu melhor',
    tipoParte: '5. Iniciando conversas',
    tipo_parte: '5. Iniciando conversas',
    tituloParte: '5. Iniciando conversas (Demonstração com Botões Nativos)',
    part_title: '5. Iniciando conversas (Demonstração com Botões Nativos)',
    modalidade: 'Principal',
    seq: 5,
    status: 'ENVIADA',
    rawPublisherName: publisherName,
    resolvedPublisherName: publisherName,
    resolvedPublisherId: publisherId,
    horaInicio: '19:35',
  } as any;

  console.log('📝 Configurando designação de teste no banco de dados...');
  const { error: upsertErr } = await supabase.from('workbook_parts').upsert({
    id: testPartId,
    batch_id: sampleBatchId,
    week_id: testWeekId,
    week_display: '5-11 de Outubro',
    date: '2026-10-08',
    section: 'faça seu melhor',
    tipo_parte: testPart.tipoParte,
    part_title: testPart.tituloParte,
    modalidade: 'Principal',
    seq: 5,
    status: 'ENVIADA',
    raw_publisher_name: publisherName,
    resolved_publisher_name: publisherName,
    resolved_publisher_id: publisherId,
    hora_inicio: '19:35',
    had_refusal: false,
    needs_reassignment: false,
    rejected_reason: null,
  });

  if (upsertErr) {
    console.error('Erro ao preparar parte de teste:', upsertErr);
  } else {
    console.log('   ✅ Parte de teste pronta com status ENVIADA.');
  }

  // 5. Obter Cartão PNG do S-89
  console.log('🎨 Preparando imagem PNG do Cartão S-89...');
  let imageBase64: string | null = null;
  try {
    imageBase64 = await generateS89PngBase64(testPart, undefined, undefined, true);
  } catch (err) {
    // Em ambiente Node puro sem DOM Canvas, usa asset PNG local real
  }

  if (!imageBase64) {
    const demoPath = './.vercel/output/static/territories/territory_card_01.png';
    if (fs.existsSync(demoPath)) {
      imageBase64 = fs.readFileSync(demoPath).toString('base64');
    } else {
      imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    }
  }
  console.log('   ✅ Imagem PNG pronta.');

  // 6. Montar a Mensagem usando o serviço centralizado (DRY)
  console.log('📄 Formatando mensagem com generateWhatsAppMessage (isZApiFlow = true)...');
  const message = generateWhatsAppMessage(
    testPart,
    publisherGender,
    undefined, // sem parceiro
    undefined,
    false,     // titular
    'Edmardo Queiroz',
    '27999999999',
    undefined, // sem URL de confirmação no texto
    false,     // não é substituição
    4,         // quinta-feira
    availabilityUrl || undefined,
    true       // isZApiFlow = true (sem blocos de pseudo-botões de texto)
  );

  console.log('\n--- PRÉVIA DA MENSAGEM ---');
  console.log(message);
  console.log('--------------------------\n');

  // 7. Disparar via zapiOrchestrator.sendS89Direct
  console.log('📤 Disparando S-89 via zapiOrchestrator.sendS89Direct...');
  const sendRes = await zapiOrchestrator.sendS89Direct(
    testPartId,
    TEST_PHONE,
    message,
    imageBase64,
    undefined, // sem travar por idempotency para permitir repetição no teste
    availabilityUrl || undefined
  );

  console.log('Resultado do envio:', sendRes);

  if (!sendRes.success) {
    throw new Error(`Falha no envio Z-API: ${sendRes.error}`);
  }

  // 8. Registrar explicitamente no zapi_dispatch_log para testar a Invariante de Causalidade Estrita
  if (sendRes.messageId) {
    await supabase.from('zapi_dispatch_log').insert({
      part_id: testPartId,
      message_id: sendRes.messageId,
      dispatch_type: 'PUBLICACAO_S89',
      recipient_phone: TEST_PHONE,
      status: 'SUCCESS',
      dispatched_at: new Date().toISOString(),
    });
    console.log(`   ✅ Registrado no zapi_dispatch_log (message_id: ${sendRes.messageId}).`);
  }

  console.log('\n================================================================');
  console.log('🎉 DISPARO REAL CONCLUÍDO COM SUCESSO!');
  console.log('================================================================');
  console.log('Abra o WhatsApp no celular e confira:');
  console.log('1. Chegada da imagem do cartão S-89 (sem legenda).');
  console.log('2. Chegada da mensagem formatada com os 3 botões nativos:');
  console.log('   - [ ✅ Confirmar ]');
  console.log('   - [ ❌ Não Poderei ]');
  console.log('   - [ 📅 Disponibilidade ]');
  console.log('3. Teste o botão [ 📅 Disponibilidade ]: deve abrir direto seu painel no navegador.');
  console.log('4. Teste o botão [ ✅ Confirmar ]: o bot responderá e o Supabase será atualizado!');
  console.log('================================================================\n');
}

runEndToEndTest().catch(err => {
  console.error('Erro no teste de ponta a ponta:', err);
  process.exit(1);
});
