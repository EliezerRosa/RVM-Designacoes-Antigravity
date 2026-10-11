import { chromium } from 'playwright';
import * as path from 'path';

async function takeScreenshot() {
    const userDataDir = path.resolve(process.cwd(), 'hourglass_session');
    const browser = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certifcate-errors',
            '--ignore-certifcate-errors-spki-list'
        ]
    });

    const page = browser.pages().length > 0 ? browser.pages()[0] : await browser.newPage();
    
    console.log("Navegando para 10/12...");
    await page.goto('https://app.hourglass-app.com/v2/page/app/scheduling/mm/2026-10-12_2026-10-18');
    await page.waitForTimeout(10000); // 10s pra carregar o que tiver
    
    await page.screenshot({ path: 'tela_12.png', fullPage: true });

    console.log("Navegando para 10/26...");
    await page.goto('https://app.hourglass-app.com/v2/page/app/scheduling/mm/2026-10-26_2026-11-01');
    await page.waitForTimeout(10000); // 10s pra carregar o que tiver
    
    await page.screenshot({ path: 'tela_26.png', fullPage: true });

    await browser.close();
}

takeScreenshot().catch(console.error);
