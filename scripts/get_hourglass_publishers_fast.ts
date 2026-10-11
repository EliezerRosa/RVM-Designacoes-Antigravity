import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

async function extractIds() {
  const userDataDir = path.resolve(process.cwd(), 'hourglass_session');
  const context = await chromium.launchPersistentContext(userDataDir, { headless: false });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  console.log('Navegando para a página de Todos os Publicadores...');
  await page.goto('https://app.hourglass-app.com/v2/page/app/contactList');
  await page.waitForTimeout(5000); // Espera a tabela carregar

  const publishers = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      return rows.map(tr => {
          // O nome geralmente é a primeira ou segunda coluna
          const name = tr.querySelector('td')?.innerText.trim();
          
          // O botão de editar (lápis) tem um link com o ID do usuário
          const editLink = tr.querySelector('a[href*="/user/edit/"]');
          let id = null;
          if (editLink) {
              const href = editLink.getAttribute('href');
              const match = href?.match(/\/user\/edit\/(\d+)/);
              if (match) id = match[1];
          }
          
          return { name, hg_id: id };
      }).filter(p => p.hg_id); // Só retorna os que achou o ID
  });

  fs.writeFileSync('hourglass_ids_extracted.json', JSON.stringify(publishers, null, 2));
  console.log(`✅ Extraídos ${publishers.length} publicadores direto da tabela do Hourglass!`);
  await context.close();
}

extractIds().catch(console.error);
