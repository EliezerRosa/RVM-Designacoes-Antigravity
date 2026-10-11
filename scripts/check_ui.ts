import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

async function checkUI() {
    const userDataDir = path.resolve(process.cwd(), 'hourglass_session');
    const context = await chromium.launchPersistentContext(userDataDir, { headless: false });
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    await page.goto('https://app.hourglass-app.com/v2/page/app/scheduling/mm/2026-10-12_2026-10-18');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(6000); // 6 segundos garantidos

    const rows = page.locator('.mm_part');
    const count = await rows.count();
    console.log(`Encontradas ${count} partes (.mm_part)`);
    for (let i = 0; i < count; i++) {
        console.log(`Parte ${i}:`, await rows.nth(i).innerText());
    }

    const html = await page.content();
    fs.writeFileSync('tela.html', html);
    await page.screenshot({ path: 'tela.png', fullPage: true });
    
    await context.close();
}
checkUI().catch(console.error);
