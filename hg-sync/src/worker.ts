import { config } from './config.js';
import { rvmReader } from './rvm/reader.js';
import { hgApi } from './hg/api.js';
import { hgSession } from './hg/session.js';
import { mapWeekPartsToHgSlots } from './midweek/mapper.js';
import { computeMidweekDiff } from './midweek/reconcile.js';
import { store } from './store.js';
import { nameResolver } from './names/resolver.js';

export class SyncWorker {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastRunTime: string | null = null;
  private lastResultSummary: string = 'Aguardando primeira execução';

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
    if (this.timer) clearInterval(this.timer);
    console.log(`[Worker] Iniciando vigia de sincronização contínua (intervalo: ${config.pollIntervalMinutes} min)...`);
    
    // Executa a primeira checagem após 5 segundos
    setTimeout(() => this.runCheck('auto_worker'), 5000);

    // Agenda execuções recorrentes
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
    console.log('[Worker] Vigia pausado.');
  }

  async runCheck(trigger: 'manual_ui' | 'auto_worker' = 'manual_ui'): Promise<{ changesCount: number; summary: string }> {
    if (this.isRunning) {
      return { changesCount: 0, summary: 'Execução já em andamento' };
    }

    this.isRunning = true;
    this.lastRunTime = new Date().toISOString();
    console.log(`\n[Worker] 🔄 Checando sincronização do Meio de Semana (${trigger})...`);

    try {
      // 1. Verifica conexão com RVM e Hourglass
      if (!rvmReader.isAvailable()) {
        const msg = 'Credenciais do Supabase RVM não configuradas';
        this.lastResultSummary = msg;
        return { changesCount: 0, summary: msg };
      }

      const isAuthed = await hgSession.isAuthenticated();
      if (!isAuthed) {
        const msg = 'Hourglass não autenticado. Faça login pelo painel.';
        this.lastResultSummary = msg;
        console.warn(`[Worker] ⚠️ ${msg}`);
        return { changesCount: 0, summary: msg };
      }

      // 2. Carrega publicadores do HG para alimentar o resolvedor de nomes
      const hgUsers = await hgApi.getCongregationUsers();
      nameResolver.setKnownPublishers(hgUsers.map(u => ({ hg_id: u.id, name: u.displayName })));
      const knownPublishersMap = new Map<number, string>(hgUsers.map(u => [u.id, u.displayName]));

      // 3. Determina a semana atual (segunda-feira da semana em curso)
      const now = new Date();
      const day = now.getDay();
      const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
      const currentMonday = new Date(now.setDate(diffToMonday));
      const currentWeekId = currentMonday.toISOString().split('T')[0];

      // 4. Busca semanas publicadas e partes do RVM
      const publishedWeeks = await rvmReader.getPublishedWeeks();
      const rvmPublishers = await rvmReader.getPublishers();
      const pubMap = new Map(rvmPublishers.map(p => [p.id, p]));

      const allParts = await rvmReader.getMidweekParts(currentWeekId);
      const partsByWeek: Record<string, any[]> = {};
      for (const p of allParts) {
        if (!partsByWeek[p.week_id]) partsByWeek[p.week_id] = [];
        partsByWeek[p.week_id].push(p);
      }

      // Filtra apenas semanas publicadas
      const targetWeeks = Object.keys(partsByWeek).filter(w => Boolean(publishedWeeks[w]));

      if (targetWeeks.length === 0) {
        const msg = `Nenhuma semana futura com status 'Publicada' no RVM a partir de ${currentWeekId}.`;
        this.lastResultSummary = msg;
        console.log(`[Worker] ${msg}`);
        return { changesCount: 0, summary: msg };
      }

      // 5. Busca a programação atual no Hourglass para essas semanas
      const startRange = targetWeeks[0];
      const endRange = targetWeeks[targetWeeks.length - 1];
      const hgSchedules = await hgApi.getMidweekSchedule(startRange, endRange);
      const hgMap = new Map(hgSchedules.map(s => [s.weekId, s]));

      // 6. Calcula diffs e aplica no Hourglass
      let totalChanges = 0;
      const ledgerEntries: any[] = [];

      for (const weekId of targetWeeks) {
        const weekParts = partsByWeek[weekId] || [];
        const rvmSchedule = mapWeekPartsToHgSlots(weekId, weekParts, pubMap, true);
        const hgCurrent = hgMap.get(weekId) || null;

        const diffs = computeMidweekDiff(rvmSchedule, hgCurrent, knownPublishersMap);
        const pendingDiffs = diffs.filter(d => d.action !== 'noop');

        for (const diff of pendingDiffs) {
          const targetHgId = diff.action === 'clear' ? 0 : (diff.newAssignee?.hgId || 0);

          let success = false;
          // Core: chairman, openprayer, closeprayer, cbs_reader
          if (['chairman', 'openprayer', 'closeprayer', 'cbs_reader'].includes(diff.slotKey)) {
            success = await hgApi.saveMidweekCore(weekId, diff.slotKey, targetHgId);
          }

          if (success) {
            totalChanges++;
            ledgerEntries.push({
              module: 'mm',
              date: weekId,
              slotKey: diff.slotKey,
              assignedHgId: targetHgId,
              assignedName: diff.newAssignee?.name || 'Vazio',
              source: 'rvm'
            });
            console.log(`  ✅ [${diff.action.toUpperCase()}] ${weekId} -> ${diff.slotLabel}: ${diff.newAssignee?.name || 'Esvaziado'}`);
          }
        }
      }

      if (ledgerEntries.length > 0) {
        store.recordLedger(ledgerEntries);
      }

      const summary = totalChanges > 0
        ? `${totalChanges} designações sincronizadas com sucesso no Hourglass.`
        : 'Tudo atualizado. Nenhuma diferença entre RVM e Hourglass.';

      this.lastResultSummary = summary;

      store.addLog({
        module: 'mm',
        trigger,
        summary,
        changesCount: totalChanges
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
