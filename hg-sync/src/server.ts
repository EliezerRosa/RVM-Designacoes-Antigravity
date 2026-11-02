import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { store } from './store.js';
import { syncWorker } from './worker.js';
import { hgSession } from './hg/session.js';
import { hgApi } from './hg/api.js';
import { hgBrowser } from './hg/browser.js';
import { rvmReader } from './rvm/reader.js';
import { scanDownloadsFolder } from './imports/scan.js';
import { mapWeekPartsToHgSlots } from './midweek/mapper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UI_DIR = path.resolve(__dirname, '../ui');

// Helper para ler body JSON
function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Helper para responder JSON
function sendJson(res: http.ServerResponse, statusCode: number, data: any) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// Helper para servir arquivos estáticos da UI
function serveStaticFile(res: http.ServerResponse, filePath: string, contentType: string) {
  if (fs.existsSync(filePath)) {
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  const reqUrl = req.url || '/';
  const method = req.method || 'GET';

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // --- Rotas de API ---
  if (reqUrl.startsWith('/api/')) {
    try {
      // 1. Status da Sessão Hourglass
      if (reqUrl === '/api/status/session' && method === 'GET') {
        const authenticated = await hgSession.isAuthenticated();
        const user = authenticated ? hgSession.getCurrentUser() : null;
        return sendJson(res, 200, { authenticated, user });
      }

      if (reqUrl === '/api/session/login' && method === 'POST') {
        hgSession.openLoginWindow(); // Executa em background
        return sendJson(res, 200, { ok: true, message: 'Janela de login aberta no navegador.' });
      }

      // 2. Status do Worker Contínuo
      if (reqUrl === '/api/status/worker' && method === 'GET') {
        return sendJson(res, 200, syncWorker.getStatus());
      }

      if (reqUrl === '/api/worker/toggle' && method === 'POST') {
        const body = await readJsonBody(req);
        config.autoSyncEnabled = Boolean(body.enabled);
        if (config.autoSyncEnabled) {
          syncWorker.start();
        } else {
          syncWorker.stop();
        }
        return sendJson(res, 200, syncWorker.getStatus());
      }

      // 3. Scanner de Downloads
      if (reqUrl === '/api/downloads/scan' && method === 'GET') {
        const docs = await scanDownloadsFolder();
        return sendJson(res, 200, docs);
      }

      if (reqUrl === '/api/sync/document' && method === 'POST') {
        const body = await readJsonBody(req);
        if (!body.doc) {
          return sendJson(res, 400, { success: false, error: 'Documento ausente no payload.' });
        }
        const result = await hgBrowser.syncDocument(body.doc);
        return sendJson(res, result.success ? 200 : 500, result);
      }

      // 4. Meio de Semana RVM
      if (reqUrl === '/api/midweek/weeks' && method === 'GET') {
        const now = new Date();
        const day = now.getDay();
        const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
        const currentMonday = new Date(now.setDate(diffToMonday));
        const currentWeekId = currentMonday.toISOString().split('T')[0];

        const publishedWeeks = await rvmReader.getPublishedWeeks();
        const allParts = await rvmReader.getMidweekParts(currentWeekId);
        const publishers = await rvmReader.getPublishers();
        const pubMap = new Map(publishers.map(p => [p.id, p]));

        const partsByWeek: Record<string, any[]> = {};
        for (const p of allParts) {
          if (!partsByWeek[p.week_id]) partsByWeek[p.week_id] = [];
          partsByWeek[p.week_id].push(p);
        }

        const weeks = Object.keys(partsByWeek).sort().map(wId => {
          const isPublished = Boolean(publishedWeeks[wId]);
          const schedule = mapWeekPartsToHgSlots(wId, partsByWeek[wId] || [], pubMap, true);
          return {
            weekId: wId,
            weekDisplay: formatWeekDisplay(wId),
            isPublished,
            slots: schedule.slots
          };
        });

        return sendJson(res, 200, weeks);
      }

      if (reqUrl === '/api/midweek/sync' && method === 'POST') {
        const result = await syncWorker.runCheck('manual_ui');
        return sendJson(res, 200, { success: true, ...result });
      }

      // 5. Apelidos (Aliases)
      if (reqUrl === '/api/aliases' && method === 'GET') {
        return sendJson(res, 200, store.getAliases());
      }

      if (reqUrl === '/api/aliases/save' && method === 'POST') {
        const body = await readJsonBody(req);
        const { rawName, canonicalName, hg_id, role } = body;
        if (!rawName || !canonicalName || !hg_id) {
          return sendJson(res, 400, { error: 'Campos rawName, canonicalName e hg_id são obrigatórios.' });
        }
        store.setAlias(rawName, canonicalName, hg_id, role);
        return sendJson(res, 200, { ok: true });
      }

      // 6. Logs de Sincronização
      if (reqUrl === '/api/logs' && method === 'GET') {
        return sendJson(res, 200, store.getLogs());
      }

      // 7. Configurações
      if (reqUrl === '/api/settings' && method === 'GET') {
        return sendJson(res, 200, {
          port: config.port,
          pollIntervalMinutes: config.pollIntervalMinutes,
          downloadsDir: config.downloadsDir,
          lgroup: config.lgroup,
          autoSyncEnabled: config.autoSyncEnabled
        });
      }

      return sendJson(res, 404, { error: 'Endpoint não encontrado' });
    } catch (err: any) {
      console.error('[Server] Erro na requisição API:', err);
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- Servir Arquivos Estáticos da UI ---
  let pathname = reqUrl.split('?')[0];
  if (pathname === '/') pathname = '/index.html';

  const ext = path.extname(pathname);
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
  };

  const contentType = mimeTypes[ext] || 'text/plain';
  const filePath = path.join(UI_DIR, pathname);
  serveStaticFile(res, filePath, contentType);
});

function formatWeekDisplay(weekId: string): string {
  try {
    const parts = weekId.split('-');
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    const startDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    return `${fmt(startDate)} a ${fmt(endDate)}`;
  } catch {
    return weekId;
  }
}

// Inicia o servidor HTTP e o Worker Contínuo
server.listen(config.port, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 HG-Sync Server iniciado com sucesso!`);
  console.log(`🌐 Painel de Controle: http://localhost:${config.port}`);
  console.log(`📂 Pasta de Downloads monitorada: ${config.downloadsDir}`);
  console.log(`======================================================\n`);

  if (config.autoSyncEnabled) {
    syncWorker.start();
  }
});
