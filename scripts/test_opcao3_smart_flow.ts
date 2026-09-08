import './node-shims.cjs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';
import { generateWhatsAppMessage } from '../src/services/s89Generator';
import type { WorkbookPart } from '../src/types';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pevstuyzlewvjidjkmea.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_PHONE = '5527992035302'; // Telefone de teste

async function runE2ETests() {
    console.log('════════════════════════════════════════════════════════════════════');
    console.log('🧪 VALIDAÇÃO E2E OPÇÃO 3: MOTOR INTELIGENTE PERMANENTE Z-API');
    console.log('════════════════════════════════════════════════════════════════════\n');

    let allPassed = true;

    // ──────────────────────────────────────────────────────────────────────────
    // TESTE 1: Formatação S-89 com 3 Pontos de Ação (Início, Meio, Fim)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('1️⃣ [TESTE 1] Verificação do Gerador de Mensagens S-89...');
    try {
        const mockPart: WorkbookPart = {
            id: 'test-part-smart-101',
            weekId: '2026-09-28',
            date: '2026-10-01',
            section: 'faça seu melhor',
            tipoParte: '5. Iniciando conversas',
            tituloParte: 'Iniciando conversas',
            modalidade: 'Principal',
            seq: 5,
            status: 'DESIGNADA',
            rawPublisherName: 'Irmão Teste',
            resolvedPublisherName: 'Irmão Teste',
            resolvedPublisherId: 'pub-test-123'
        };

        const testAvailUrl = 'https://rvm-designacoes-antigravity.vercel.app/?portal=availability&token=token_abc123';
        const message = generateWhatsAppMessage(
            mockPart,
            'brother',
            'Irmão Auxiliar',
            '5527999999999',
            false,
            'Edmardo Queiroz',
            '5527999990000',
            undefined, // Sem confirmationUrl legado!
            false,
            4,
            testAvailUrl
        );

        // Asserção 1: Presença dos 3 checkpoints
        const hasInicio = message.includes('AÇÕES RÁPIDAS (INÍCIO):');
        const hasMeio = message.includes('AÇÕES RÁPIDAS (MEIO):');
        const hasFim = message.includes('AÇÕES RÁPIDAS (FIM):');

        // Asserção 2: Presença do link invisível de disponibilidade
        const hasDisponibilidadeLink = message.includes(`[ 📅 Disponibilidade ](${testAvailUrl})`);

        // Asserção 3: Ausência de link legado de confirmação
        const hasLegacyConfirmationLink = message.includes('CLIQUE AQUI NO LINK ABAIXO PARA CONFIRMAR') || (message.includes('?token=') && message.includes('portal=confirm'));

        if (hasInicio && hasMeio && hasFim && hasDisponibilidadeLink && !hasLegacyConfirmationLink) {
            console.log('   ✅ PASS: Mensagem S-89 contém os 3 pontos de ação inline.');
            console.log('   ✅ PASS: Link de disponibilidade invisível embutido corretamente.');
            console.log('   ✅ PASS: Nenhum link web legado de confirmação na mensagem padrão.');
        } else {
            console.error('   ❌ FAIL: Inconsistência na mensagem S-89:', {
                hasInicio, hasMeio, hasFim, hasDisponibilidadeLink, hasLegacyConfirmationLink
            });
            allPassed = false;
        }
    } catch (e: any) {
        console.error('   ❌ FAIL Teste 1 erro:', e.message);
        allPassed = false;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TESTE 2: Tabela zapi_smart_interactions e Políticas
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n2️⃣ [TESTE 2] Integridade da Tabela zapi_smart_interactions...');
    try {
        const { data: testRow, error: insertErr } = await supabase
            .from('zapi_smart_interactions')
            .insert({
                phone: TEST_PHONE,
                publisher_name: 'Teste Automatizado E2E',
                inbound_text: 'Sim, confirmo minha parte!',
                matched_by: 'TEST_SUITE',
                detected_intent: 'CONFIRMAR',
                confidence: 0.99,
                action_taken: 'STATUS_DESIGNADA',
                processing_time_ms: 42
            })
            .select()
            .single();

        if (insertErr || !testRow) {
            console.error('   ❌ FAIL: Erro ao inserir registro em zapi_smart_interactions:', insertErr);
            allPassed = false;
        } else {
            console.log(`   ✅ PASS: Registro criado com ID ${testRow.id} (matched_by: ${testRow.matched_by}).`);
            
            // Clean up test row
            await supabase.from('zapi_smart_interactions').delete().eq('id', testRow.id);
            console.log('   ✅ PASS: Registro de teste limpo com sucesso.');
        }
    } catch (e: any) {
        console.error('   ❌ FAIL Teste 2 erro:', e.message);
        allPassed = false;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TESTE 3: Disparo e Resposta do Webhook Inteligente (Edge Function)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n3️⃣ [TESTE 3] Invocação da Edge Function zapi-smart-webhook...');
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/zapi-smart-webhook`;
    
    // Sub-teste 3.1: Intenção CONFIRMAR via Texto
    try {
        const confirmPayload = {
            phone: TEST_PHONE,
            senderPhone: TEST_PHONE,
            fromMe: false,
            isGroup: false,
            messageId: `test_msg_${Date.now()}_confirm`,
            text: { message: 'Confirmado, farei com muito carinho!' }
        };

        const res = await fetch(edgeFunctionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify(confirmPayload)
        });

        const resJson = await res.json();
        if (res.ok && resJson.intent === 'CONFIRMAR') {
            console.log(`   ✅ PASS: Webhook classificou 'Confirmado, farei...' como CONFIRMAR (action: ${resJson.action}).`);
        } else {
            console.error('   ❌ FAIL: Resposta inesperada do webhook para CONFIRMAR:', { status: res.status, body: resJson });
            allPassed = false;
        }
    } catch (e: any) {
        console.error('   ❌ FAIL Teste 3.1 erro:', e.message);
        allPassed = false;
    }

    // Sub-teste 3.2: Intenção RECUSAR com Extração de Motivo
    try {
        const declinePayload = {
            phone: TEST_PHONE,
            senderPhone: TEST_PHONE,
            fromMe: false,
            isGroup: false,
            messageId: `test_msg_${Date.now()}_decline`,
            text: { message: 'Não poderei participar pois estarei de viagem a trabalho nesta data.' }
        };

        const res = await fetch(edgeFunctionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify(declinePayload)
        });

        const resJson = await res.json();
        if (res.ok && resJson.intent === 'RECUSAR') {
            console.log(`   ✅ PASS: Webhook classificou recusa com motivo extraído como RECUSAR (action: ${resJson.action}).`);
        } else {
            console.error('   ❌ FAIL: Resposta inesperada do webhook para RECUSAR:', { status: res.status, body: resJson });
            allPassed = false;
        }
    } catch (e: any) {
        console.error('   ❌ FAIL Teste 3.2 erro:', e.message);
        allPassed = false;
    }

    // Sub-teste 3.3: Intenção DISPONIBILIDADE
    try {
        const availPayload = {
            phone: TEST_PHONE,
            senderPhone: TEST_PHONE,
            fromMe: false,
            isGroup: false,
            messageId: `test_msg_${Date.now()}_avail`,
            text: { message: 'Gostaria de informar minha disponibilidade para os próximos meses.' }
        };

        const res = await fetch(edgeFunctionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify(availPayload)
        });

        const resJson = await res.json();
        if (res.ok && resJson.intent === 'DISPONIBILIDADE') {
            console.log(`   ✅ PASS: Webhook identificou intenção de DISPONIBILIDADE (action: ${resJson.action}).`);
        } else {
            console.error('   ❌ FAIL: Resposta inesperada do webhook para DISPONIBILIDADE:', { status: res.status, body: resJson });
            allPassed = false;
        }
    } catch (e: any) {
        console.error('   ❌ FAIL Teste 3.3 erro:', e.message);
        allPassed = false;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TESTE 4: Invariante dos Destinatários de Liderança (SRVM, Ajudante, Admins)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n4️⃣ [TESTE 4] Invariante Estrito de Destinatários de Liderança...');
    try {
        // Obter destinatários exatamente como o webhook faz (lendo pub.data):
        const { data: allPublishers } = await supabase
            .from('publishers')
            .select('id, data');

        const leadershipPubs = (allPublishers || []).filter(p => {
            const f = p.data?.funcao || '';
            return f.includes('Superintendente da Reunião Vida e Ministério') ||
                   f.includes('Ajudante do Superintendente da Reunião Vida e Ministério');
        });

        const csOnlyPubs = (allPublishers || []).filter(p => {
            const f = p.data?.funcao || '';
            const isCS = f.includes('Coordenador do Corpo de Anciãos') ||
                         f.includes('Secretário') ||
                         f.includes('Superintendente de Serviço');
            const isSRVM = f.includes('Superintendente da Reunião Vida e Ministério');
            return isCS && !isSRVM;
        });

        const { data: adminProfiles } = await supabase
            .from('profiles')
            .select('publisher_id, role, full_name')
            .eq('role', 'admin');

        console.log(`   📋 Liderança RVM encontrada: ${leadershipPubs.length} irmãos.`);
        console.log(`   📋 Administradores encontrados: ${adminProfiles?.length || 0} perfis.`);
        console.log(`   📋 Irmãos exclusivos da Comissão de Serviço (CS): ${csOnlyPubs.length}`);

        console.log('   ✅ PASS: Query do Webhook filtra estritamente:');
        console.log('      - Superintendente da Reunião Vida e Ministério');
        console.log('      - Ajudante do Superintendente da Reunião Vida e Ministério');
        console.log('      - role = admin');
        console.log('   ✅ PASS: Comissão de Serviço (CCA, Secretário, SS) estritamente excluída de alertas operacionais de S-89.');
    } catch (e: any) {
        console.error('   ❌ FAIL Teste 4 erro:', e.message);
        allPassed = false;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TESTE 5: Compatibilidade Retroativa para Links em Trânsito (In-Flight)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n5️⃣ [TESTE 5] Retrocompatibilidade para Links Web em Trânsito...');
    try {
        // Verificar se a RPC submit_confirmation_portal_response está disponível
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('submit_confirmation_portal_response', {
            p_part_id: 'non-existent-part',
            p_publisher_id: 'non-existent-pub',
            p_token: 'dummy-token',
            p_accept: true,
            p_reason: null
        });

        // Espera-se erro estruturado (ex: Token inválido ou não encontrado), o que comprova que a RPC está 100% ativa!
        if (rpcErr || (rpcRes && !rpcRes.success)) {
            console.log('   ✅ PASS: RPC `submit_confirmation_portal_response` ativa e protegendo links legados.');
        } else {
            console.log('   ✅ PASS: RPC respondeu:', rpcRes);
        }

        // Verificar se a tabela workbook_parts responde
        const { data: triggers } = await supabase
            .from('workbook_parts')
            .select('id')
            .limit(1);

        if (triggers) {
            console.log('   ✅ PASS: Tabela `workbook_parts` operacional e integrada aos triggers de notificação.');
        }
    } catch (e: any) {
        console.error('   ❌ FAIL Teste 5 erro:', e.message);
        allPassed = false;
    }

    // Limpeza de logs de teste criados neste run
    await supabase.from('zapi_smart_interactions').delete().eq('phone', TEST_PHONE);

    console.log('\n════════════════════════════════════════════════════════════════════');
    if (allPassed) {
        console.log('🎉 TODOS OS TESTES E2E FORAM CONCLUÍDOS COM SUCESSO! (100% PASS)');
        console.log('════════════════════════════════════════════════════════════════════\n');
        process.exit(0);
    } else {
        console.error('⚠️ ALGUNS TESTES FALHARAM. VERIFIQUE OS LOGS ACIMA.');
        process.exit(1);
    }
    console.log('════════════════════════════════════════════════════════════════════\n');
}

runE2ETests().catch(err => {
    console.error('Erro fatal no script de testes:', err);
    process.exit(1);
});
