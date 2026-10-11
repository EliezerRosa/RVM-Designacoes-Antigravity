import { chromium } from 'playwright';
import * as path from 'path';

async function checkHeader() {
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
    await page.waitForTimeout(5000);
    
    const html = await page.content();
    console.log(html.substring(0, 5000));
    
    // Procura por botões que podem ser o NEXT
    const buttons = await page.locator('button').all();
    console.log("Total botões:", buttons.length);
    for (let i = 0; i < buttons.length; i++) {
        const c = await buttons[i].getAttribute('class');
        const text = await buttons[i].innerText();
        if (c?.includes('btn-light') || text.includes('>') || text.includes('right')) {
            console.log(`Botão ${i}: class=${c} text=${text}`);
        }
    }

    await browser.close();
}
checkHeader().catch(console.error);
