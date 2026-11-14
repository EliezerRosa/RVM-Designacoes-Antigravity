import { spawn } from 'node:child_process';

const CANDIDATE_PORTS = [5173, 5174, 5175];
const noOpen = process.argv.includes('--no-open');

async function findRunningConversaPort() {
  for (const port of CANDIDATE_PORTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 800);
      const res = await fetch(`http://localhost:${port}/conversa.html`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!res.ok) continue;
      const html = await res.text();
      if (!html.includes('RVM · Conversa') && !html.includes('src/features/conversa/main.tsx')) {
        continue;
      }

      // Require the Vite instance to have the local dev auth middleware active (GET returns 403 JSON)
      const authProbe = await fetch(`http://localhost:${port}/__conversa_dev_auth`);
      if (authProbe.status === 403) {
        return port;
      }
    } catch {
      // Port not serving conversa.html
    }
  }
  return null;
}

function openBrowser(url) {
  if (noOpen) return;
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', '""', url], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

const activePort = await findRunningConversaPort();

if (activePort) {
  const url = `http://localhost:${activePort}/conversa.html`;
  console.log(`[Conversa RVM] Servidor ativo detectado: ${url}`);
  openBrowser(url);
} else {
  const args = noOpen ? ['vite'] : ['vite', '--open', '/conversa.html'];
  const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
