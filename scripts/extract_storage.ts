import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

async function extractStorage() {
  const userDataDir = path.resolve(process.cwd(), 'hourglass_session');
  const context = await chromium.launchPersistentContext(userDataDir, { headless: false });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  console.log('Navegando para o Hourglass...');
  await page.goto('https://app.hourglass-app.com/v2/page/app');
  await page.waitForTimeout(3000);

  const storageDump = await page.evaluate(async () => {
      const dump: any = { localStorage: { ...localStorage } };
      
      // Tentativa de ler IndexedDB
      try {
          const dbName = 'localforage';
          const dbs = await window.indexedDB.databases();
          dump.dbs = dbs;
      } catch(e) {}
      
      return JSON.stringify(dump, null, 2);
  });
  
  fs.writeFileSync('hourglass_storage.json', storageDump);
  console.log('✅ Armazenamento salvo em hourglass_storage.json!');
  await context.close();
}

extractStorage().catch(console.error);
