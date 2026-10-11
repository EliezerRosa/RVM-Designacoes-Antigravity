import { chromium } from 'playwright';
import * as path from 'path';

async function captureLoadedHTML() {
    const userDataDir = path.resolve(process.cwd(), 'hourglass_session');
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

    console.log("Navegando...");
    await page.goto('https://app.hourglass-app.com/v2/page/app/scheduling/mm');
    await page.waitForLoadState('networkidle');

    console.log("Mudando para 10/12...");
    const dateInput = page.locator('input[type="date"]');
    await dateInput.fill('2026-10-12');
    await page.keyboard.press('Enter');
    
    console.log("Aguardando .mm_part aparecer (até 30s)...");
    await page.waitForSelector('.mm_part', { timeout: 30000 });
    
    console.log("Apareceu! Pegando o HTML do Joias Espirituais...");
    const rows = page.locator('.mm_part');
    const count = await rows.count();
    
    for (let i = 0; i < count; i++) {
        const text = await rows.nth(i).innerText();
        if (text.includes('Joias') || text.includes('Jeová')) {
            const html = await rows.nth(i).innerHTML();
            console.log(`\n\n--- HTML DA PARTE: ${text.split('\n')[0]} ---`);
            console.log(html);
        }
    }

    await context.close();
}
captureLoadedHTML().catch(console.error);
