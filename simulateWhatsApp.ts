import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const targetPhone = '5527992035302';
const baseUrl = 'https://EliezerRosa.github.io/RVM-Designacoes-Antigravity';

// 1. Generate Fake Token for Simulation
const partId = 'f9a79a07-46b2-42e3-9a45-27b1e747d294';
const publisherId = '118';
const fakeToken = 'simulacao_teste_xyz';

const magicLink = `${baseUrl}/#/?portal=confirm&partId=${partId}&publisherId=${publisherId}&token=${fakeToken}`;

// Mensagem de Publicação Inicial / D-9
const msg = `⏳ *Bom dia, Irmã Sirlene Ramos!* Tudo bem?\n\nEsta é uma *SIMULAÇÃO* do Sistema Antigravity.\n\nVocê tem uma designação proposta para daqui a 9 dias: *Leitura da Bíblia*.\n\nPor favor, clique no link seguro abaixo para *Confirmar* ou *Recusar* sua participação.\n\n🔗 ${magicLink}\n\nObrigado por ajudar a testar o sistema! 🚀`;

async function run() {
    console.log('Sending message to', targetPhone);
    const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: { phone: targetPhone, message: msg }
    });
    
    if (error) {
        console.error('Failed to send WhatsApp:', error);
    } else {
        console.log('Successfully sent WhatsApp:', data);
    }

    // Agora vamos enviar o exemplo do Administrador (Alerta de Recusa)
    const adminLink = `${baseUrl}/#/?admin=true&action=replace&partId=${partId}`;
    const adminMsg = `⚠️ *SIMULAÇÃO: ALERTA DE RECUSA*\n\nA irmã Sirlene informou que NÃO PODERÁ realizar a parte (Leitura da Bíblia). Motivo: Viagem a trabalho.\n\n──────────────────\n💡 *Top 3 Substitutos Sugeridos:*\n1º - Irmão Carlos Souza\n2º - Irmão Luan Sabadim\n3º - Irmão Edmardo\n──────────────────\n\n👉 *Fazer substituição agora:* ${adminLink}`;

    console.log('Sending admin message...');
    const { data: adminData, error: adminErr } = await supabase.functions.invoke('send-whatsapp', {
        body: { phone: targetPhone, message: adminMsg }
    });

    if (adminErr) {
        console.error('Failed admin send:', adminErr);
    } else {
        console.log('Successfully sent admin message:', adminData);
    }
}

run();
