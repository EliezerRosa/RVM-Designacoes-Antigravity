import './node-shims.cjs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';
import { communicationService } from '../src/services/communicationService';
import { api } from '../src/services/api';
import type { WorkbookPart, Publisher } from '../src/types';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pevstuyzlewvjidjkmea.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_PHONE = '5527992035302'; // Eliezer Rosa

async function sendTestMessage() {
    console.log('================================================================');
    console.log('🚀 DISPARO DE TESTE REAL — S-89 COM 3 PONTOS DE AÇÃO INLINE');
    console.log('================================================================\n');

    // 1. Carregar publicadores
    const allPubs = await api.loadPublishers();
    const publishers: Publisher[] = (allPubs || []).filter(p => p.active !== false && Boolean(p.name));
    const eliezerPub = publishers.find(p => p.phone && p.phone.includes('992035302')) || publishers.find(p => p.name.includes('Eliezer'));

    if (!eliezerPub) {
        throw new Error('Publicador Eliezer Rosa não encontrado na base.');
    }

    console.log(`👤 Publicador identificado: ${eliezerPub.name} (ID: ${eliezerPub.id}, Tel: ${eliezerPub.phone})`);

    // 2. Criar ou reutilizar uma parte de teste real no banco
    const testPartId = 'test-part-opcao3-live';
    const testWeekId = '2026-09-28';

    const { data: existingPart } = await supabase
        .from('workbook_parts')
        .select('*')
        .eq('id', testPartId)
        .maybeSingle();

    if (!existingPart) {
        console.log('📝 Criando registro de parte de teste no banco...');
        await supabase.from('workbook_parts').insert({
            id: testPartId,
            week_id: testWeekId,
            date: '2026-10-01',
            section: 'faça seu melhor',
            tipo_parte: '5. Iniciando conversas',
            part_title: '5. Iniciando conversas (Teste Opção 3)',
            modalidade: 'Principal',
            seq: 5,
            status: 'ENVIADA',
            raw_publisher_name: eliezerPub.name,
            resolved_publisher_name: eliezerPub.name,
            resolved_publisher_id: String(eliezerPub.id),
            hora_inicio: '19:35'
        });
    } else {
        console.log('📝 Resetando status da parte de teste para ENVIADA...');
        await supabase.from('workbook_parts').update({
            status: 'ENVIADA',
            resolved_publisher_id: String(eliezerPub.id),
            resolved_publisher_name: eliezerPub.name,
            had_refusal: false,
            needs_reassignment: false,
            rejected_reason: null
        }).eq('id', testPartId);
    }

    // 3. Montar a parte no formato WorkbookPart
    const mockPart: WorkbookPart = {
        id: testPartId,
        weekId: testWeekId,
        date: '2026-10-01',
        section: 'faça seu melhor',
        tipoParte: '5. Iniciando conversas',
        tituloParte: '5. Iniciando conversas (Demonstração)',
        modalidade: 'Principal',
        seq: 5,
        status: 'ENVIADA',
        rawPublisherName: eliezerPub.name,
        resolvedPublisherName: eliezerPub.name,
        resolvedPublisherId: String(eliezerPub.id),
        horaInicio: '19:35'
    };

    // 4. Preparar a mensagem oficial usando o communicationService (já integrado com Opção 3)
    console.log('🔨 Gerando mensagem S-89 formatada...');
    const prep = await communicationService.prepareS89Message(
        mockPart,
        publishers,
        [],
        { isSubstitution: false, meetingDayOfWeek: 4 }
    );

    console.log('\n📄 CONTEÚDO DA MENSAGEM GERADA:');
    console.log('────────────────────────────────────────────────────────────────');
    console.log(prep.content);
    console.log('────────────────────────────────────────────────────────────────\n');

    // 5. Enviar via Edge Function send-whatsapp usando o bot token
    console.log(`📤 Disparando via Z-API para ${TEST_PHONE}...`);
    const botToken = 'rvm_bot_8f4a1c9e2b7d3f5a0e6c8b1d4e7a9f2c';
    const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-bot-token': botToken,
            'Authorization': `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
            action: 'send-text',
            phone: TEST_PHONE,
            message: prep.content
        })
    });

    const resJson = await res.json();
    console.log('📦 Resposta da Edge Function:', resJson);

    if (resJson.success && resJson.messageId) {
        console.log(`\n✅ MENSAGEM ENVIADA COM SUCESSO!`);
        console.log(`   - Message ID Z-API: ${resJson.messageId}`);
        console.log(`   - Part ID vinculado: ${testPartId}`);

        // 6. Registrar no zapi_dispatch_log para permitir rastreamento por MessageId
        await supabase.from('zapi_dispatch_log').insert({
            part_id: testPartId,
            message_id: resJson.messageId,
            dispatch_type: 'S89_INDIVIDUAL',
            recipient_phone: TEST_PHONE,
            status: 'SUCCESS'
        });
        console.log('   - Registrado em zapi_dispatch_log.');
    } else {
        console.error('❌ Falha ao enviar mensagem:', resJson);
    }
}

sendTestMessage().catch(err => {
    console.error('Erro:', err);
    process.exit(1);
});
