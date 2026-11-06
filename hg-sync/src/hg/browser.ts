import { Page } from 'playwright';
import { hgSession } from './session.js';
import { ParsedDocument, ExtractedAssignmentRow } from '../types.js';
import { store } from '../store.js';
import { config } from '../config.js';

export class HgBrowserAutomation {
  /**
   * Sincroniza um documento completo (Fim de Semana, Indicadores/AV ou Limpeza)
   * Usa `config.headlessBrowser` por padrão para rodar invisível em segundo plano.
   */
  async syncDocument(
    doc: ParsedDocument,
    trigger: 'manual_ui' | 'auto_worker' = 'auto_worker'
  ): Promise<{ success: boolean; count: number; error?: string }> {
    let syncedCount = 0;
    try {
      const targetModule = doc.detectedType.targetModule || doc.detectedType.id;
      let targetPath = '/scheduling/wm';
      if (targetModule === 'av' || targetModule.includes('indicador') || targetModule.includes('microfone')) {
        targetPath = '/scheduling/av_attendant';
      } else if (targetModule === 'clean' || targetModule.includes('limpeza')) {
        targetPath = '/scheduling/other/clean';
      }

      const targetUrl = `https://app.hourglass-app.com/v2/page/app${targetPath}`;
      console.log(`[Browser] 🚀 Iniciando sincronização (${trigger}, headless=${config.headlessBrowser}): ${doc.fileName} (${doc.detectedType.name}) em ${targetUrl}...`);

      const { page } = await hgSession.getContext(config.headlessBrowser);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      // 1. Verifica se está autenticado
      const isAuthed = await this.checkIsAuthenticated(page);
      if (!isAuthed) {
        const errorMsg = 'Hourglass não está autenticado.';
        console.warn(`[Browser] ⚠️ ${errorMsg}`);
        return { success: false, count: 0, error: errorMsg };
      }

      // 2. Filtra datas a partir da semana em curso (não sincroniza passado desnecessariamente)
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const day = now.getDay();
      const diffMonday = now.getDate() - day + (day === 0 ? -6 : 1);
      const startMonday = new Date(now.setDate(diffMonday));
      const startMondayIso = startMonday.toISOString().split('T')[0];

      // Agrupa as linhas por Ano-Mês (ex: '2026-11')
      const rowsByMonth: Record<string, ExtractedAssignmentRow[]> = {};
      for (const row of doc.rows) {
        if (!row.date) continue;
        if (row.date < startMondayIso) {
          continue;
        }

        const ym = row.date.substring(0, 7); // 'YYYY-MM'
        if (!rowsByMonth[ym]) rowsByMonth[ym] = [];
        rowsByMonth[ym].push(row);
      }

      const ledgerEntries: any[] = [];
      const ledgerModule = (['wm', 'av', 'clean'].includes(targetModule) ? targetModule : 'wm') as 'wm' | 'av' | 'clean';

      for (const [ym, monthRows] of Object.entries(rowsByMonth)) {
        console.log(`[Browser] 📅 Processando mês ${ym} (${monthRows.length} designações)...`);
        await this.navigateToMonth(page, ym);
        await page.waitForTimeout(1000);

        await this.ensureEditMode(page);

        for (const row of monthRows) {
          const dayNumber = parseInt(row.date.split('-')[2], 10);
          console.log(`  👉 Sincronizando data ${row.date} (Dia ${dayNumber})...`);

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
                module: ledgerModule,
                date: row.date,
                slotKey: col.field,
                assignedHgId: cell.resolved?.hg_id || 0,
                assignedName: targetName,
                source: 'download_pdf'
              });
              console.log(`     ✅ [${fieldLabel}]: ${targetName}`);
            } else {
              console.warn(`     ⚠️ [${fieldLabel}]: não foi possível selecionar "${targetName}" no dia ${dayNumber}`);
            }
          }
        }

        await this.clickSaveButton(page);
        await page.waitForTimeout(1500);
      }

      if (ledgerEntries.length > 0) {
        store.recordLedger(ledgerEntries);
      }

      store.addLog({
        module: doc.detectedType.id,
        trigger,
        summary: `${syncedCount} designações de "${doc.fileName}" sincronizadas no Hourglass com sucesso.`,
        changesCount: syncedCount,
        status: 'success'
      });

      return { success: true, count: syncedCount };
    } catch (err: any) {
      console.error('[Browser] Erro ao sincronizar documento:', err);
      store.addLog({
        module: doc.detectedType.id,
        trigger,
        summary: `Erro ao sincronizar "${doc.fileName}": ${err.message}`,
        changesCount: syncedCount,
        status: 'error',
        details: err.stack
      });
      return { success: false, count: syncedCount, error: err.message };
    }
  }

  /**
   * Fallback automático via DOM para gravar partes do Meio de Semana (tgw, fm, lac, etc.)
   * e interceptar o endpoint real do Hourglass para futuras chamadas REST diretas.
   */
  async saveMidweekSlotViaDom(
    weekDate: string,
    slotKey: string,
    slotLabel: string,
    personName: string
  ): Promise<boolean> {
    try {
      const { page } = await hgSession.getContext(config.headlessBrowser);
      const sectionPrefix = slotKey.split('_')[0]; // tgw, fm, lac

      const requestListener = (req: any) => {
        const u = req.url();
        const m = req.method();
        if ((m === 'PUT' || m === 'POST') && u.includes('/api/v0.2/scheduling/mm/')) {
          try {
            const urlObj = new URL(u);
            const pattern = urlObj.pathname.replace(weekDate, '{date}') + urlObj.search;
            store.saveEndpoint(`mm_${sectionPrefix}`, {
              method: m,
              urlPattern: pattern,
              learnedAt: new Date().toISOString()
            });
          } catch {}
        }
      };

      page.on('request', requestListener);
      try {
        const targetUrl = 'https://app.hourglass-app.com/v2/page/app/scheduling/mm';
        if (!page.url().includes('/scheduling/mm')) {
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await page.waitForTimeout(2500);
        }

        const ym = weekDate.substring(0, 7);
        await this.navigateToMonth(page, ym);
        await page.waitForTimeout(800);

        const monday = new Date(weekDate + 'T12:00:00Z');
        const thursday = new Date(monday.getTime() + 3 * 86400000);
        const tuesday = new Date(monday.getTime() + 1 * 86400000);
        const dayNumber = parseInt(weekDate.split('-')[2], 10);
        const thursdayDay = thursday.getUTCDate();
        const tuesdayDay = tuesday.getUTCDate();
        const searchLabel = slotLabel.split(':')[0].trim();

        // Tenta encontrar pela quinta-feira (dia padrão), depois terça (visita) ou pela própria segunda-feira
        let ok = await this.selectAssignmentInDay(page, thursdayDay, searchLabel, personName || '—');
        if (!ok) {
          ok = await this.selectAssignmentInDay(page, tuesdayDay, searchLabel, personName || '—');
        }
        if (!ok) {
          ok = await this.selectAssignmentInDay(page, dayNumber, searchLabel, personName || '—');
        }
        if (ok) {
          await this.clickSaveButton(page);
          await page.waitForTimeout(800);
        }
        return ok;
      } finally {
        page.off('request', requestListener);
      }
    } catch (err: any) {
      console.warn(`[Browser] Fallback DOM falhou para ${weekDate} (${slotKey}): ${err.message}`);
      return false;
    }
  }

  /**
   * Verifica de forma definitiva se o Hourglass está logado
   */
  async checkIsAuthenticated(page: Page): Promise<boolean> {
    try {
      return await page.evaluate(async () => {
        const text = document.body ? document.body.innerText : '';
        if (text.includes('Hourglass Sign In') || !!document.querySelector('#email')) {
          return false;
        }

        try {
          const res = await fetch('/api/v0.2/fsreport/startup');
          if (res.ok) {
            const data = await res.json();
            return !!(data?.whoami?.user?.id);
          }
        } catch {}

        return text.includes('DESIGNAÇÕES') || text.includes('PESSOAS') || !!document.querySelector('.dropdown-toggle');
      });
    } catch {
      return false;
    }
  }

  /**
   * Navega o calendário bidirecionalmente (anterior e próximo) para o Ano-Mês especificado
   */
  async navigateToMonth(page: Page, targetYM: string): Promise<void> {
    const [yearStr, monthStr] = targetYM.split('-');
    const targetYear = parseInt(yearStr, 10);
    const targetMonthIdx = parseInt(monthStr, 10) - 1;
    const targetTargetValue = targetYear * 12 + targetMonthIdx;

    for (let attempts = 0; attempts < 24; attempts++) {
      const currentMonthInfo = await page.evaluate(() => {
        const headerEls = Array.from(document.querySelectorAll('h1, h2, h3, h4, .calendar-header, .page-header, div'));
        const monthsPt = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        const monthsEn = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

        for (const el of headerEls) {
          const txt = ((el as HTMLElement).innerText || '').trim().toLowerCase();
          const yearMatch = txt.match(/\b(202[4-9]|203[0-5])\b/);
          if (yearMatch) {
            const y = parseInt(yearMatch[1], 10);
            for (let m = 0; m < 12; m++) {
              if (txt.includes(monthsPt[m]) || txt.includes(monthsEn[m])) {
                return { year: y, monthIndex: m };
              }
            }
          }
        }
        return null;
      });

      if (currentMonthInfo) {
        const currentTargetValue = currentMonthInfo.year * 12 + currentMonthInfo.monthIndex;
        if (currentTargetValue === targetTargetValue) {
          return;
        }

        const shouldGoNext = currentTargetValue < targetTargetValue;
        const clicked = await page.evaluate((goNext) => {
          const buttons = Array.from(document.querySelectorAll('button'));
          for (const b of buttons) {
            const txt = b.innerText.trim();
            const aria = (b.getAttribute('aria-label') || '').toLowerCase();
            const html = b.innerHTML.toLowerCase();

            if (goNext) {
              if (txt === '>' || txt === '»' || txt === '›' || aria.includes('next') || html.includes('right') || html.includes('chevron-right')) {
                b.click();
                return true;
              }
            } else {
              if (txt === '<' || txt === '«' || txt === '‹' || aria.includes('prev') || html.includes('left') || html.includes('chevron-left')) {
                b.click();
                return true;
              }
            }
          }
          return false;
        }, shouldGoNext);

        if (clicked) {
          await page.waitForTimeout(500);
          continue;
        }
      }

      break;
    }
  }

  /**
   * Garante que o modo de edição está ativo clicando em "Editar"
   */
  async ensureEditMode(page: Page): Promise<void> {
    try {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const editBtn = btns.find(b => b.innerText.trim().toLowerCase() === 'editar');
        if (editBtn) editBtn.click();
      });
      await page.waitForTimeout(600);
    } catch {}
  }

  /**
   * Clica no botão "Salvar"
   */
  async clickSaveButton(page: Page): Promise<void> {
    try {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const saveBtn = btns.find(b => b.innerText.trim().toLowerCase() === 'salvar');
        if (saveBtn) saveBtn.click();
      });
      await page.waitForTimeout(1000);
    } catch {}
  }

  /**
   * Localiza o dia específico e seleciona a opção no dropdown
   */
  async selectAssignmentInDay(page: Page, dayNumber: number, fieldLabel: string, personName: string): Promise<boolean> {
    try {
      const dropdownOpened = await page.evaluate(`(({ day, label, person }) => {
        const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();
        const searchLabel = norm(label);

        const allButtons = Array.from(document.querySelectorAll('button.dropdown-toggle'));

        for (const btn of allButtons) {
          const dayContainer = btn.closest('.card, .row, .day-container, div');
          const containerText = dayContainer?.innerText || '';

          const dayRegex = new RegExp('\\\\b' + day + '\\\\b');
          if (!dayRegex.test(containerText)) continue;

          const parentCol = btn.closest('div, .col, .row') || btn.parentElement;
          const parentText = norm(parentCol?.innerText || '');

          const labelMatches =
            parentText.includes(searchLabel) ||
            (searchLabel.includes('presidente') && parentText.includes('presidente')) ||
            (searchLabel.includes('leitor') && parentText.includes('leitor')) ||
            (searchLabel.includes('porteiro') && parentText.includes('porteiro')) ||
            (searchLabel.includes('auditorio') && parentText.includes('auditorio')) ||
            (searchLabel.includes('microfone 1') && parentText.includes('microfone 1')) ||
            (searchLabel.includes('microfone 2') && parentText.includes('microfone 2')) ||
            (searchLabel.includes('grupo') && parentText.includes('grupo'));

          if (labelMatches) {
            if (person && person !== '—' && norm(btn.innerText).includes(norm(person))) {
              return { success: true, alreadySelected: true };
            }

            btn.click();
            return { success: true, clicked: true };
          }
        }

        return { success: false };
      })(${JSON.stringify({ day: dayNumber, label: fieldLabel, person: personName })})`) as { success: boolean; clicked?: boolean; alreadySelected?: boolean };

      if (!dropdownOpened || !dropdownOpened.success) {
        return false;
      }

      if (dropdownOpened.alreadySelected) {
        return true;
      }

      await page.waitForTimeout(400);

      const selected = await page.evaluate(`((targetPerson) => {
        const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();
        const target = norm(targetPerson);

        const menuEl = document.querySelector('.dropdown-menu.show, .dropdown-menu');
        if (!menuEl) return false;

        if (!target || target === '—' || target === 'vazio') {
          const clearBtn = Array.from(menuEl.querySelectorAll('.dropdown-item, button, a, div')).find(el => {
            const t = norm(el.innerText || '');
            return t === '' || t === 'nenhum' || t === 'limpar' || t === 'remover' || t === '—';
          });
          if (clearBtn) {
            clearBtn.click();
            return true;
          }
        }

        const searchInput = menuEl.querySelector('input');
        if (searchInput) {
          searchInput.focus();
          searchInput.value = targetPerson;
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          searchInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const items = Array.from(menuEl.querySelectorAll('.dropdown-item, [role="button"], button, div, a'));
        const match = items.find(el => {
          const txt = norm(el.innerText || '');
          return txt.includes(target) || (target.split(' ').length > 1 && txt.includes(norm(target.split(' ')[0])));
        });

        if (match) {
          const clickable = match.closest('button, [role="button"], a, div') || match;
          clickable.click();
          return true;
        }

        return false;
      })(${JSON.stringify(personName)})`) as boolean;

      await page.waitForTimeout(400);

      if (!selected) {
        await page.keyboard.press('Escape');
      }

      return selected;
    } catch (err) {
      console.warn(`[Browser] Erro ao selecionar ${personName} em ${fieldLabel} (Dia ${dayNumber}):`, err);
      return false;
    }
  }
}

export const hgBrowser = new HgBrowserAutomation();
