import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { spawn, execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { config } from '../config.js';

const LOGIN_DEBUG_PORT = 9333;
const HG_LOGIN_URL = 'https://app.hourglass-app.com/v2/page/app/scheduling/mm';

export class HgSessionManager {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private currentHeadless: boolean | null = null;
  private sessionDir: string;
  private cookiesFile: string = path.join(config.dataDir, 'hg-cookies.json');
  private xsrfToken: string = '';
  private currentUser: any = null;
  private isLoggingIn: boolean = false;
  
  // Cache de autenticação para evitar recarregar a página desnecessariamente
  private authCache: { authenticated: boolean; timestamp: number } | null = null;
  private readonly AUTH_CACHE_TTL_MS = 30000; // 30 segundos

  // Mutex para evitar concorrência no lançamento/fechamento do Chrome
  private launchLock: Promise<any> = Promise.resolve();

  constructor() {
    this.sessionDir = config.sessionDir;
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.launchLock.then(async () => {
      try {
        return await fn();
      } catch (err) {
        console.warn('[HgSession] Erro em operação exclusiva:', err);
        throw err;
      }
    });
    this.launchLock = next.catch(() => {});
    return next;
  }

  async getContext(headless = true): Promise<{ context: BrowserContext; page: Page }> {
    if (this.context && this.page && !this.page.isClosed()) {
      if (this.currentHeadless === headless) {
        return { context: this.context, page: this.page };
      }
      // Se o modo mudou (ex: de headless para visível ou vice-versa), fecha antes de recriar
      console.log(`[HgSession] Alternando modo do Chrome (headless: ${this.currentHeadless} -> ${headless})...`);
      await this.closeContextInternal();
    }

    // Se já havia um contexto, fecha antes de criar outro
    await this.closeContextInternal();
    this.cleanupSingletonLock();

    try {
      this.context = await chromium.launchPersistentContext(this.sessionDir, {
        channel: 'chrome',
        headless,
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-first-run',
          '--no-default-browser-check',
          '--start-maximized',
          '--window-position=100,100'
        ],
        viewport: null
      });

      this.currentHeadless = headless;

      // Reaplica cookies salvos no ultimo login (cobre cookies de sessao que o perfil nao persiste)
      try {
        if (fs.existsSync(this.cookiesFile)) {
          const saved = JSON.parse(fs.readFileSync(this.cookiesFile, 'utf-8'));
          if (Array.isArray(saved.cookies) && saved.cookies.length) {
            await this.context.addCookies(saved.cookies);
          }
        }
      } catch (e: any) {
        console.warn('[HgSession] Falha ao reaplicar cookies salvos:', e.message);
      }
      this.page = this.context.pages().length > 0 ? this.context.pages()[0] : await this.context.newPage();

      this.page.on('request', req => {
        const token = req.headers()['x-hourglass-xsrf-token'];
        if (token) this.xsrfToken = token;
      });

      return { context: this.context, page: this.page };
    } catch (err: any) {
      console.error('[HgSession] Falha ao iniciar contexto do Chrome:', err.message);
      throw err;
    }
  }

  private cleanupSingletonLock() {
    try {
      const lockFile = path.join(this.sessionDir, 'SingletonLock');
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
      }
    } catch {}
  }

  private async closeContextInternal() {
    if (this.context) {
      try {
        await this.context.close();
      } catch {}
      this.context = null;
      this.page = null;
      this.currentHeadless = null;
      await new Promise(r => setTimeout(r, 600));
    }
  }

  async isAuthenticated(): Promise<boolean> {
    // Se a janela interativa de login estiver aberta pelo usuário, não bloqueia
    if (this.isLoggingIn) {
      return this.authCache?.authenticated || false;
    }

    const now = Date.now();
    if (this.authCache && (now - this.authCache.timestamp < this.AUTH_CACHE_TTL_MS)) {
      return this.authCache.authenticated;
    }

    return this.runExclusive(async () => {
      try {
        const { page } = await this.getContext(true);
        
        let currentUrl = page.url();
        if (!currentUrl.includes('/page/app')) {
          await page.goto('https://app.hourglass-app.com/v2/page/app', { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(1500);
        }

        const startup = await page.evaluate(async () => {
          try {
            const res = await fetch('/api/v0.2/fsreport/startup');
            if (!res.ok) return null;
            return await res.json();
          } catch {
            return null;
          }
        });

        if (startup?.whoami?.user) {
          this.currentUser = startup.whoami.user;
          this.authCache = { authenticated: true, timestamp: Date.now() };
          return true;
        }

        this.authCache = { authenticated: false, timestamp: Date.now() };
        return false;
      } catch (e: any) {
        console.warn('[HgSession] Falha ao verificar autenticação:', e.message);
        this.authCache = { authenticated: false, timestamp: Date.now() };
        return false;
      }
    });
  }

  getCurrentUser() {
    return this.currentUser;
  }

  invalidateCache() {
    this.authCache = null;
  }

  /**
   * Login interativo: abre o Google Chrome NATIVO (sem flags de automação, para o Google
   * aceitar o login/passkey) usando o mesmo perfil da sessão, com porta de depuração local.
   * O servidor só observa (via CDP) até detectar o login, salva os cookies e fecha a janela.
   */
  async openLoginWindow(): Promise<boolean> {
    if (this.isLoggingIn) {
      console.log('[HgSession] Processo de login já está em andamento...');
      return false;
    }
    this.invalidateCache();
    this.isLoggingIn = true;

    try {
      console.log('[HgSession] 🌐 Abrindo Google Chrome (nativo) para login no Hourglass...');

      await this.runExclusive(async () => {
        await this.closeContextInternal();
        await this.killProfileChrome();
        this.cleanupSingletonLock();
      });

      const chromePath = HgSessionManager.findChromePath();
      const child = spawn(chromePath, [
        `--user-data-dir=${this.sessionDir}`,
        `--remote-debugging-port=${LOGIN_DEBUG_PORT}`,
        '--remote-allow-origins=*',
        '--no-first-run',
        '--no-default-browser-check',
        '--start-maximized',
        HG_LOGIN_URL
      ], { detached: true, stdio: 'ignore' });
      child.unref();

      // Dá tempo do Chrome subir e abrir a porta de depuração
      await new Promise(r => setTimeout(r, 3000));

      let browser: Browser | null = null;
      const deadline = Date.now() + 5 * 60 * 1000;

      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2000));

        try {
          if (!browser) {
            browser = await chromium.connectOverCDP(`http://127.0.0.1:${LOGIN_DEBUG_PORT}`, { timeout: 5000 });
          }
          if (!browser.isConnected()) { browser = null; continue; }

          for (const ctx of browser.contexts()) {
            for (const p of ctx.pages()) {
              if (!p.url().startsWith('https://app.hourglass-app.com')) continue;
              const user = await p.evaluate(async () => {
                try {
                  const res = await fetch('/api/v0.2/fsreport/startup');
                  if (!res.ok) return null;
                  const d = await res.json();
                  return d?.whoami?.user || null;
                } catch {
                  return null;
                }
              }).catch(() => null);

              if (user && user.id) {
                console.log(`[HgSession] ✅ Login confirmado no Hourglass como: ${user.firstname || ''} ${user.lastname || ''}`);
                this.currentUser = user;
                this.authCache = { authenticated: true, timestamp: Date.now() };

                // Salva cookies para reutilizar no modo automático (independente de expiração de sessão)
                try {
                  await ctx.storageState({ path: this.cookiesFile });
                } catch (e: any) {
                  console.warn('[HgSession] Não foi possível salvar cookies:', e.message);
                }

                // Fecha o Chrome nativo para liberar o perfil
                try {
                  const cdp = await browser.newBrowserCDPSession();
                  await cdp.send('Browser.close');
                } catch {}
                await new Promise(r => setTimeout(r, 2000));
                await this.killProfileChrome();
                this.cleanupSingletonLock();

                this.isLoggingIn = false;
                return true;
              }
            }
          }
        } catch {
          browser = null; // Chrome ainda subindo ou usuário fechou a janela; tenta de novo
        }
      }

      console.warn('[HgSession] Tempo limite de login esgotado.');
      await this.killProfileChrome();
      this.cleanupSingletonLock();
      this.isLoggingIn = false;
      return false;
    } catch (err: any) {
      console.error('[HgSession] Erro ao abrir janela de login:', err.message);
      this.isLoggingIn = false;
      return false;
    }
  }

  private static findChromePath(): string {
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
    ];
    return candidates.find(p => fs.existsSync(p)) || candidates[0];
  }

  /** Encerra qualquer Chrome (inclusive órfão/headless) que esteja usando o perfil da sessão. */
  private killProfileChrome(): Promise<void> {
    return new Promise(resolve => {
      const script = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like ('*' + $env:HG_SESSION_DIR + '*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
      execFile('powershell', ['-NoProfile', '-Command', script], {
        env: { ...process.env, HG_SESSION_DIR: this.sessionDir.replace(/\//g, '\\') },
        windowsHide: true
      }, () => setTimeout(resolve, 1000));
    });
  }

  async fetchInPage<T = any>(url: string, options: { method?: string; body?: any; headers?: Record<string, string> } = {}): Promise<{ status: number; data: T | null; error?: string }> {
    return this.runExclusive(async () => {
      const { page } = await this.getContext(config.headlessBrowser);

      return page.evaluate(async (params) => {
        try {
          const h: Record<string, string> = {
            'accept': 'application/json',
            ...(params.options.headers || {})
          };
          if (params.options.body) {
            h['Content-Type'] = 'application/json';
          }

          const match = document.cookie.match(/(?:^|;\s*)(?:XSRF-TOKEN|x-hourglass-xsrf-token|_xsrf)=([^;]+)/i);
          if (match && !h['x-hourglass-xsrf-token']) {
            h['x-hourglass-xsrf-token'] = decodeURIComponent(match[1]);
          }

          const res = await fetch(params.url, {
            method: params.options.method || 'GET',
            headers: h,
            body: params.options.body ? JSON.stringify(params.options.body) : undefined
          });

          const status = res.status;
          let data = null;
          try {
            data = await res.json();
          } catch {
            data = null;
          }

          return { status, data };
        } catch (err: any) {
          return { status: 500, data: null, error: err.message };
        }
      }, { url, options });
    });
  }

  async close() {
    await this.closeContextInternal();
  }
}

export const hgSession = new HgSessionManager();
