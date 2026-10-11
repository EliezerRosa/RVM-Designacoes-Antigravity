import { chromium } from 'playwright';
import * as path from 'path';

async function testDatepicker() {
    const userDataDir = path.resolve(process.cwd(), 'hourglass_session');
    const browser = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
        ]
    });

    const page = browser.pages().length > 0 ? browser.pages()[0] : await browser.newPage();
    
    await page.goto('https://app.hourglass-app.com/v2/page/app/scheduling/mm');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    console.log("Achando o campo de data...");
    // Acha o campo do datepicker
    const dateInput = page.locator('input[type="text"]').filter({ hasText: '/' }).first();
    // Alternativamente, Hourglass pode usar um label
    
    // Tentar clicar no botão 'Next' (Próxima semana)
    // O botão tem um ícone svg de seta para a direita, ou tooltip "Next"
    const nextBtn = page.locator('button').filter({ has: page.locator('svg') }).nth(2); 
    // Vamos procurar por SVG right arrow ou similar...
    
    // O MAIS FÁCIL: E se Hourglass aceitar navegação do teclado? 
    // Arrow Right?
    
    // Vou imprimir todo o HTML do topo da página:
    const topBar = await page.locator('.d-flex.align-items-center').first().innerHTML();
    console.log("Top Bar HTML:");
    console.log(topBar);

    await browser.close();
}
testDatepicker().catch(console.error);
