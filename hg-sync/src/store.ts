import * as fs from 'fs';
import * as path from 'path';
import { config } from './config.js';
import { SyncLedgerEntry, SyncLogEntry } from './types.js';

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export interface AliasRecord {
  hg_id: number;
  canonicalName: string;
  notes?: string;
  byRole?: Record<string, { hg_id: number; canonicalName: string }>;
}

export interface ProcessedFileRecord {
  fileName: string;
  sha256: string;
  lastSyncedAt: string;
  unresolvedCount: number;
  syncedCount: number;
}

export class DataStore {
  private dataDir: string;

  constructor() {
    this.dataDir = config.dataDir;
    ensureDir(this.dataDir);
  }

  private getPath(fileName: string): string {
    return path.join(this.dataDir, fileName);
  }

  private readJson<T>(fileName: string, fallback: T): T {
    const p = this.getPath(fileName);
    if (!fs.existsSync(p)) return fallback;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {
      return fallback;
    }
  }

  private writeJson(fileName: string, data: any) {
    const p = this.getPath(fileName);
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
  }

  // --- ALIASES ---
  getAliases(): Record<string, AliasRecord> {
    const defaults = this.getDefaultAliases();
    const saved = this.readJson<Record<string, AliasRecord>>('aliases.json', {});
    return { ...defaults, ...saved };
  }

  saveAlias(rawName: string, record: AliasRecord, role?: string) {
    const aliases = this.getAliases();
    const key = rawName.trim().toUpperCase();
    if (role) {
      aliases[key] = aliases[key] || { hg_id: record.hg_id, canonicalName: record.canonicalName };
      aliases[key].byRole = aliases[key].byRole || {};
      aliases[key].byRole![role] = { hg_id: record.hg_id, canonicalName: record.canonicalName };
    } else {
      aliases[key] = record;
    }
    this.writeJson('aliases.json', aliases);
  }

  setAlias(rawName: string, canonicalName: string, hg_id: number, role?: string) {
    this.saveAlias(rawName, { hg_id, canonicalName }, role);
  }

  /**
   * Atualiza automaticamente o hg_id de apelidos cujo canonicalName bate com a lista
   * real de publicadores carregada do Hourglass ou RVM.
   */
  syncAliasesWithKnownUsers(users: Array<{ hg_id: number; name: string }>): number {
    if (!users || users.length === 0) return 0;
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const aliases = this.getAliases();
    let updated = 0;

    for (const [, rec] of Object.entries(aliases)) {
      const targetNorm = norm(rec.canonicalName);
      const match = users.find(u => {
        const uNorm = norm(u.name);
        return uNorm === targetNorm || uNorm.startsWith(targetNorm) || targetNorm.startsWith(uNorm);
      });
      if (match && match.hg_id > 0 && rec.hg_id !== match.hg_id) {
        rec.hg_id = match.hg_id;
        updated++;
      }
    }

    if (updated > 0) {
      this.writeJson('aliases.json', aliases);
    }
    return updated;
  }

  // --- ARQUIVOS DE DOWNLOADS PROCESSADOS (SHA-256) ---
  getProcessedFiles(): Record<string, ProcessedFileRecord> {
    return this.readJson<Record<string, ProcessedFileRecord>>('processed-files.json', {});
  }

  saveProcessedFile(record: ProcessedFileRecord) {
    const all = this.getProcessedFiles();
    all[record.fileName] = record;
    this.writeJson('processed-files.json', all);
  }

  // --- LEDGER ---
  getLedger(): SyncLedgerEntry[] {
    return this.readJson<SyncLedgerEntry[]>('ledger.json', []);
  }

  recordLedger(entries: Omit<SyncLedgerEntry, 'id' | 'syncedAt'>[]) {
    const ledger = this.getLedger();
    const now = new Date().toISOString();
    for (const e of entries) {
      const existingIdx = ledger.findIndex(l => l.module === e.module && l.date === e.date && l.slotKey === e.slotKey);
      const newEntry: SyncLedgerEntry = {
        ...e,
        id: `${e.module}-${e.date}-${e.slotKey}-${Date.now()}`,
        syncedAt: now
      };
      if (existingIdx >= 0) {
        ledger[existingIdx] = newEntry;
      } else {
        ledger.push(newEntry);
      }
    }
    this.writeJson('ledger.json', ledger);
  }

  // --- LOGS ---
  getLogs(limit = 100): SyncLogEntry[] {
    const logs = this.readJson<SyncLogEntry[]>('sync-log.json', []);
    return logs.slice(-limit).reverse();
  }

  addLog(entry: Omit<SyncLogEntry, 'id' | 'timestamp'>) {
    const logs = this.readJson<SyncLogEntry[]>('sync-log.json', []);
    const fullEntry: SyncLogEntry = {
      ...entry,
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString()
    };
    logs.push(fullEntry);
    if (logs.length > 500) logs.splice(0, logs.length - 500);
    this.writeJson('sync-log.json', logs);
  }

  // --- ENDPOINTS APRENDIDOS ---
  getEndpoints(): Record<string, { method: string; urlPattern: string; headersTemplate?: any; payloadTemplate?: any }> {
    return this.readJson('endpoints.json', {});
  }

  saveEndpoint(key: string, info: any) {
    const ep = this.getEndpoints();
    ep[key] = info;
    this.writeJson('endpoints.json', ep);
  }

  // Apelidos padrão conhecidos e pré-calibrados das escalas de Downloads
  private getDefaultAliases(): Record<string, AliasRecord> {
    return {
      'EDMILSON': {
        hg_id: 3296262,
        canonicalName: 'Edmilson Monteiro',
        byRole: {
          'wm_chairman': { hg_id: 3296262, canonicalName: 'Edmilson Monteiro' },
          'wm_reader': { hg_id: 3331200, canonicalName: 'Edmilson Pessanha' }
        }
      },
      'ELIEZER': { hg_id: 2491201, canonicalName: 'Eliezer Rosa' },
      'ELIÉZER': { hg_id: 2491201, canonicalName: 'Eliezer Rosa' },
      'ELIEZER ROSA': { hg_id: 2491201, canonicalName: 'Eliezer Rosa' },
      'VICTOR': { hg_id: 3331161, canonicalName: 'Victor Correa' },
      'ROGÉRIO': { hg_id: 2489454, canonicalName: 'Marcos Rogério Oliveira' },
      'MARCOS ROGERIO OLIVEIRA': { hg_id: 2489454, canonicalName: 'Marcos Rogério Oliveira' },
      'FELIPE': { hg_id: 3331174, canonicalName: 'Felipe de Oliveira' },
      'RENATO': { hg_id: 2491349, canonicalName: 'Renato Oliveira' },
      'ALLAN ROGER': { hg_id: 3331231, canonicalName: 'Allan Roger' },
      'EMERSON': { hg_id: 3296264, canonicalName: 'Emerson França' },
      'SAMUEL': { hg_id: 3331195, canonicalName: 'Samuel Almeida' },
      'DIEGO': { hg_id: 2491224, canonicalName: 'Diego Resmann' },
      'DANIEL FIGUEIREDO': { hg_id: 3331181, canonicalName: 'Daniel Figueiredo' },
      'DANIEL FIGUEI': { hg_id: 3331181, canonicalName: 'Daniel Figueiredo' },
      'DANIEL FIG': { hg_id: 3331181, canonicalName: 'Daniel Figueiredo' },
      'DOMINGOS': { hg_id: 3331221, canonicalName: 'Domingos Oliveira' },
      'GABRIEL CAMILO': { hg_id: 3331167, canonicalName: 'Gabriel Fouraux (Camilo)' },
      'GABRIEL CAMI': { hg_id: 3331167, canonicalName: 'Gabriel Fouraux (Camilo)' },
      'DANIEL': { hg_id: 3331222, canonicalName: 'Daniel Carneiro' },
      'DANIEL CARNE': { hg_id: 3331222, canonicalName: 'Daniel Carneiro' },
      'GABRIEL OLIVEIRA': { hg_id: 3331237, canonicalName: 'Gabriel Henrique Oliveira' },
      'GABRIEL OLI': { hg_id: 3331237, canonicalName: 'Gabriel Henrique Oliveira' },
      'EDMARDO': { hg_id: 2491469, canonicalName: 'Edmardo Queiroz' },
      'JAIRO': { hg_id: 3331160, canonicalName: 'Jairo Santos' },
      'JOSE LUIZ FOURAX': { hg_id: 3331234, canonicalName: 'José Luiz Fouraux' },
      'JOSÉ LUIZ': { hg_id: 3331234, canonicalName: 'José Luiz Fouraux' },
      'LUAN S': { hg_id: 3331139, canonicalName: 'Luan Sabadim' },
      'LOPES': { hg_id: 3331236, canonicalName: 'Alexsandro Lopes' },
      'ANDRÉ LUIZ': { hg_id: 3331162, canonicalName: 'André Luiz' },
      'ANDRÉ LUI': { hg_id: 3331162, canonicalName: 'André Luiz' },
      'JÚNIOR FOURAX': { hg_id: 3331203, canonicalName: 'Júnior Fouraux' },
      'JÚNIOR FOUR': { hg_id: 3331203, canonicalName: 'Júnior Fouraux' },
      'ERICK SEGAL': { hg_id: 3331192, canonicalName: 'Erick Segall' },
      'ERICK': { hg_id: 3331192, canonicalName: 'Erick Segall' },
      'ISRAEL': { hg_id: 2491316, canonicalName: 'Israel Vieira' },
      'VINICIUS': {
        hg_id: 3331233,
        canonicalName: 'Vinicius Pessanha',
        byRole: {
          'wm_chairman': { hg_id: 2491442, canonicalName: 'Marcos Vinícius' },
          'wm_reader': { hg_id: 3331233, canonicalName: 'Vinicius Pessanha' }
        }
      },
      'CARLOS ELIAS': { hg_id: 3331158, canonicalName: 'Carlos Elias' },
      'CLAUDIO SILVA': { hg_id: 3331159, canonicalName: 'Claudio Silva' },
      'LUIZ ALEXAND': { hg_id: 3331204, canonicalName: 'Luiz Alexandrino' },
      'LUIZ ALEXANDR': { hg_id: 3331204, canonicalName: 'Luiz Alexandrino' },
      'LUIZ ALEXANDRI': { hg_id: 3331204, canonicalName: 'Luiz Alexandrino' },
      'LUIZ ALEXANDRINO': { hg_id: 3331204, canonicalName: 'Luiz Alexandrino' },
      'LUIZ ALEXANDRE': { hg_id: 3331196, canonicalName: 'Luiz Alexandre' }
    };
  }
}

export const store = new DataStore();
