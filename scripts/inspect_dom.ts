import { chromium } from 'playwright';
import * as path from 'path';

async function testPrivileges() {
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

    const hgId = 3331140; // Gustavo Rangel (from user's screenshot)
    console.log(`Acessando privilégios ID ${hgId}...`);
    await page.goto(`https://app.hourglass-app.com/v2/page/app/user/privileges/${hgId}`, { waitUntil: 'networkidle' });
    
    console.log('Página carregada (networkidle).');
    
    // Dump all checkboxes
    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    console.log(`Encontrou ${checkboxCount} inputs do tipo checkbox no DOM!`);

    // Look for text
    const textLocator = page.locator('text="Privilégios"');
    console.log(`Encontrou ${await textLocator.count()} elementos com o texto exato "Privilégios".`);
    
    const partialLocator = page.locator(':has-text("Iniciando conversas")').last();
    if (await partialLocator.count() > 0) {
        console.log("HTML do container do Iniciando conversas:");
        console.log(await partialLocator.innerHTML());
    } else {
        console.log("NÃO achou Iniciando conversas nem com partial text!");
    }

    await context.close();
}

testPrivileges().catch(console.error);
