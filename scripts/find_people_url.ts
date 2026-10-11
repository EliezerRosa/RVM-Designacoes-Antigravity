import { chromium } from 'playwright';
import * as path from 'path';

async function findUrl() {
  const userDataDir = path.resolve(process.cwd(), 'hourglass_session');
  const context = await chromium.launchPersistentContext(userDataDir, { headless: false });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  await page.goto('https://app.hourglass-app.com/v2/page/app');
  await page.waitForTimeout(3000);

  // Print all links in the sidebar
  const links = await page.evaluate(() => {
     return Array.from(document.querySelectorAll('a')).map(a => ({ text: a.innerText, href: a.href }));
  });
  console.log(links);

  await context.close();
}

findUrl().catch(console.error);
