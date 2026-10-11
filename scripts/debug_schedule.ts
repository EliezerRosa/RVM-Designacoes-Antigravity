import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

async function debugSchedule() {
    const userDataDir = path.resolve(process.cwd(), 'hourglass_session');
    const context = await chromium.launchPersistentContext(userDataDir, { headless: false });
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    let xsrfToken = '';
    page.on('request', request => {
        const token = request.headers()['x-hourglass-xsrf-token'];
        if (token) xsrfToken = token;
    });

    await page.goto('https://app.hourglass-app.com/v2/page/app');
    await page.waitForTimeout(4000); 

    const meetingData = await page.evaluate(async (params) => {
        const res = await fetch(`https://app.hourglass-app.com/api/v0.2/scheduling/mm/meeting/2026-10-05_2026-10-12?lgroup=39934&no_subs=true`, {
            headers: { 'x-hourglass-xsrf-token': params.xsrfToken, 'accept': 'application/json' }
        });
        return await res.json();
    }, { xsrfToken });

    fs.writeFileSync('hourglass_meeting_debug.json', JSON.stringify(meetingData, null, 2));
    console.log('Estrutura de dados salva em hourglass_meeting_debug.json');
    await context.close();
}

debugSchedule().catch(console.error);
