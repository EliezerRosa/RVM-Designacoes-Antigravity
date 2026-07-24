import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

/**
 * ROBÔ AUTOMATIZADO DE CAPTURA DO WHATSAPP WEB (RVM DE SIGNAÇÕES)
 * 
 * Passos que o Robô realiza automaticamente:
 * 1. Abre o Chrome via Playwright com perfil salvo (sessão persistente em ./whatsapp_session).
 * 2. Acesse https://web.whatsapp.com.
 * 3. Localiza e abre o grupo "Congregação Parque Jacaraípe".
 * 4. Abre os Dados do Grupo e clica no ícone de busca ("Pesquisar membros").
 * 5. Digita o número pesquisado (ex: "8889" ou "988891292").
 * 6. Captura o nome de perfil público (~Gerson Ribeiro).
 * 7. Envia e atualiza o cadastro do publicador no Supabase RVM!
 */

const SESSION_DIR = path.resolve('./whatsapp_session_data');
const TARGET_GROUP = process.env.WA_GROUP || 'Congregação Parque Jacaraípe';
const SEARCH_QUERY = process.env.WA_SEARCH || '8889';

async function runWhatsAppRobot() {
    console.log('🤖 Iniciando Robô de Automação do WhatsApp Web...');
    console.log(`📁 Perfil de Sessão: ${SESSION_DIR}`);
    console.log(`💬 Grupo Alvo: "${TARGET_GROUP}"`);
    console.log(`🔎 Busca: "${SEARCH_QUERY}"`);

    // Garantir que diretório de sessão existe
    if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    // Lançar navegador em modo persistente (Sessão salva)
    const context = await chromium.launchPersistentContext(SESSION_DIR, {
        headless: false, // Abre a janela para o usuário ver o robô agindo
        viewport: { width: 1280, height: 800 },
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    const page = await context.newPage();

    try {
        console.log('🌐 Navegando para https://web.whatsapp.com...');
        await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 60000 });

        console.log('⏳ Aguardando carregamento da sessão do WhatsApp Web...');
        console.log('💡 (Se for o primeiro acesso, escaneie o QR Code na janela do Chrome)...');

        // Aguarda a barra de busca principal do WhatsApp Web aparecer
        await page.waitForSelector('div[contenteditable="true"][data-tab="3"]', { timeout: 120000 });
        console.log('✅ Sessão do WhatsApp Web carregada com sucesso!');

        // 1. Digitar o nome do grupo na caixa de busca principal
        console.log(`🔍 Pesquisando grupo "${TARGET_GROUP}"...`);
        const mainSearch = page.locator('div[contenteditable="true"][data-tab="3"]').first();
        await mainSearch.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await page.keyboard.insertText(TARGET_GROUP);
        await page.waitForTimeout(1500);

        // 2. Clicar no grupo nos resultados da busca
        const groupChat = page.locator(`span[title="${TARGET_GROUP}"]`).first();
        if (await groupChat.isVisible()) {
            await groupChat.click();
            console.log(`💬 Grupo "${TARGET_GROUP}" aberto!`);
        } else {
            console.log(`⚠️ Tentando localizar grupo por seletor genérico...`);
            await page.locator('div[role="listitem"]').first().click();
        }

        await page.waitForTimeout(1500);

        // 3. Abrir o painel "Dados do grupo" clicando no cabeçalho
        console.log('ℹ️ Abrindo "Dados do Grupo"...');
        const groupHeader = page.locator('header').filter({ hasText: TARGET_GROUP }).first();
        if (await groupHeader.isVisible()) {
            await groupHeader.click();
        } else {
            await page.locator('header').first().click();
        }
        await page.waitForTimeout(2000);

        // 4. Localizar e clicar na lupa / botão "Pesquisar membros"
        console.log('🔍 Clicando em "Pesquisar membros"...');
        const searchMembersBtn = page.locator('span[data-icon="search"]').or(page.locator('button:has-text("Pesquisar membros")')).or(page.locator('div[role="button"]:has-text("membros")')).last();

        if (await searchMembersBtn.isVisible()) {
            await searchMembersBtn.click();
        } else {
            // Tenta rolar o painel lateral de dados do grupo
            const sidePanel = page.locator('div[role="region"]').first();
            await sidePanel.evaluate(el => el.scrollTop += 500);
            await page.waitForTimeout(1000);
            const searchIcon = page.locator('span[data-icon="search"]').last();
            await searchIcon.click();
        }

        await page.waitForTimeout(1500);

        // 5. Digitar o número de busca na modal "Pesquisar membros"
        console.log(`⌨️ Digitando "${SEARCH_QUERY}" no campo de busca de membros...`);
        const modalInput = page.locator('div[role="dialog"] div[contenteditable="true"]').or(page.locator('div[role="dialog"] input')).first();

        if (await modalInput.isVisible()) {
            await modalInput.click();
            await page.keyboard.insertText(SEARCH_QUERY);
        } else {
            await page.keyboard.insertText(SEARCH_QUERY);
        }

        await page.waitForTimeout(2000);

        // 6. Capturar o nome de perfil ~PushName e Telefone do DOM
        console.log('📌 Capturando perfil renderizado no WhatsApp Web...');
        const resultCard = page.locator('div[role="dialog"] div[role="listitem"]').first();

        if (await resultCard.isVisible()) {
            const cardText = await resultCard.innerText();
            console.log('--------------------------------------------------');
            console.log('🎉 RESULTADO CAPTURADO DO WHATSAPP WEB:');
            console.log(cardText);
            console.log('--------------------------------------------------');

            // Extrair linhas
            const lines = cardText.split('\n').map(l => l.trim()).filter(Boolean);
            const pushNameLine = lines.find(l => l.includes('~')) || lines[0];
            const phoneLine = lines.find(l => l.includes('+55') || /\d{4,}/.test(l)) || lines[1];

            console.log(`👤 Perfil Capturado: "${pushNameLine}"`);
            console.log(`📱 Telefone Capturado: "${phoneLine}"`);

            // Enviar para a Edge Function do Supabase RVM
            console.log('🚀 Gravando resultado no Supabase RVM...');
            const response = await fetch('https://pevstuyzlewvjidjkmea.supabase.co/functions/v1/send-whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update-push-name',
                    phone: phoneLine ? phoneLine.replace(/\D/g, '') : '5527988891292',
                    pushName: pushNameLine ? pushNameLine.replace('~', '').trim() : 'Gerson Ribeiro'
                })
            });

            const resJson = await response.json().catch(() => ({}));
            console.log('✅ Resposta do Servidor Supabase:', resJson);

        } else {
            console.log('⚠️ Nenhum membro foi encontrado na modal para esta busca.');
        }

        console.log('⏳ Mantendo o robô ativo por 10 segundos para conferência visual...');
        await page.waitForTimeout(10000);

    } catch (err) {
        console.error('❌ Erro durante a execução do Robô:', err);
    } finally {
        await context.close();
        console.log('🏁 Robô finalizou a execução.');
    }
}

// Executar
runWhatsAppRobot();
