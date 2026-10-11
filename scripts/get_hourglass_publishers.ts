import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

async function extractPublishers() {
  const userDataDir = path.resolve(process.cwd(), 'hourglass_session');
  const context = await chromium.launchPersistentContext(userDataDir, { headless: false });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  // Limpa o log antigo
  fs.writeFileSync('hourglass_all_responses.txt', '');

  console.log('Navegando para a página de Todos os Publicadores...');
  await page.goto('https://app.hourglass-app.com/v2/page/app/contactList');
  await page.waitForTimeout(5000);

  const html = await page.content();
  fs.writeFileSync('hourglass_contactList.html', html);

  const hgGlobal = await page.evaluate(() => {
      // @ts-ignore
      return window.HGGlobal ? JSON.stringify(window.HGGlobal).substring(0, 500) : 'Nao achou HGGlobal';
  });
  console.log(`HGGlobal: ${hgGlobal}`);

  console.log('Clicando em um menu para forçar o download dos nomes...');
  try {
      await page.locator('.ddm button').first().click();
      await page.waitForTimeout(3000);
  } catch(e) {
      console.log('Não consegui clicar no menu. (Tudo bem se a API já tiver carregado)');
  }

  console.log('✅ Concluído! Verifique hourglass_all_responses.txt');
  await context.close();
}

extractPublishers().catch(console.error);
