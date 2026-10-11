import { chromium } from 'playwright';
import * as path from 'path';

async function mapPostEndpoint() {
    const userDataDir = path.resolve(process.cwd(), 'hourglass_session');
    const context = await chromium.launchPersistentContext(userDataDir, { headless: false });
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    console.log('Fique de olho! Vou interceptar como o Hourglass cria uma designação nova...');
    
    page.on('request', request => {
        if (!request.url().includes('bugsnag') && !request.url().includes('google-analytics')) {
            console.log(`[${request.method()}] ${request.url()}`);
            if (request.postData()) {
                console.log(`Payload: ${request.postData()}`);
            }
        }
    });

    console.log('Navegando para a semana 12...');
    await page.goto('https://app.hourglass-app.com/v2/page/app/scheduling/mm/2026-10-12_2026-10-18');
    await page.waitForTimeout(4000);

    try {
        const row = page.locator('.mm_part:not(.chairman):not(.prayer)').first();
        const button = row.locator('.ddm button').first();
        await button.click({ timeout: 5000 });
        await page.waitForTimeout(500);
        await page.keyboard.type('Eliézer', { delay: 50 });
        
        const firstOption = page.locator('.dropdown-menu button, .dropdown-menu a, .dropdown-menu .dropdown-item').first();
        await firstOption.waitFor({ state: 'visible', timeout: 5000 });
        await firstOption.click();
        
        console.log('Cliquei. Forçando o Hourglass a salvar recarregando a aba...');
        await page.waitForTimeout(1000);
        await page.goto('https://app.hourglass-app.com/v2/page/app/scheduling/wm'); // muda de aba pra forçar o save
        await page.waitForTimeout(4000);
    } catch (e) {
        console.log('Erro ao preencher:', e);
    }
    
    await context.close();
}

mapPostEndpoint().catch(console.error);
