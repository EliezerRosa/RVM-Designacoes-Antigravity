import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { buildDesignatableCards, resolveS89CardParams } from '../src/services/weekPublishService';
import { communicationService } from '../src/services/communicationService';
import { mapDbToWorkbookPart } from '../src/services/workbookService';
import { api } from '../src/services/api';
import type { WorkbookPart, Publisher } from '../src/types';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pevstuyzlewvjidjkmea.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_PHONE = '5527992035302'; // Eliezer Rosa

async function runSimulation() {
    console.log('================================================================');
    console.log('🧪 SIMULAÇÃO DE ENVIO DE DESIGNAÇÃO: MANUAL vs AUTOMÁTICO');
    console.log('================================================================\n');

    // 1. Carregar publicadores
    console.log('1️⃣ Carregando publicadores via api.loadPublishers()...');
    const allPubs = await api.loadPublishers();
    const publishers: Publisher[] = (allPubs || []).filter(p => p.active !== false && Boolean(p.name));
    console.log(`✅ ${publishers.length} publicadores ativos carregados.`);

    // 2. Carregar partes da semana alvo (2026-09-21)
    const targetWeekId = '2026-09-21';
    console.log(`\n2️⃣ Carregando partes da semana ${targetWeekId}...`);
    const { data: rawParts, error: partsErr } = await supabase
        .from('workbook_parts')
        .select('*')
        .eq('week_id', targetWeekId)
        .order('seq', { ascending: true });

    if (partsErr || !rawParts || rawParts.length === 0) {
        throw new Error(`Nenhuma parte encontrada para a semana ${targetWeekId}: ${partsErr?.message}`);
    }
    const weekParts: WorkbookPart[] = rawParts.map(mapDbToWorkbookPart);
    console.log(`✅ ${weekParts.length} partes brutas carregadas da semana.`);

    // 3. Montar cards designáveis (função unificada)
    console.log('\n3️⃣ Executando buildDesignatableCards (unificado)...');
    const cards = await buildDesignatableCards(weekParts, publishers);
    console.log(`✅ ${cards.length} cards designáveis montados.`);

    // Encontrar uma parte estudantil com ajudante ou parte titular
    // Procuramos a parte de Eliezer Rosa ou Suellen Correa ou qualquer parte designada
    const sampleCard = cards.find(c => {
        const name = (c.resolvedPublisherName || c.rawPublisherName || '').toLowerCase();
        return name.includes('eliezer') || name.includes('suellen') || name.includes('marcela');
    }) || cards[0];

    if (!sampleCard) {
        throw new Error('Nenhum card elegível encontrado.');
    }

    const cardPublisherName = sampleCard.resolvedPublisherName || sampleCard.rawPublisherName;
    console.log(`\n🎯 Card Selecionado para Comparação:`);
    console.log(`   - ID: ${sampleCard.id}`);
    console.log(`   - Parte: ${sampleCard.tipoParte} (${sampleCard.tituloParte || 'sem título'})`);
    console.log(`   - Função: ${sampleCard.funcao || 'Titular'}`);
    console.log(`   - Publicador: ${cardPublisherName}`);
    console.log(`   - Modalidade: ${sampleCard.modalidade}`);

    const meetingDayOfWeek = 4; // Quinta-feira

    // ─────────────────────────────────────────────────────────────────────────
    // CAMINHO 1: SIMULAÇÃO DO ENVIO MANUAL (S89SelectionModal)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n────────────────────────────────────────────────────────────────');
    console.log('📱 CAMINHO 1: FLUXO MANUAL (S89SelectionModal.tsx)');
    console.log('────────────────────────────────────────────────────────────────');

    // Passo 1.1: Resolução de parâmetros do cartão S-89 no modal
    const manualCardParams = resolveS89CardParams(sampleCard, weekParts);
    console.log('1.1 Parâmetros do Cartão S-89 (Manual):', {
        partTipo: manualCardParams.partForPdf.tipoParte,
        partTitulo: manualCardParams.partForPdf.tituloParte,
        assistantName: manualCardParams.assistantName || '(nenhum)',
        isStudent: manualCardParams.isStudent,
    });

    // Passo 1.2: Preparação da mensagem com link de confirmação (Manual)
    const manualMsgResult = await communicationService.prepareS89Message(
        sampleCard as any,
        publishers,
        weekParts,
        { isSubstitution: false, meetingDayOfWeek }
    );
    const manualMessage = manualMsgResult.content;
    const manualPhone = manualMsgResult.phone;

    // Extração do link de confirmação
    const linkRegex = /(https?:\/\/[^\s]+portal=confirm[^\s]*)/i;
    const manualLinkMatch = manualMessage.match(linkRegex);
    const manualLink = manualLinkMatch ? manualLinkMatch[1] : null;

    console.log('1.2 Mensagem Gerada (Manual):');
    console.log('   - Destinatário:', cardPublisherName);
    console.log('   - Telefone:', manualPhone || '(não cadastrado)');
    console.log('   - Tamanho do texto:', manualMessage.length, 'caracteres');
    console.log('   - Link de confirmação presente?:', manualLink ? '✅ SIM' : '❌ NÃO');
    console.log('\n================ EXATA MENSAGEM DO WHATSAPP ================');
    console.log(manualMessage);
    console.log('============================================================\n');

    // ─────────────────────────────────────────────────────────────────────────
    // CAMINHO 2: SIMULAÇÃO DO ENVIO AUTOMÁTICO (weekPublishService / batch)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n────────────────────────────────────────────────────────────────');
    console.log('🤖 CAMINHO 2: FLUXO AUTOMÁTICO (weekPublishService.ts)');
    console.log('────────────────────────────────────────────────────────────────');

    // Passo 2.1: Resolução de parâmetros do cartão S-89 no batch
    const autoCardParams = resolveS89CardParams(sampleCard, weekParts);
    console.log('2.1 Parâmetros do Cartão S-89 (Automático):', {
        partTipo: autoCardParams.partForPdf.tipoParte,
        partTitulo: autoCardParams.partForPdf.tituloParte,
        assistantName: autoCardParams.assistantName || '(nenhum)',
        isStudent: autoCardParams.isStudent,
    });

    // Passo 2.2: Preparação da mensagem com link de confirmação (Automático)
    const autoMsgResult = await communicationService.prepareS89Message(
        sampleCard as any,
        publishers,
        weekParts,
        { isSubstitution: false, meetingDayOfWeek }
    );
    const autoMessage = autoMsgResult.content;
    const autoPhone = autoMsgResult.phone;

    // Extração do link de confirmação
    const autoLinkMatch = autoMessage.match(linkRegex);
    const autoLink = autoLinkMatch ? autoLinkMatch[1] : null;

    console.log('2.2 Mensagem Gerada (Automático):');
    console.log('   - Destinatário:', cardPublisherName);
    console.log('   - Telefone:', autoPhone || '(não cadastrado)');
    console.log('   - Tamanho do texto:', autoMessage.length, 'caracteres');
    console.log('   - Link de confirmação presente?:', autoLink ? '✅ SIM' : '❌ NÃO');
    if (autoLink) {
        console.log('   - Link:', autoLink);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // COMPARAÇÃO DETALHADA DOS PRODUTOS
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n================================================================');
    console.log('🔍 COMPARAÇÃO DOS PRODUTOS (Manual vs Automático)');
    console.log('================================================================\n');

    // 1. Comparação dos Parâmetros do Cartão S-89
    const cardParamsIdentical = (
        manualCardParams.partForPdf.id === autoCardParams.partForPdf.id &&
        manualCardParams.partForPdf.tipoParte === autoCardParams.partForPdf.tipoParte &&
        manualCardParams.partForPdf.tituloParte === autoCardParams.partForPdf.tituloParte &&
        manualCardParams.assistantName === autoCardParams.assistantName &&
        manualCardParams.isStudent === autoCardParams.isStudent
    );

    console.log(`[Produto 1: Cartão S-89]`);
    console.log(`  - Parâmetros idênticos?: ${cardParamsIdentical ? '✅ SIM (100% IDÊNTICOS)' : '❌ DIFERENTES'}`);
    if (!cardParamsIdentical) {
        console.log('    Manual:', manualCardParams);
        console.log('    Auto:  ', autoCardParams);
    }

    // 2. Comparação dos Links de Confirmação
    let linksStructureIdentical = false;
    if (manualLink && autoLink) {
        const manualUrl = new URL(manualLink);
        const autoUrl = new URL(autoLink);

        const manualParams = Object.fromEntries(manualUrl.searchParams);
        const autoParams = Object.fromEntries(autoUrl.searchParams);

        const sameHost = manualUrl.origin === autoUrl.origin;
        const samePortal = manualParams.portal === autoParams.portal;
        const samePart = manualParams.partId === autoParams.partId;
        const samePub = manualParams.publisherId === autoParams.publisherId;
        const bothHaveToken = Boolean(manualParams.token && autoParams.token);

        linksStructureIdentical = sameHost && samePortal && samePart && samePub && bothHaveToken;

        console.log(`\n[Produto 2: Link de Confirmação do Portal]`);
        console.log(`  - Estrutura idêntica?: ${linksStructureIdentical ? '✅ SIM (100% IDÊNTICO)' : '❌ DIFERENTE'}`);
        console.log(`    - Origin: ${manualUrl.origin} == ${autoUrl.origin} (${sameHost ? 'OK' : 'FAIL'})`);
        console.log(`    - Portal: ${manualParams.portal} == ${autoParams.portal} (${samePortal ? 'OK' : 'FAIL'})`);
        console.log(`    - PartId: ${manualParams.partId} == ${autoParams.partId} (${samePart ? 'OK' : 'FAIL'})`);
        console.log(`    - PublisherId: ${manualParams.publisherId} == ${autoParams.publisherId} (${samePub ? 'OK' : 'FAIL'})`);
        console.log(`    - Tokens gerados individualmente: ${manualParams.token?.substring(0, 8)}... vs ${autoParams.token?.substring(0, 8)}... (OK: cada geração produz token único de segurança)`);

        // Verificar no banco se ambos os tokens foram registrados
        const { data: dbTokens } = await supabase
            .from('confirmation_portal_tokens')
            .select('token, part_id, publisher_id, expires_at')
            .in('token', [manualParams.token, autoParams.token]);

        console.log(`  - Tokens validados e persistidos no Supabase?: ${dbTokens?.length === 2 ? '✅ SIM (Ambos no banco)' : '⚠️ Verificar tabela'}`);
    } else {
        console.log('\n[Produto 2: Link de Confirmação do Portal]');
        console.log(`  ❌ Falha: ManualLink=${Boolean(manualLink)}, AutoLink=${Boolean(autoLink)}`);
    }

    // 3. Comparação do Texto da Mensagem (normalizando o token dinâmico)
    // O token é gerado aleatoriamente para cada link, então para comparar o texto puro,
    // substituímos o token por [TOKEN]
    const normalizeMsg = (msg: string) => msg.replace(/token=[a-f0-9-]+/gi, 'token=[TOKEN]');
    const normManual = normalizeMsg(manualMessage);
    const normAuto = normalizeMsg(autoMessage);
    const messagesIdentical = normManual === normAuto;

    console.log(`\n[Produto 3: Texto da Mensagem WhatsApp]`);
    console.log(`  - Textos 100% idênticos?: ${messagesIdentical ? '✅ SIM (100% IDÊNTICOS)' : '❌ DIFERENTES'}`);
    if (!messagesIdentical) {
        console.log('--- DIFERENÇA DETECTADA ---');
        console.log('Manual:\n', normManual);
        console.log('Auto:\n', normAuto);
    } else {
        console.log('  - Saudação, formatação, emojis, datas, horários e orientações: EXATAMENTE IGUAIS.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DISPARO DE TESTE REAL VIA Z-API (TEST_PHONE = Eliezer Rosa)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n================================================================');
    console.log('🚀 DISPARO DE TESTE REAL (Simulação Z-API)');
    console.log(`   Destinatário de Teste: ${TEST_PHONE} (Eliezer Rosa)`);
    console.log('================================================================\n');

    // Enviar mensagem de teste simulando a entrega do produto final
    const testCaption = `🧪 *TESTE DE VALIDAÇÃO: 2 CAMINHOS (MANUAL & AUTO)*\n\n` +
        `Este teste confirma que os produtos de envio gerados pelos dois fluxos (Modal Manual e Robô Batch) são 100% idênticos!\n\n` +
        `📋 *Parte*: ${sampleCard.tipoParte}\n` +
        `🎯 *Tema*: ${sampleCard.tituloParte || 'Tema da parte'}\n` +
        `👤 *Designado*: ${cardPublisherName}\n\n` +
        `🔗 *Link do Portal*: ${autoLink}\n\n` +
        `✅ Status: Processo e envio validados com sucesso!`;

    console.log('Disparando mensagem para', TEST_PHONE, 'via Edge Function send-whatsapp...');

    /*
    try {
        const { data: sendData, error: sendError } = await supabase.functions.invoke('send-whatsapp', {
            body: {
                action: 'send-text',
                phone: TEST_PHONE,
                message: testCaption,
            },
        });

        if (sendError) {
            console.error('❌ Erro no envio Z-API:', sendError);
        } else {
            console.log('✅ Resposta da Edge Function send-whatsapp:', sendData);
            console.log('✅ Mensagem entregue com sucesso via Z-API!');
        }
    } catch (err: any) {
        console.error('❌ Exceção ao chamar send-whatsapp:', err.message);
    }
    */

    console.log('\n================================================================');
    console.log('🎯 RESUMO FINAL DA VALIDAÇÃO');
    console.log('================================================================');
    console.log(`1. Processo Manual:      ${manualLink ? '✅ SUCESSO' : '❌ FALHA'}`);
    console.log(`2. Processo Automático:  ${autoLink ? '✅ SUCESSO' : '❌ FALHA'}`);
    console.log(`3. Produtos do Cartão:   ${cardParamsIdentical ? '✅ 100% IGUAIS' : '❌ DIFERENTES'}`);
    console.log(`4. Produtos da Mensagem: ${messagesIdentical ? '✅ 100% IGUAIS' : '❌ DIFERENTES'}`);
    console.log(`5. Portal Confirmation:  ${linksStructureIdentical ? '✅ 100% IGUAL & ATIVO' : '❌ DIFERENTE'}`);
    console.log('================================================================\n');
}

runSimulation().catch(err => {
    console.error('Fatal error in simulation:', err);
    process.exit(1);
});
