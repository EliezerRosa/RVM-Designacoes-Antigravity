import { chromium } from 'playwright';
import * as path from 'path';

async function testDropdown() {
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

    console.log("Mudando para 10/12...");
    const dateInput = page.locator('input[type="date"]');
    await dateInput.fill('2026-10-12');
    await page.keyboard.press('Enter');
    
    await page.waitForSelector('.mm_part', { timeout: 30000 });
    
    console.log("Clicando na primeira parte...");
    const row = page.locator('.mm_part').first();
    const button = row.locator('button.dropdown-toggle').first();
    await button.click();
    await page.waitForTimeout(1000);
    
    console.log("Procurando o menu dropdown...");
    const menu = page.locator('.dropdown-menu');
    if (await menu.count() > 0) {
        console.log("HTML do Menu:");
        console.log(await menu.first().innerHTML());
    } else {
        console.log("Menu dropdown não encontrado!");
        // Tentar ver o body inteiro
        const body = await page.innerHTML('body');
        if (body.includes('dropdown')) {
            console.log("Tem algo de dropdown no body!");
        }
    }

    await browser.close();
}
testDropdown().catch(console.error);
