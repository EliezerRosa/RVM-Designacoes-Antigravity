import { chromium, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { config } from '../config.js';

export class HgSessionManager {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private currentHeadless: boolean | null = null;
  private sessionDir: string;
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

  async openLoginWindow(): Promise<boolean> {
    if (this.isLoggingIn) {
      console.log('[HgSession] Processo de login já está em andamento...');
      return false;
    }
    this.invalidateCache();
    this.isLoggingIn = true;

    try {
      console.log('[HgSession] 🌐 Abrindo janela interativa do Chrome para login no Hourglass...');
      
      // Abre o Chrome interativo protegido pelo mutex curto
      const { context, page } = await this.runExclusive(async () => {
        await this.closeContextInternal();
        this.cleanupSingletonLock();
        return await this.getContext(false);
      });

      try {
        await page.bringToFront();
      } catch {}

      await page.goto('https://app.hourglass-app.com/v2/page/app/scheduling/mm', { waitUntil: 'domcontentloaded', timeout: 30000 });

      // O laço de espera roda FORA do mutex para não travar outras chamadas da API
      for (let i = 0; i < 300; i++) {
        await new Promise(r => setTimeout(r, 1000));
        
        if (page.isClosed()) {
          console.log('[HgSession] Janela do navegador foi fechada pelo usuário.');
          break;
        }

        for (const p of context.pages()) {
          try {
            const isActuallyLogged = await p.evaluate(async () => {
              try {
                const res = await fetch('/api/v0.2/fsreport/startup');
                if (!res.ok) return null;
                const d = await res.json();
                return d?.whoami?.user || null;
              } catch {
                return null;
              }
            });

            if (isActuallyLogged && isActuallyLogged.id) {
              console.log(`[HgSession] ✅ Login confirmado no Hourglass como: ${isActuallyLogged.firstname || ''} ${isActuallyLogged.lastname || ''}`);
              this.currentUser = isActuallyLogged;
              this.authCache = { authenticated: true, timestamp: Date.now() };
              this.isLoggingIn = false;
              return true;
            }
          } catch {}
        }
      }

      console.warn('[HgSession] Tempo limite de login esgotado ou janela fechada.');
      this.isLoggingIn = false;
      return false;
    } catch (err: any) {
      console.error('[HgSession] Erro ao abrir janela de login:', err.message);
      this.isLoggingIn = false;
      return false;
    }
  }

  async openNativeLoginChrome(): Promise<void> {
    await this.closeContextInternal();
    this.cleanupSingletonLock();
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const targetUrl = 'https://app.hourglass-app.com/v2/page/app/scheduling/mm';
    const { exec } = await import('child_process');
    exec(`start "" "${chromePath}" --user-data-dir="${this.sessionDir}" "${targetUrl}"`);
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
