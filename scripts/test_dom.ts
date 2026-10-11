import { chromium } from 'playwright';
import * as path from 'path';

async function testDom() {
    const userDataDir = path.resolve(process.cwd(), 'hourglass_session');
    console.log('🚀 Iniciando...');
    
    const context = await chromium.launchPersistentContext(userDataDir, { 
        headless: false,
        args: ['--disable-blink-features=AutomationControlled']
    });
    
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    console.log('Acessando Início...');
    await page.goto('https://app.hourglass-app.com/v2/page/app');
    await page.waitForTimeout(3000);

    const hgId = 3331140; // Gustavo Rangel
    console.log(`Acessando privilégios ID ${hgId}...`);
    await page.goto(`https://app.hourglass-app.com/v2/page/app/user/privileges/${hgId}`);
    
    console.log('Esperando 6 segundos fixos para a página carregar visualmente...');
    await page.waitForTimeout(6000);
    
    console.log('Buscando HTML do Privilégios...');
    
    // Procura por h1, h2, h3, div que contenha Privilégios
    const loc = page.locator(':has-text("Privilégios")').last();
    if (await loc.count() > 0) {
        console.log("HTML ao redor do texto Privilégios:");
        console.log(await loc.innerHTML());
    } else {
        console.log("Não achou texto Privilégios.");
    }
    
    const checkboxes = page.locator('input[type="checkbox"]');
    console.log(`Total de checkboxes reais no DOM: ${await checkboxes.count()}`);
    
    const label = page.locator('label').filter({ hasText: /Iniciando conversas/i }).first();
    if (await label.count() > 0) {
        console.log("Achou label do Iniciando conversas! HTML:");
        console.log(await label.innerHTML());
    }

    await context.close();
}

testDom().catch(console.error);
