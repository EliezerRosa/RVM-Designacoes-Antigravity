import { Page } from 'playwright';
import { hgSession } from './session.js';
import { ParsedDocument, ParsedRow } from '../types.js';
import { store } from '../store.js';

const MONTH_NAMES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

const MONTH_NAMES_EN = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

export class HgBrowserAutomation {
  /**
   * Sincroniza um documento completo (Fim de Semana, Indicadores/AV ou Limpeza)
   */
  async syncDocument(doc: ParsedDocument): Promise<{ success: boolean; count: number; error?: string }> {
    let syncedCount = 0;
    try {
      const typeId = doc.detectedType.id;
      let targetPath = '/scheduling/wm';
      if (typeId === 'av') targetPath = '/scheduling/av_attendant';
      else if (typeId === 'clean') targetPath = '/scheduling/other/clean';

      const targetUrl = `https://app.hourglass-app.com/v2/page/app${targetPath}`;
      console.log(`[Browser] Sincronizando documento ${doc.fileName} (${doc.detectedType.name}) em ${targetUrl}...`);

      const { page } = await hgSession.getContext(false);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Agrupa as linhas por Ano-Mês (ex: '2026-11')
      const rowsByMonth: Record<string, ParsedRow[]> = {};
      for (const row of doc.rows) {
        if (!row.date) continue;
        const ym = row.date.substring(0, 7); // 'YYYY-MM'
        if (!rowsByMonth[ym]) rowsByMonth[ym] = [];
        rowsByMonth[ym].push(row);
      }

      const ledgerEntries: any[] = [];

      for (const [ym, monthRows] of Object.entries(rowsByMonth)) {
        console.log(`[Browser] Processando mês ${ym} (${monthRows.length} designações)...`);
        await this.navigateToMonth(page, ym);
        await page.waitForTimeout(1000);

        // Habilita edição se o botão "Editar" estiver visível
        await this.ensureEditMode(page);

        for (const row of monthRows) {
          const dayNumber = parseInt(row.date.split('-')[2], 10);
          console.log(`  📅 Sincronizando data ${row.date} (Dia ${dayNumber})...`);

          for (const col of doc.detectedType.columns) {
            if (col.field === 'date') continue;
            const cell = row.values[col.field];
            if (!cell) continue;

            const targetName = cell.resolved?.canonicalName || cell.raw;
            if (!targetName || targetName === '—' || targetName.toLowerCase() === 'livre') continue;

            const fieldLabel = col.label || col.name;
            const selected = await this.selectAssignmentInDay(page, dayNumber, fieldLabel, targetName);
            if (selected) {
              syncedCount++;
              ledgerEntries.push({
                module: typeId,
                date: row.date,
                slotKey: col.field,
                assignedHgId: cell.resolved?.hg_id || 0,
                assignedName: targetName,
                source: doc.fileName
              });
            }
          }
        }

        // Salva as alterações do mês
        await this.clickSaveButton(page);
        await page.waitForTimeout(1500);
      }

      if (ledgerEntries.length > 0) {
        store.recordLedger(ledgerEntries);
      }

      store.addLog({
        module: doc.detectedType.id,
        trigger: 'manual_ui',
        summary: `${syncedCount} designações de "${doc.fileName}" sincronizadas no Hourglass via UI.`,
        changesCount: syncedCount
      });

      return { success: true, count: syncedCount };
    } catch (err: any) {
      console.error('[Browser] Erro ao sincronizar documento:', err);
      store.addLog({
        module: doc.detectedType.id,
        trigger: 'manual_ui',
        summary: `Erro ao sincronizar "${doc.fileName}": ${err.message}`,
        changesCount: syncedCount,
        status: 'error',
        details: err.stack
      });
      return { success: false, count: syncedCount, error: err.message };
    }
  }

  /**
   * Navega o calendário para o Ano-Mês especificado (ex: '2026-11')
   */
  async navigateToMonth(page: Page, targetYM: string): Promise<void> {
    const [yearStr, monthStr] = targetYM.split('-');
    const year = parseInt(yearStr, 10);
    const monthIdx = parseInt(monthStr, 10) - 1; // 0-based
    const targetPt = MONTH_NAMES_PT[monthIdx];
    const targetEn = MONTH_NAMES_EN[monthIdx];

    for (let attempts = 0; attempts < 24; attempts++) {
      const headerText = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('h1, h2, h3, h4, .calendar-header, .page-header, div'));
        for (const el of els) {
          const txt = (el as HTMLElement).innerText || '';
          if (/\b(202[4-9]|203[0-5])\b/.test(txt) && (
            MONTH_NAMES_PT.some(m => txt.toLowerCase().includes(m)) ||
            MONTH_NAMES_EN.some(m => txt.toLowerCase().includes(m))
          )) {
            return txt.toLowerCase();
          }
        }
        return '';
      });

      const hasTargetMonth = headerText.includes(targetPt) || headerText.includes(targetEn);
      const hasTargetYear = headerText.includes(year.toString());

      if (hasTargetMonth && hasTargetYear) {
        return; // Já estamos no mês correto
      }

      const nextBtn = page.locator('button:has-text(">"), button[aria-label*="next"], button[aria-label*="Next"], button:has(.fa-chevron-right), button:has(.fa-angle-right), .btn-next').first();
      if (await nextBtn.count() > 0 && await nextBtn.isVisible()) {
        await nextBtn.click();
        await page.waitForTimeout(400);
      } else {
        const btns = await page.locator('button').all();
        let clicked = false;
        for (const b of btns) {
          const txt = (await b.innerText()).trim();
          if (txt === '›' || txt === '»' || txt === '>') {
            await b.click();
            clicked = true;
            await page.waitForTimeout(400);
            break;
          }
        }
        if (!clicked) break;
      }
    }
  }

  /**
   * Garante que o modo de edição está ativo clicando em "Editar"
   */
  async ensureEditMode(page: Page): Promise<void> {
    try {
      const editBtn = page.locator('button:has-text("Editar")').first();
      if (await editBtn.count() > 0 && await editBtn.isVisible()) {
        await editBtn.click();
        await page.waitForTimeout(600);
      }
    } catch {}
  }

  /**
   * Clica no botão "Salvar"
   */
  async clickSaveButton(page: Page): Promise<void> {
    try {
      const saveBtn = page.locator('button:has-text("Salvar")').first();
      if (await saveBtn.count() > 0 && await saveBtn.isVisible()) {
        await saveBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch (e) {
      console.warn('[Browser] Botão Salvar não encontrado ou erro:', e);
    }
  }

  /**
   * Localiza o card do dia específico e preenche o dropdown do cargo
   */
  async selectAssignmentInDay(page: Page, dayNumber: number, fieldLabel: string, personName: string): Promise<boolean> {
    try {
      // Localiza o card ou container que possui o número do dia
      const dayContainer = page.locator(`.card, .day-container, tr, .row, div:has(> .date-badge)`)
        .filter({ hasText: new RegExp(`\\b${dayNumber}\\b`) })
        .first();

      let dropdownBtn = dayContainer.locator(`div:has-text("${fieldLabel}") button.dropdown-toggle, button.dropdown-toggle:right-of(:text("${fieldLabel}"))`).first();
      
      if (await dropdownBtn.count() === 0) {
        dropdownBtn = page.locator(`button.dropdown-toggle`).filter({ has: page.locator(`xpath=ancestor::div[contains(., "${fieldLabel}")]`) }).first();
      }

      if (await dropdownBtn.count() === 0) {
        console.warn(`[Browser] Botão dropdown para "${fieldLabel}" no dia ${dayNumber} não encontrado.`);
        return false;
      }

      const currentText = (await dropdownBtn.innerText()).trim();
      if (currentText.toLowerCase().includes(personName.toLowerCase())) {
        return true; // Já está correto
      }

      await dropdownBtn.click();
      await page.waitForTimeout(400);

      const menu = page.locator('.dropdown-menu.show, .dropdown-menu').first();
      if (await menu.count() === 0) {
        return false;
      }

      const searchInput = menu.locator('input').first();
      if (await searchInput.count() > 0 && await searchInput.isVisible()) {
        await searchInput.fill(personName);
        await page.waitForTimeout(300);
      }

      const targetOption = page.evaluate((target) => {
        const menuEl = document.querySelector('.dropdown-menu.show, .dropdown-menu');
        if (!menuEl) return false;

        const items = Array.from(menuEl.querySelectorAll('.dropdown-item, [role="button"], button, div, a'));
        const match = items.find(el => {
          const txt = (el as HTMLElement).innerText || '';
          return txt.toLowerCase().includes(target.toLowerCase());
        });

        if (match) {
          const clickable = match.closest('button, [role="button"], a, div') as HTMLElement;
          if (clickable) {
            clickable.click();
            return true;
          }
        }
        return false;
      }, personName);

      const clicked = await targetOption;
      await page.waitForTimeout(400);

      if (!clicked) {
        await page.keyboard.press('Escape');
      }

      return clicked;
    } catch (err) {
      console.warn(`[Browser] Erro ao selecionar ${personName} em ${fieldLabel} (Dia ${dayNumber}):`, err);
      return false;
    }
  }
}

export const hgBrowser = new HgBrowserAutomation();
