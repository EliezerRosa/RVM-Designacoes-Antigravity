import { chromium } from 'playwright';
import * as path from 'path';

async function inspectInputs() {
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
    
    console.log("=== BOTOES ===");
    const buttons = await page.locator('button').all();
    for (let i = 0; i < buttons.length; i++) {
        const aria = await buttons[i].getAttribute('aria-label') || '';
        if (aria) console.log(`Botão com aria-label: ${aria}`);
    }

    console.log("=== INPUTS ===");
    const inputs = await page.locator('input').all();
    for (let i = 0; i < inputs.length; i++) {
        const val = await inputs[i].inputValue();
        const type = await inputs[i].getAttribute('type') || '';
        console.log(`Input type=${type} value=${val}`);
    }

    await browser.close();
}
inspectInputs().catch(console.error);
