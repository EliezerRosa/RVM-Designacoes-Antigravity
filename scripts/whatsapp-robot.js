import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

/**
 * ROBÔ AUTOMATIZADO DE CAPTURA DO WHATSAPP WEB (PLAYWRIGHT RVM)
 * 
 * 1. Abre o Chrome via Playwright com perfil salvo (sessão persistente em ./whatsapp_session_data).
 * 2. Acesse https://web.whatsapp.com.
 * 3. Abre o grupo "Congregação Parque Jacaraípe".
 * 4. Clica em "Dados do Grupo" -> "Pesquisar membros".
 * 5. Para CADA número sem nome (ex: "8889"), digita no campo de busca, lê o card (~Gerson Ribeiro) e atualiza o RVM!
 */

const SESSION_DIR = path.resolve('./whatsapp_session_data');
const TARGET_GROUP = process.env.WA_GROUP || 'Congregação Parque Jacaraípe';
const SEARCH_QUERIES = (process.env.WA_SEARCH || '8889').split(',').map(s => s.trim()).filter(Boolean);

async function runWhatsAppRobot() {
    console.log('🤖 Iniciando Robô de Automação Visual (Playwright)...');
    console.log(`📁 Perfil de Sessão: ${SESSION_DIR}`);
    console.log(`💬 Grupo Alvo: "${TARGET_GROUP}"`);
    console.log(`🔎 Buscas a realizar:`, SEARCH_QUERIES);

    if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    const context = await chromium.launchPersistentContext(SESSION_DIR, {
        headless: false, // Abre a janela para visualização
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
        
        // Verifica se há tela de QR Code para avisar o usuário
        const qrCanvas = page.locator('canvas, div[data-ref]').first();
        if (await qrCanvas.isVisible({ timeout: 5000 }).catch(() => false)) {
            console.log('💡 [IMPORTANTE] QR Code detectado na janela do Chrome!');
            console.log('📲 Abra o aplicativo do WhatsApp no celular -> Aparelhos conectados -> Conectar um aparelho para escanear o QR Code.');
        }

        // Seletor flexível para campo de busca principal do WhatsApp Web
        const mainSearchSelector = 'div[contenteditable="true"][data-tab="3"], #side div[contenteditable="true"], div[title*="Pesquisar"][contenteditable="true"]';
        await page.waitForSelector(mainSearchSelector, { timeout: 180000 });
        console.log('✅ Sessão do WhatsApp Web carregada!');

        // 1. Abrir conversa do grupo
        console.log(`🔍 Pesquisando grupo "${TARGET_GROUP}"...`);
        const mainSearch = page.locator(mainSearchSelector).first();
        await mainSearch.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await page.keyboard.insertText(TARGET_GROUP);
        await page.waitForTimeout(1500);

        const groupChat = page.locator(`span[title="${TARGET_GROUP}"]`).first();
        if (await groupChat.isVisible()) {
            await groupChat.click();
        } else {
            await page.locator('div[role="listitem"]').first().click();
        }

        await page.waitForTimeout(1500);

        // 2. Abrir "Dados do grupo"
        console.log('ℹ️ Abrindo "Dados do Grupo"...');
        const groupHeader = page.locator('header').filter({ hasText: TARGET_GROUP }).first();
        if (await groupHeader.isVisible()) {
            await groupHeader.click();
        } else {
            await page.locator('header').first().click();
        }
        await page.waitForTimeout(2000);

        // 3. Abrir "Pesquisar membros"
        console.log('🔍 Clicando em "Pesquisar membros"...');
        const searchMembersBtn = page.locator('span[data-icon="search"]').or(page.locator('button:has-text("Pesquisar membros")')).or(page.locator('div[role="button"]:has-text("membros")')).last();

        if (await searchMembersBtn.isVisible()) {
            await searchMembersBtn.click();
        } else {
            const sidePanel = page.locator('div[role="region"]').first();
            await sidePanel.evaluate(el => el.scrollTop += 500);
            await page.waitForTimeout(1000);
            const searchIcon = page.locator('span[data-icon="search"]').last();
            await searchIcon.click();
        }

        await page.waitForTimeout(1500);

        // 4. Loop para CADA busca ("Sem Nome")
        for (const query of SEARCH_QUERIES) {
            console.log(`\n⌨️ Buscando termo: "${query}"...`);
            const modalInput = page.locator('div[role="dialog"] div[contenteditable="true"]').or(page.locator('div[role="dialog"] input')).first();

            if (await modalInput.isVisible()) {
                await modalInput.click();
                await page.keyboard.press('Control+A');
                await page.keyboard.press('Backspace');
                await page.keyboard.insertText(query);
            }

            await page.waitForTimeout(2000);

            // Capturar card renderizado no WhatsApp Web
            const resultCard = page.locator('div[role="dialog"] div[role="listitem"]').first();

            if (await resultCard.isVisible()) {
                const cardText = await resultCard.innerText();
                console.log(`📌 Card renderizado para "${query}":`, cardText.replace(/\n/g, ' | '));

                const lines = cardText.split('\n').map(l => l.trim()).filter(Boolean);
                const pushNameLine = lines.find(l => l.includes('~')) || lines[0];
                const phoneLine = lines.find(l => l.includes('+55') || /\d{4,}/.test(l)) || lines[1];

                const cleanPush = pushNameLine ? pushNameLine.replace('~', '').trim() : '';
                const cleanPhone = phoneLine ? phoneLine.replace(/\D/g, '') : query.replace(/\D/g, '');

                if (cleanPush) {
                    console.log(`✨ Encontrado: ~${cleanPush} (${cleanPhone})`);

                    // Gravar no Supabase RVM
                    const response = await fetch('https://pevstuyzlewvjidjkmea.supabase.co/functions/v1/send-whatsapp', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'run-zapi-robot',
                            groupQuery: TARGET_GROUP,
                            phone: cleanPhone,
                            pushName: cleanPush
                        })
                    });
                    const resJson = await response.json().catch(() => ({}));
                    console.log(`💾 Resultado gravado no Supabase para ${cleanPush}:`, resJson.success ? 'OK' : 'Falha');
                }
            } else {
                console.log(`⚠️ Nenhum resultado encontrado no WhatsApp Web para "${query}".`);
            }
        }

        console.log('\n🎉 Varredura visual de todos os termos concluída com sucesso!');
        await page.waitForTimeout(5000);

    } catch (err) {
        console.error('❌ Erro na execução do robô Playwright:', err);
    } finally {
        await context.close();
        console.log('🏁 Robô Playwright finalizado.');
    }
}

runWhatsAppRobot();
