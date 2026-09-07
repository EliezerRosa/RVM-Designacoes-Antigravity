import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pevstuyzlewvjidjkmea.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_PHONE = '5527992035302'; // Eliezer Rosa

async function runTest() {
    console.log('================================================================');
    console.log('🗑️ TESTE E2E: ENVIO E EXCLUSÃO (APAGAR PARA TODOS) VIA Z-API');
    console.log('================================================================\n');

    // Etapa 1: Enviar mensagem de teste para Eliezer
    const testText = `🧪 [TESTE RVM SISTEMA] Testando funcionalidade "Apagar para todos".\nEsta mensagem será excluída automaticamente em 3 segundos.\nTimestamp: ${new Date().toLocaleTimeString('pt-BR')}`;
    console.log(`1️⃣ Enviando mensagem de teste para ${TEST_PHONE}...`);

    const { data: sendResult, error: sendError } = await supabase.functions.invoke('send-whatsapp', {
        body: {
            action: 'send-text',
            phone: TEST_PHONE,
            message: testText,
        },
    });

    if (sendError || !sendResult?.success) {
        console.error('❌ Falha ao enviar mensagem de teste:', sendError || sendResult);
        process.exit(1);
    }

    const messageId = sendResult.messageId;
    console.log(`✅ Mensagem enviada com sucesso! ID retornado pela Z-API: ${messageId}`);

    // Etapa 2: Aguardar 3 segundos para confirmar recebimento
    console.log('\n2️⃣ Aguardando 3 segundos antes de solicitar exclusão...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Etapa 3: Invocar Edge Function com action 'delete-message'
    console.log(`\n3️⃣ Solicitando exclusão da mensagem ${messageId} para o telefone ${TEST_PHONE}...`);
    const { data: deleteResult, error: deleteError } = await supabase.functions.invoke('send-whatsapp', {
        body: {
            action: 'delete-message',
            phone: TEST_PHONE,
            messageId: messageId,
            deleteForMe: false, // Apagar para todos
        },
    });

    if (deleteError) {
        console.error('❌ Erro HTTP ao invocar Edge Function para exclusão:', deleteError);
        process.exit(1);
    }

    console.log('📦 Resposta da Edge Function:', deleteResult);

    if (deleteResult?.success) {
        console.log('\n================================================================');
        console.log('🎉 SUCESSO ABSOLUTO: Mensagem apagada para todos com sucesso via Z-API!');
        console.log(`   - ID da Mensagem: ${messageId}`);
        console.log(`   - Destinatário:   ${TEST_PHONE}`);
        console.log(`   - Modo:           Apagar para todos (owner=true, deleteForMe=false)`);
        console.log('================================================================\n');
    } else {
        console.error('\n❌ Z-API retornou erro ao tentar apagar a mensagem:', deleteResult?.error || deleteResult);
        process.exit(1);
    }
}

runTest().catch(err => {
    console.error('Erro fatal no teste:', err);
    process.exit(1);
});
