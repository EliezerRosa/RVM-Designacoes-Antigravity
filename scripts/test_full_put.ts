import { chromium } from 'playwright';
import * as path from 'path';

async function testFullPut() {
    const userDataDir = path.resolve(process.cwd(), 'hourglass_session');
    const context = await chromium.launchPersistentContext(userDataDir, { headless: true });
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    let xsrfToken = '';
    page.on('request', request => {
        const token = request.headers()['x-hourglass-xsrf-token'];
        if (token) xsrfToken = token;
    });

    await page.goto('https://app.hourglass-app.com/v2/page/app');
    await page.waitForTimeout(3000); 

    console.log('Testando PUT na raiz da semana para criar slot do Ministério...');

    const payload = {
        "fm": [
            {
                "part": 129596, // Iniciando conversas (ID da parte do dia 05/10)
                "assignee": 3331203, // Fouraux ou alguem
                "assistant": 0,
                "classroom": 0
            }
        ]
    };

    const status = await page.evaluate(async (params) => {
        const res = await fetch(`https://app.hourglass-app.com/api/v0.2/scheduling/mm/schedule/2026-10-05?group=39934`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'x-hourglass-xsrf-token': params.xsrfToken,
                'accept': 'application/json'
            },
            body: JSON.stringify(params.payload)
        });
        return res.status;
    }, { xsrfToken, payload });

    console.log(`Resultado do teste HTTP: ${status}`);
    await context.close();
}

testFullPut().catch(console.error);
