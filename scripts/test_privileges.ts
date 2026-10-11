import { chromium } from 'playwright';
import * as path from 'path';

async function testPrivileges() {
    const userDataDir = path.resolve(process.cwd(), 'hourglass_session');
    console.log('🚀 Iniciando...');
    
    const context = await chromium.launchPersistentContext(userDataDir, { 
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars'
        ]
    });
    
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    console.log('Acessando Início...');
    await page.goto('https://app.hourglass-app.com/v2/page/app');
    await page.waitForTimeout(3000);

    const hgId = 3331139; // Luan Sabadim
    console.log(`Acessando privilégios ID ${hgId}...`);
    await page.goto(`https://app.hourglass-app.com/v2/page/app/user/privileges/${hgId}`);
    
    await page.waitForTimeout(4000); // Wait for whatever to load
    await page.screenshot({ path: 'tela_priv.png' });
    
    console.log('Buscando HTML do body...');
    const bodyHTML = await page.innerHTML('body');
    
    if (bodyHTML.includes('Iniciando conversas')) {
        console.log("✅ Achou o texto 'Iniciando conversas' no HTML!");
        const bodyText = await page.locator('body').innerText();
        console.log("Trechos ao redor:");
        const parts = bodyText.split('\n');
        for (let i = 0; i < parts.length; i++) {
            if (parts[i].includes('conversas') || parts[i].includes('Leitura')) {
                console.log(`   ${parts[i-1]}`);
                console.log(`-> ${parts[i]}`);
                console.log(`   ${parts[i+1]}`);
            }
        }
        
        // Dump the html for that section
        const form = await page.locator('form').first();
        if (await form.count() > 0) {
            console.log("HTML do form:");
            console.log((await form.innerHTML()).substring(0, 500));
        }
    } else {
        console.log("❌ NÃO ACHOU o texto no HTML. Talvez seja iframe ou outra coisa?");
    }

    await context.close();
}

testPrivileges().catch(console.error);
