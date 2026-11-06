import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { spawn, execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { config } from '../config.js';

const LOGIN_DEBUG_PORT = 9333;
const HG_LOGIN_URL = 'https://app.hourglass-app.com/v2/page/app/scheduling/mm';
const DEFAULT_AUTO_LOGIN_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 horas

export interface HgUserInfo {
  id: number;
  firstname?: string;
  lastname?: string;
  [key: string]: unknown;
}

export interface HgLoginLaunchInfo {
  ok: boolean;
  alreadyRunning: boolean;
  pid: number | null;
  chromePath: string;
  debugPort: number;
  sessionDir: string;
  message: string;
}

export interface HgSessionStatus {
  authenticated: boolean;
  user: HgUserInfo | null;
  loggingIn: boolean;
  loginPid: number | null;
  chromePath: string;
  cdpReachable: boolean;
  lastError: string | null;
  sessionDir: string;
}

export class HgSessionManager {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private currentHeadless: boolean | null = null;
  private sessionDir: string;
  private cookiesFile: string = path.join(config.dataDir, 'hg-cookies.json');
  private xsrfToken: string = '';
  private currentUser: HgUserInfo | null = null;
  private isLoggingIn: boolean = false;
  private loginPid: number | null = null;
  private lastChromePath: string | null = null;
  private cdpReachable: boolean = false;
  private lastLoginError: string | null = null;
  private cancelLoginRequested: boolean = false;
  private loginPromise: Promise<boolean> | null = null;
  private lastAutoLoginAttemptAt: number = 0;

  // Cache de autenticação para evitar recarregar a página ou subir Chrome headless sem necessidade
  private authCache: { authenticated: boolean; timestamp: number } | null = null;
  private readonly AUTH_CACHE_TTL_MS = 300000; // 5 minutos

  // Mutex para evitar concorrência no lançamento/fechamento do Chrome
  private launchLock: Promise<unknown> = Promise.resolve();

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

  hasSavedSession(): boolean {
    return Boolean(this.currentUser) || fs.existsSync(this.cookiesFile);
  }

  isLoginInProgress(): boolean {
    return this.isLoggingIn;
  }

  resetAutoLoginCooldown(): void {
    this.lastAutoLoginAttemptAt = 0;
  }

  async getContext(headless = true): Promise<{ context: BrowserContext; page: Page }> {
    if (this.context && this.page && !this.page.isClosed()) {
      if (this.currentHeadless === headless) {
        return { context: this.context, page: this.page };
      }
      console.log(`[HgSession] Alternando modo do Chrome (headless: ${this.currentHeadless} -> ${headless})...`);
      await this.closeContextInternal();
    }

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

      try {
        if (fs.existsSync(this.cookiesFile)) {
          const saved = JSON.parse(fs.readFileSync(this.cookiesFile, 'utf-8'));
          if (Array.isArray(saved.cookies) && saved.cookies.length) {
            await this.context.addCookies(saved.cookies);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[HgSession] Falha ao reaplicar cookies salvos:', msg);
      }
      this.page = this.context.pages().length > 0 ? this.context.pages()[0] : await this.context.newPage();

      this.page.on('request', req => {
        const token = req.headers()['x-hourglass-xsrf-token'];
        if (token) this.xsrfToken = token;
      });

      return { context: this.context, page: this.page };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[HgSession] Falha ao iniciar contexto do Chrome:', msg);
      throw err;
    }
  }

  private cleanupSingletonLock() {
    try {
      const lockFile = path.join(this.sessionDir, 'SingletonLock');
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
      }
    } catch { /* ignore */ }
  }

  private async closeContextInternal() {
    if (this.context) {
      try {
        await this.context.close();
      } catch { /* ignore */ }
      this.context = null;
      this.page = null;
      this.currentHeadless = null;
      await new Promise(r => setTimeout(r, 600));
    }
  }

  async isAuthenticated(forceLaunch = false): Promise<boolean> {
    if (this.isLoggingIn) {
      return this.authCache?.authenticated || false;
    }

    // Não sobe Chrome headless se nunca houve sessão salva e não foi forçado
    if (!forceLaunch && !this.hasSavedSession()) {
      return false;
    }

    const now = Date.now();
    if (this.authCache) {
      if (this.authCache.authenticated && (now - this.authCache.timestamp < this.AUTH_CACHE_TTL_MS)) {
        return true;
      }
      if (!this.authCache.authenticated && !forceLaunch) {
        return false;
      }
    }

    return this.runExclusive(async () => {
      try {
        const { page } = await this.getContext(true);

        const currentUrl = page.url();
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
        }) as { whoami?: { user?: HgUserInfo } } | null;

        if (startup?.whoami?.user) {
          this.currentUser = startup.whoami.user;
          this.authCache = { authenticated: true, timestamp: Date.now() };
          return true;
        }

        this.authCache = { authenticated: false, timestamp: Date.now() };
        return false;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[HgSession] Falha ao verificar autenticação:', msg);
        this.authCache = { authenticated: false, timestamp: Date.now() };
        return false;
      }
    });
  }

  /**
   * Garante sessão autenticada para o worker automático:
   * 1. Usa cache ou valida cookies salvos em modo headless.
   * 2. Se não estiver autenticado e houver pendências para sincronizar, abre automaticamente
   *    1 janela do Chrome nativo (com cooldown de 6h entre aberturas automáticas), aguarda o
   *    usuário autenticar, salva cookies, fecha a janela e retorna true para o sync prosseguir.
   */
  async ensureAuthenticatedForAutoSync(cooldownMs = DEFAULT_AUTO_LOGIN_COOLDOWN_MS): Promise<boolean> {
    if (await this.isAuthenticated(false)) {
      return true;
    }

    if (this.hasSavedSession()) {
      const validFromCookies = await this.isAuthenticated(true);
      if (validFromCookies) return true;
    }

    if (this.isLoggingIn && this.loginPromise) {
      console.log('[HgSession] Aguardando login interativo já em andamento...');
      return await this.loginPromise;
    }

    const now = Date.now();
    if (this.lastAutoLoginAttemptAt > 0 && (now - this.lastAutoLoginAttemptAt < cooldownMs)) {
      const remainingMin = Math.ceil((cooldownMs - (now - this.lastAutoLoginAttemptAt)) / 60000);
      console.log(`[HgSession] Auto-login em cooldown (próxima tentativa automática em ${remainingMin} min).`);
      return false;
    }

    this.lastAutoLoginAttemptAt = now;
    console.log('[HgSession] 🔐 Sessão Hourglass necessária para sincronização automática. Abrindo Chrome nativo...');
    await this.startLoginWindow();
    if (this.loginPromise) {
      return await this.loginPromise;
    }
    return false;
  }

  async getSessionStatus(forceLaunch = false): Promise<HgSessionStatus> {
    const authenticated = await this.isAuthenticated(forceLaunch);
    return {
      authenticated,
      user: authenticated ? this.currentUser : null,
      loggingIn: this.isLoggingIn,
      loginPid: this.loginPid,
      chromePath: this.lastChromePath || HgSessionManager.findChromePath(),
      cdpReachable: this.cdpReachable,
      lastError: this.lastLoginError,
      sessionDir: this.sessionDir
    };
  }

  getCurrentUser(): HgUserInfo | null {
    return this.currentUser;
  }

  invalidateCache() {
    this.authCache = null;
  }

  /**
   * Inicia o Google Chrome NATIVO com porta de depuração local e retorna imediatamente
   * os dados diagnósticos (PID, caminho do executável, porta CDP, perfil), monitorando o login em background.
   */
  async startLoginWindow(): Promise<HgLoginLaunchInfo> {
    const chromePath = HgSessionManager.findChromePath();
    this.lastChromePath = chromePath;

    if (this.isLoggingIn) {
      console.log(`[HgSession] Login já em andamento (PID: ${this.loginPid ?? 'desconhecido'}).`);
      return {
        ok: true,
        alreadyRunning: true,
        pid: this.loginPid,
        chromePath,
        debugPort: LOGIN_DEBUG_PORT,
        sessionDir: this.sessionDir,
        message: 'Processo de login já está em andamento.'
      };
    }

    this.invalidateCache();
    this.isLoggingIn = true;
    this.cancelLoginRequested = false;
    this.cdpReachable = false;
    this.lastLoginError = null;

    console.log('[HgSession] 🧹 Limpando instâncias anteriores do perfil antes de abrir o Chrome...');
    await this.runExclusive(async () => {
      await this.closeContextInternal();
      await this.killProfileChrome();
      this.cleanupSingletonLock();
    });

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

    this.loginPid = child.pid ?? null;
    console.log(`[HgSession] 🌐 Chrome nativo iniciado | PID=${this.loginPid} | Executável="${chromePath}" | CDP=127.0.0.1:${LOGIN_DEBUG_PORT} | Perfil="${this.sessionDir}"`);

    this.loginPromise = this.monitorLoginLoop().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[HgSession] Erro no monitoramento de login:', msg);
      this.lastLoginError = msg;
      this.isLoggingIn = false;
      return false;
    }).finally(() => {
      this.loginPromise = null;
    });

    return {
      ok: true,
      alreadyRunning: false,
      pid: this.loginPid,
      chromePath,
      debugPort: LOGIN_DEBUG_PORT,
      sessionDir: this.sessionDir,
      message: 'Janela de login aberta no navegador.'
    };
  }

  async openLoginWindow(): Promise<boolean> {
    await this.startLoginWindow();
    if (this.loginPromise) {
      return await this.loginPromise;
    }
    return false;
  }

  async cancelLogin(): Promise<{ ok: boolean; message: string }> {
    console.log('[HgSession] 🛑 Solicitação de cancelamento do login recebida.');
    this.cancelLoginRequested = true;
    this.isLoggingIn = false;
    this.cdpReachable = false;
    this.loginPid = null;
    this.lastLoginError = 'Login cancelado pelo usuário.';
    await this.killProfileChrome();
    this.cleanupSingletonLock();
    return { ok: true, message: 'Login cancelado e Chrome encerrado.' };
  }

  private async monitorLoginLoop(): Promise<boolean> {
    await new Promise(r => setTimeout(r, 3000));

    let browser: Browser | null = null;
    const deadline = Date.now() + 5 * 60 * 1000;
    let cdpAttempts = 0;

    while (Date.now() < deadline && !this.cancelLoginRequested) {
      await new Promise(r => setTimeout(r, 2000));
      if (this.cancelLoginRequested) break;

      try {
        if (!browser) {
          cdpAttempts++;
          browser = await chromium.connectOverCDP(`http://127.0.0.1:${LOGIN_DEBUG_PORT}`, { timeout: 4000 });
          this.cdpReachable = true;
          this.lastLoginError = null;
          console.log(`[HgSession] 🔌 Conectado ao Chrome via CDP na porta ${LOGIN_DEBUG_PORT}. Aguardando autenticação do usuário...`);
        }
        if (!browser.isConnected()) {
          browser = null;
          this.cdpReachable = false;
          continue;
        }

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
            }).catch(() => null) as HgUserInfo | null;

            if (user && user.id) {
              console.log(`[HgSession] ✅ Login confirmado no Hourglass como: ${user.firstname || ''} ${user.lastname || ''} (ID: ${user.id})`);
              this.currentUser = user;
              this.authCache = { authenticated: true, timestamp: Date.now() };
              this.lastLoginError = null;
              this.lastAutoLoginAttemptAt = 0;

              try {
                await ctx.storageState({ path: this.cookiesFile });
                console.log(`[HgSession] 💾 Cookies e storageState salvos em ${this.cookiesFile}`);
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                console.warn('[HgSession] Não foi possível salvar cookies:', msg);
              }

              try {
                const cdp = await browser.newBrowserCDPSession();
                await cdp.send('Browser.close');
              } catch { /* ignore */ }
              await new Promise(r => setTimeout(r, 1500));
              await this.killProfileChrome();
              this.cleanupSingletonLock();

              this.isLoggingIn = false;
              this.loginPid = null;
              this.cdpReachable = false;
              return true;
            }
          }
        }
      } catch (err: unknown) {
        browser = null;
        this.cdpReachable = false;
        if (cdpAttempts >= 4) {
          const msg = err instanceof Error ? err.message : String(err);
          this.lastLoginError = `Chrome (PID ${this.loginPid ?? '?'}) não respondeu na porta ${LOGIN_DEBUG_PORT}: ${msg}`;
        }
      }
    }

    if (!this.cancelLoginRequested) {
      console.warn('[HgSession] ⏱️ Tempo limite de login (5 min) esgotado.');
      this.lastLoginError = 'Tempo limite de login (5 min) esgotado.';
      await this.killProfileChrome();
      this.cleanupSingletonLock();
    }
    this.isLoggingIn = false;
    this.loginPid = null;
    this.cdpReachable = false;
    return false;
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

  async fetchInPage<T = unknown>(url: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<{ status: number; data: T | null; error?: string }> {
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
          let data: T | null = null;
          try {
            data = await res.json() as T;
          } catch {
            data = null;
          }

          return { status, data };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return { status: 500, data: null, error: msg };
        }
      }, { url, options });
    });
  }

  async close() {
    await this.closeContextInternal();
  }
}

export const hgSession = new HgSessionManager();
