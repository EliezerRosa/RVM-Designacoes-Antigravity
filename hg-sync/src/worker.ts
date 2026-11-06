import * as fs from 'fs';
import * as crypto from 'crypto';
import { config } from './config.js';
import { rvmReader } from './rvm/reader.js';
import { hgApi } from './hg/api.js';
import { hgBrowser } from './hg/browser.js';
import { hgSession } from './hg/session.js';
import { mapWeekPartsToHgSlots } from './midweek/mapper.js';
import { computeMidweekDiff } from './midweek/reconcile.js';
import { scanDownloadsFolder } from './imports/scan.js';
import { store } from './store.js';
import { nameResolver } from './names/resolver.js';
import { ParsedDocument } from './types.js';

export function computeFileSha256(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function shouldAutoSyncDownloadDoc(
  doc: ParsedDocument,
  sha256: string,
  processedMap: Record<string, { sha256: string; unresolvedCount: number; syncedCount: number }>
): boolean {
  const prev = processedMap[doc.fileName];
  if (!prev) return true;
  if (prev.sha256 !== sha256) return true;
  if (doc.unresolvedCount < prev.unresolvedCount) return true;
  return false;
}

export class SyncWorker {
  private timer: NodeJS.Timeout | null = null;
  private rvmWatchTimer: NodeJS.Timeout | null = null;
  private downloadsWatcher: fs.FSWatcher | null = null;
  private downloadsDebounceTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastRunTime: string | null = null;
  private lastResultSummary: string = 'Aguardando primeira execução';
  private lastRvmHash: string = '';

  getStatus() {
    return {
      enabled: config.autoSyncEnabled,
      intervalMinutes: config.pollIntervalMinutes,
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      lastResultSummary: this.lastResultSummary
    };
  }

  start() {
    this.stop();
    console.log(`[Worker] Iniciando vigia 100% automático (ciclo completo: ${config.pollIntervalMinutes} min | detector RVM: 60s | watcher Downloads ativo)...`);

    // 1. Watcher em tempo real na pasta Downloads (com debounce de 3s)
    this.startDownloadsWatcher();

    // 2. Executa a primeira checagem após 4 segundos
    setTimeout(() => {
      if (config.autoSyncEnabled) {
        this.runCheck('auto_worker');
      }
    }, 4000);

    // 3. Detector rápido de mudanças no RVM (a cada 60s verifica se o hash das semanas publicadas mudou)
    this.rvmWatchTimer = setInterval(async () => {
      if (!config.autoSyncEnabled || this.isRunning) return;
      try {
        const changed = await this.hasRvmChangedSinceLastHash();
        if (changed) {
          console.log('[Worker] ⚡ Mudança detectada nas semanas publicadas do RVM! Disparando sincronização imediata...');
          await this.runCheck('auto_worker');
        }
      } catch {}
    }, 60 * 1000);

    // 4. Ciclo completo de reconciliação (a cada pollIntervalMinutes)
    this.timer = setInterval(() => {
      if (config.autoSyncEnabled) {
        this.runCheck('auto_worker');
      }
    }, config.pollIntervalMinutes * 60 * 1000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.rvmWatchTimer) {
      clearInterval(this.rvmWatchTimer);
      this.rvmWatchTimer = null;
    }
    if (this.downloadsDebounceTimer) {
      clearTimeout(this.downloadsDebounceTimer);
      this.downloadsDebounceTimer = null;
    }
    if (this.downloadsWatcher) {
      try {
        this.downloadsWatcher.close();
      } catch {}
      this.downloadsWatcher = null;
    }
    console.log('[Worker] Vigia pausado.');
  }

  private startDownloadsWatcher() {
    if (!fs.existsSync(config.downloadsDir)) return;
    try {
      this.downloadsWatcher = fs.watch(config.downloadsDir, (_eventType, filename) => {
        if (!config.autoSyncEnabled || !filename) return;
        const upper = filename.toUpperCase();
        const isScaleFile =
          (upper.endsWith('.PDF') || upper.endsWith('.XLSX') || upper.endsWith('.XLS') || upper.endsWith('.CSV')) &&
          (upper.includes('PRESIDENTE') ||
            upper.includes('LEITOR') ||
            upper.includes('INDICADOR') ||
            upper.includes('MICROFONE') ||
            upper.includes('LIMPEZA'));
        if (!isScaleFile) return;

        if (this.downloadsDebounceTimer) clearTimeout(this.downloadsDebounceTimer);
        this.downloadsDebounceTimer = setTimeout(() => {
          console.log(`[Worker] 📂 Arquivo de escala detectado/atualizado em Downloads (${filename}). Sincronizando automaticamente...`);
          this.runCheck('auto_worker');
        }, 3000);
      });
    } catch (e: any) {
      console.warn('[Worker] Não foi possível iniciar fs.watch em Downloads:', e.message);
    }
  }

  private getCurrentMondayIso(): string {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
    const currentMonday = new Date(now.setDate(diffToMonday));
    return currentMonday.toISOString().split('T')[0];
  }

  private async hasRvmChangedSinceLastHash(): Promise<boolean> {
    if (!rvmReader.isAvailable()) return false;
    const currentWeekId = this.getCurrentMondayIso();
    const publishedWeeks = await rvmReader.getPublishedWeeks();
    const allParts = await rvmReader.getMidweekParts(currentWeekId);
    const relevantParts = allParts
      .filter(p => Boolean(publishedWeeks[p.week_id]))
      .map(p => `${p.week_id}:${p.id}:${p.status}:${p.resolved_publisher_id || ''}:${p.resolved_publisher_name || ''}:${p.raw_publisher_name || ''}`);
    const payload = JSON.stringify({ publishedWeeks, relevantParts });
    const hash = crypto.createHash('sha256').update(payload).digest('hex');
    if (this.lastRvmHash && this.lastRvmHash !== hash) {
      this.lastRvmHash = hash;
      return true;
    }
    this.lastRvmHash = hash;
    return false;
  }

  async runCheck(trigger: 'manual_ui' | 'auto_worker' = 'manual_ui'): Promise<{ changesCount: number; summary: string }> {
    if (this.isRunning) {
      return { changesCount: 0, summary: 'Execução já em andamento' };
    }

    this.isRunning = true;
    this.lastRunTime = new Date().toISOString();
    console.log(`\n[Worker] 🔄 Iniciando reconciliação automática RVM + Downloads ➡️ Hourglass (${trigger})...`);

    try {
      // 1. Pré-carrega publicadores do RVM para ajudar na resolução de nomes antes mesmo do HG
      const rvmPublishers = rvmReader.isAvailable() ? await rvmReader.getPublishers() : [];
      const rvmKnown = rvmPublishers
        .filter(p => p.hg_id)
        .map(p => ({ hg_id: p.hg_id!, name: p.hg_name || p.name }));
      if (rvmKnown.length > 0) {
        nameResolver.setKnownPublishers(rvmKnown);
        store.syncAliasesWithKnownUsers(rvmKnown);
      }

      // 2. Verifica se há arquivos de escala novos/modificados em Downloads
      const scannedDocs = await scanDownloadsFolder();
      const processedFiles = store.getProcessedFiles();
      const pendingDocs: Array<{ doc: ParsedDocument; sha256: string }> = [];
      for (const doc of scannedDocs) {
        try {
          const sha256 = computeFileSha256(doc.filePath);
          if (shouldAutoSyncDownloadDoc(doc, sha256, processedFiles)) {
            pendingDocs.push({ doc, sha256 });
          }
        } catch {}
      }

      // 3. Verifica semanas publicadas no RVM
      const currentWeekId = this.getCurrentMondayIso();
      const publishedWeeks = rvmReader.isAvailable() ? await rvmReader.getPublishedWeeks() : {};
      const allParts = rvmReader.isAvailable() ? await rvmReader.getMidweekParts(currentWeekId) : [];
      const partsByWeek: Record<string, any[]> = {};
      for (const p of allParts) {
        if (!partsByWeek[p.week_id]) partsByWeek[p.week_id] = [];
        partsByWeek[p.week_id].push(p);
      }
      const targetWeeks = Object.keys(partsByWeek).filter(w => Boolean(publishedWeeks[w])).sort();

      // Atualiza hash do snapshot do RVM
      await this.hasRvmChangedSinceLastHash();

      // 4. Garante autenticação no Hourglass (com auto-login inteligente quando em modo auto_worker)
      const isAuthed = trigger === 'auto_worker'
        ? await hgSession.ensureAuthenticatedForAutoSync()
        : await hgSession.isAuthenticated(true);

      if (!isAuthed) {
        const msg = 'Aguardando autenticação no Hourglass (janela de login acionada ou em cooldown).';
        this.lastResultSummary = msg;
        console.warn(`[Worker] ⚠️ ${msg}`);
        return { changesCount: 0, summary: msg };
      }

      // 5. Carrega publicadores reais do Hourglass e sincroniza apelidos
      const hgUsers = await hgApi.getCongregationUsers();
      if (hgUsers.length > 0) {
        const hgKnown = hgUsers.map(u => ({ hg_id: u.id, name: u.displayName }));
        nameResolver.setKnownPublishers(hgKnown);
        store.syncAliasesWithKnownUsers(hgKnown);
      }
      const knownPublishersMap = new Map<number, string>(hgUsers.map(u => [u.id, u.displayName]));

      let midweekChanges = 0;
      let downloadsChanges = 0;

      // 6. Sincronização Meio de Semana (RVM ➡️ HG)
      if (targetWeeks.length > 0) {
        const pubMap = new Map(rvmPublishers.map(p => [p.id, p]));
        const startRange = targetWeeks[0];
        const endRange = targetWeeks[targetWeeks.length - 1];
        const hgSchedules = await hgApi.getMidweekSchedule(startRange, endRange);
        const hgMap = new Map(hgSchedules.map(s => [s.weekId, s]));
        const ledgerEntries: any[] = [];

        for (const weekId of targetWeeks) {
          const weekParts = partsByWeek[weekId] || [];
          const rvmSchedule = mapWeekPartsToHgSlots(weekId, weekParts, pubMap, true);
          const hgCurrent = hgMap.get(weekId) || null;

          const diffs = computeMidweekDiff(rvmSchedule, hgCurrent, knownPublishersMap);
          const pendingDiffs = diffs.filter(d => d.action !== 'noop');

          for (const diff of pendingDiffs) {
            const targetHgId = diff.action === 'clear' ? 0 : (diff.newAssignee?.hgId || 0);
            const targetName = diff.action === 'clear' ? '' : (diff.newAssignee?.name || '');

            const success = await hgApi.saveMidweekSlot(
              weekId,
              diff.slotKey,
              targetHgId,
              hgCurrent,
              diff.slotLabel,
              targetName
            );

            if (success) {
              midweekChanges++;
              ledgerEntries.push({
                module: 'mm',
                date: weekId,
                slotKey: diff.slotKey,
                assignedHgId: targetHgId,
                assignedName: diff.newAssignee?.name || 'Vazio',
                source: 'rvm'
              });
              console.log(`  ✅ [MM ${diff.action.toUpperCase()}] ${weekId} -> ${diff.slotLabel}: ${diff.newAssignee?.name || 'Esvaziado'}`);
            }
          }
        }

        if (ledgerEntries.length > 0) {
          store.recordLedger(ledgerEntries);
        }

        // Releitura automática de verificação pós-aplicação
        if (midweekChanges > 0) {
          const verifySchedules = await hgApi.getMidweekSchedule(startRange, endRange);
          console.log(`[Worker] 🔍 Releitura de verificação concluída (${verifySchedules.length} semanas confirmadas no Hourglass).`);
        }
      }

      // 7. Sincronização Automática de Escalas em Downloads (Downloads ➡️ HG)
      if (pendingDocs.length > 0) {
        // Re-escaneia após alimentar nameResolver com hgUsers para garantir máxima resolução
        const refreshedDocs = await scanDownloadsFolder();
        for (const item of pendingDocs) {
          const freshDoc = refreshedDocs.find(d => d.fileName === item.doc.fileName) || item.doc;
          console.log(`[Worker] 📄 Sincronizando automaticamente escala de Downloads: ${freshDoc.fileName}...`);
          const res = await hgBrowser.syncDocument(freshDoc, trigger);
          if (res.success) {
            downloadsChanges += res.count;
            store.saveProcessedFile({
              fileName: freshDoc.fileName,
              sha256: item.sha256,
              lastSyncedAt: new Date().toISOString(),
              unresolvedCount: freshDoc.unresolvedCount,
              syncedCount: res.count
            });
          }
        }
      }

      const totalChanges = midweekChanges + downloadsChanges;
      const summary = totalChanges > 0
        ? `${totalChanges} designações sincronizadas automaticamente (Meio de Semana: ${midweekChanges}, Downloads: ${downloadsChanges}).`
        : 'Tudo atualizado entre RVM, Downloads e Hourglass.';

      this.lastResultSummary = summary;

      store.addLog({
        module: 'mm',
        trigger,
        summary,
        changesCount: totalChanges,
        status: 'success'
      });

      console.log(`[Worker] 🏁 Fim do ciclo: ${summary}`);
      return { changesCount: totalChanges, summary };
    } catch (err: any) {
      const errMsg = `Erro no ciclo de sincronização: ${err.message}`;
      console.error('[Worker]', errMsg);
      this.lastResultSummary = errMsg;
      store.addLog({
        module: 'mm',
        trigger,
        summary: errMsg,
        changesCount: 0,
        status: 'error',
        details: err.stack
      });
      return { changesCount: 0, summary: errMsg };
    } finally {
      this.isRunning = false;
    }
  }
}

export const syncWorker = new SyncWorker();
