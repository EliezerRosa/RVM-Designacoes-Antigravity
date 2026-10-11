import { chromium } from 'playwright';
import * as path from 'path';

async function test() {
  const userDataDir = path.resolve(process.cwd(), 'hourglass_session');
  const context = await chromium.launchPersistentContext(userDataDir, { headless: false });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  page.on('request', request => {
      if (request.url().includes('api/v0.2/fsreport/startup') || request.url().includes('users/privileges')) {
          console.log('\n--- HEADERS USADOS PELO NAVEGADOR ---');
          console.log(request.headers());
      }
  });

  console.log('Abrindo Hourglass...');
  await page.goto('https://app.hourglass-app.com/v2/page/app/scheduling/mm');
  await page.waitForTimeout(10000); // Fica aberto 10 segundos
  await context.close();
}

test().catch(console.error);
