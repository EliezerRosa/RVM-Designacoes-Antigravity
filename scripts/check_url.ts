import { chromium } from 'playwright';
import * as path from 'path';

async function checkUrl() {
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
    
    // Testa URL 1
    console.log("Navegando para URL com _");
    await page.goto('https://app.hourglass-app.com/v2/page/app/scheduling/mm/2026-10-12_2026-10-18');
    await page.waitForTimeout(3000);
    console.log("URL final 1:", page.url());

    // Testa URL 2
    console.log("Navegando para URL sem _");
    await page.goto('https://app.hourglass-app.com/v2/page/app/scheduling/mm/2026-10-12');
    await page.waitForTimeout(3000);
    console.log("URL final 2:", page.url());

    // Testa URL 3
    console.log("Navegando para URL base");
    await page.goto('https://app.hourglass-app.com/v2/page/app/scheduling/mm');
    await page.waitForTimeout(3000);
    console.log("URL final 3:", page.url());

    await browser.close();
}

checkUrl().catch(console.error);
