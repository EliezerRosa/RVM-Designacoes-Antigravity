import { chromium } from 'playwright';
import * as path from 'path';
import { weekendSchedule, mapBrother } from './weekend_data.js';

async function main() {
  console.log('🚀 Iniciando Robô do Hourglass pelo Terminal (Modo Stealth Chrome)...');
  console.log(`📋 Total de semanas a sincronizar: ${weekendSchedule.length}`);

  const userDataDir = path.resolve(process.cwd(), 'hourglass_session');
  
  // Abre o Google Chrome real com flags de anti-detecção para o Google Sign-In funcionar 100%
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check'
    ],
    viewport: { width: 1366, height: 850 }
  });

  let page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  console.log('🌐 Navegando para o Hourglass (Fim de Semana)...');
  await page.goto('https://app.hourglass-app.com/v2/page/app/scheduling/wm');
  await page.waitForTimeout(3000);

  // Verifica se está na tela de login
  let isAuthenticated = false;

  for (let attempt = 0; attempt < 600; attempt++) { // até 10 minutos
    for (const p of context.pages()) {
      try {
        const currentUrl = p.url();
        if (currentUrl.includes('/app') && !currentUrl.includes('login') && !currentUrl.includes('auth')) {
          const isSignIn = await p.evaluate(() => {
            const text = document.body ? document.body.innerText : '';
            return text.includes('Hourglass Sign In') || !!document.querySelector('#email');
          });

          if (!isSignIn) {
            isAuthenticated = true;
            page = p;
            break;
          }
        }
      } catch (e) {}
    }

    if (isAuthenticated) {
      console.log('✅ Autenticação confirmada!');
      break;
    }

    if (attempt === 0) {
      console.log('\n=========================================================================');
      console.log('👉 Janela aberta! Clicando automaticamente em "Google Sign-In"...');
      console.log('=========================================================================\n');

      try {
        const googleBtn = page.locator('text="Google Sign-In", button:has-text("Google")').first();
        if (await googleBtn.count() > 0) {
          await googleBtn.click();
          console.log('👆 Botão Google Sign-In clicado! Se abrir a janela de contas, selecione seu e-mail.');
        }
      } catch (clickErr) {
        console.log('Por favor, clique em Google Sign-In na tela se não abriu automaticamente.');
      }
    }

    await page.waitForTimeout(1000);
  }

  if (!isAuthenticated) {
    console.error('❌ Tempo limite de login esgotado.');
    await context.close();
    return;
  }

  // Garante que está na tela de Fim de Semana
  if (!page.url().includes('scheduling/wm')) {
    console.log('Navegando para Agendamento de Fim de Semana (/scheduling/wm)...');
    await page.goto('https://app.hourglass-app.com/v2/page/app/scheduling/wm');
    await page.waitForTimeout(4000);
  }

  console.log('📍 Conectado na tela de Fim de Semana:', page.url());

  // Loop de preenchimento das 26 semanas
  for (let i = 0; i < weekendSchedule.length; i++) {
    const item = weekendSchedule[i];
    const pres = mapBrother(item.pres, 'pres');
    const leit = mapBrother(item.leit, 'leit');

    console.log(`\n📅 [${i + 1}/${weekendSchedule.length}] Semana de ${item.date} (Domingo)`);
    console.log(`   👑 Presidente: ${pres?.fullName} (${pres?.searchName})`);
    console.log(`   📖 Leitor:     ${leit?.fullName} (${leit?.searchName})`);

    try {
      // 1. Mudar data no DatePicker
      const dateInput = page.locator('input[type="date"]');
      if (await dateInput.count() > 0) {
        await dateInput.fill(item.date);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }

      // 2. Preencher Presidente
      if (pres) {
        await assignDropdown(page, ['#ddm_wm_chairman', '#ddm_chairman', '[id*="chairman"]'], pres.searchName, 'Presidente');
      }

      // 3. Preencher Leitor
      if (leit) {
        await assignDropdown(page, ['#ddm_wm_reader', '#ddm_reader', '[id*="reader"]'], leit.searchName, 'Leitor');
      }

      await page.waitForTimeout(1000);
    } catch (err: any) {
      console.warn(`⚠️ Erro na semana ${item.date}:`, err.message);
    }
  }

  console.log('\n============================================================');
  console.log('🎉 Sincronização de todas as 26 semanas concluída com sucesso!');
  console.log('👀 A janela permanecerá aberta por 60 segundos para sua conferência.');
  await page.waitForTimeout(60000);

  await context.close();
}

async function assignDropdown(page: any, selectors: string[], searchName: string, roleLabel: string) {
  let button = null;
  for (const sel of selectors) {
    const loc = page.locator(sel);
    if (await loc.count() > 0) {
      button = loc.locator('button').first();
      break;
    }
  }

  if (!button || await button.count() === 0) {
    const labelRow = page.locator(`tr:has-text("${roleLabel}"), div:has-text("${roleLabel}")`).first();
    if (await labelRow.count() > 0) {
      button = labelRow.locator('button.dropdown-toggle, button[data-bs-toggle="dropdown"]').first();
    }
  }

  if (!button || await button.count() === 0) {
    console.log(`   ⚠️ Botão para ${roleLabel} não localizado na tela.`);
    return;
  }

  await button.click({ timeout: 4000 });
  await page.waitForTimeout(500);

  const searchInput = page.locator('.dropdown-menu.show input, .dropdown-menu input').first();
  if (await searchInput.count() > 0 && await searchInput.isVisible()) {
    await searchInput.fill(searchName);
    await page.waitForTimeout(500);
  }

  const item = page.locator('.dropdown-menu.show .dropdown-item, .dropdown-menu .dropdown-item')
    .filter({ hasText: searchName })
    .first();

  if (await item.count() > 0) {
    await item.click({ timeout: 4000 });
    console.log(`   ✅ ${roleLabel} selecionado: ${searchName}`);
  } else {
    console.log(`   ⚠️ "${searchName}" não encontrado no dropdown.`);
    await page.keyboard.press('Escape');
  }
}

main().catch(console.error);
