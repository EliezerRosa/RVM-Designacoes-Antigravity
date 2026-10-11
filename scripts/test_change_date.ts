import { chromium } from 'playwright';
import * as path from 'path';

async function testChangeDate() {
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
    
    console.log("Mudando a data para 2026-10-12...");
    const dateInput = page.locator('input[type="date"]');
    await dateInput.fill('2026-10-12');
    await page.keyboard.press('Enter');
    
    await page.waitForTimeout(3000); // Dar tempo para carregar as partes
    
    // Testa se existe o mm_part agora (ou se tá em branco pq ninguem gerou)
    const count = await page.locator('.mm_part').count();
    console.log(`Quantidade de partes para 10/12: ${count}`);

    await browser.close();
}
testChangeDate().catch(console.error);
