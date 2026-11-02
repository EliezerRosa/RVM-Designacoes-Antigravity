import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { DocumentTypeConfig } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HGSYNC_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(HGSYNC_ROOT, '..');

// Carrega .env com prioridade: hg-sync/.env -> rvm-designacoes-unified/.env.local -> rvm-designacoes-unified/.env
const possibleEnvs = [
  path.join(HGSYNC_ROOT, '.env'),
  path.join(REPO_ROOT, '.env.local'),
  path.join(REPO_ROOT, '.env')
];

for (const envPath of possibleEnvs) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

// Carrega settings.json
const settingsPath = path.join(HGSYNC_ROOT, 'config/settings.json');
let fileSettings: any = {};
if (fs.existsSync(settingsPath)) {
  try {
    fileSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch (e) {
    console.warn('[Config] Erro ao ler config/settings.json, usando defaults:', e);
  }
}

// Carrega columns.json
const columnsPath = path.join(HGSYNC_ROOT, 'config/columns.json');
let documentTypes: DocumentTypeConfig[] = [];
if (fs.existsSync(columnsPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(columnsPath, 'utf-8'));
    documentTypes = raw.documentTypes || [];
  } catch (e) {
    console.warn('[Config] Erro ao ler config/columns.json:', e);
  }
}

export const config = {
  port: parseInt(process.env.PORT || String(fileSettings.port || 4610)),
  downloadsDir: process.env.DOWNLOADS_DIR || fileSettings.downloadsDir || path.resolve(process.env.USERPROFILE || '', 'Downloads'),
  lgroup: process.env.LGROUP || fileSettings.lgroup || '39934',
  pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL_MINUTES || String(fileSettings.pollIntervalMinutes || 5)),
  autoSyncEnabled: process.env.AUTO_SYNC_ENABLED !== undefined 
    ? process.env.AUTO_SYNC_ENABLED === 'true' 
    : (fileSettings.autoSyncEnabled ?? true),
  headlessBrowser: fileSettings.headlessBrowser ?? true,
  
  // Supabase RVM (somente leitura)
  supabaseUrl: process.env.VITE_SUPABASE_URL || '',
  supabaseKey: process.env.VITE_SUPABASE_ANON_KEY || '',

  // Pastas de dados
  dataDir: path.join(HGSYNC_ROOT, 'data'),
  sessionDir: path.join(HGSYNC_ROOT, 'data/hourglass_session'),
  
  // Configs dinâmicas
  documentTypes,
  
  saveSettings(newSettings: Record<string, any>) {
    Object.assign(fileSettings, newSettings);
    fs.writeFileSync(settingsPath, JSON.stringify(fileSettings, null, 2), 'utf-8');
  }
};
