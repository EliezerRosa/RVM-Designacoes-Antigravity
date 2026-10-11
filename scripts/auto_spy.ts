import { chromium } from 'playwright';
import * as path from 'path';

async function autoDiscoverEndpoint() {
    const userDataDir = path.resolve(process.cwd(), 'hourglass_session');
    const context = await chromium.launchPersistentContext(userDataDir, { headless: true });
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    let interceptedRequest = null;
    let interceptedPayload = null;

    page.on('request', request => {
        if (request.method() === 'POST' || request.method() === 'PUT') {
            if (request.url().includes('/schedule/') && (request.url().includes('/tgw') || request.url().includes('/fm'))) {
                interceptedRequest = request.url();
                interceptedPayload = request.postData();
                console.log(`\n🎉 DESCOBERTO!`);
                console.log(`Método: ${request.method()}`);
                console.log(`URL: ${request.url()}`);
                console.log(`Payload: ${request.postData()}`);
            }
        }
    });

    console.log('Navegando para a semana 12...');
    await page.goto('https://app.hourglass-app.com/v2/page/app/scheduling/mm/2026-10-12_2026-10-18');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('Procurando qualquer parte vazia do Ministério ou Tesouros...');
    
    try {
        // Pega a primeira parte que seja do meio da reunião (nem presidente, nem oração)
        const row = page.locator('.mm_part:not(.chairman):not(.prayer)').first();
        const button = row.locator('.ddm button').first();
        await button.click({ timeout: 5000 });
        await page.waitForTimeout(500);

        await page.keyboard.type('Eliézer', { delay: 50 });
        
        const firstOption = page.locator('.dropdown-menu button, .dropdown-menu a, .dropdown-menu .dropdown-item').first();
        await firstOption.waitFor({ state: 'visible', timeout: 5000 });
        await firstOption.click();
        
        console.log('Cliquei e preenchi. Aguardando a requisição disparar...');
        await page.waitForTimeout(5000);
    } catch (e) {
        console.log('Erro ao preencher (talvez o seletor esteja diferente):', e);
    }

    await context.close();
}

autoDiscoverEndpoint().catch(console.error);
