import { chromium, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { config } from '../config.js';

export class HgSessionManager {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private sessionDir: string;
  private xsrfToken: string = '';
  private currentUser: any = null;
  
  // Cache de autenticação para evitar recarregar a página a cada 10s
  private authCache: { authenticated: boolean; timestamp: number } | null = null;
  private readonly AUTH_CACHE_TTL_MS = 30000; // 30 segundos de cache

  // Fila de operações (Mutex simples para prevenir concorrência com o perfil do Chrome)
  private operationQueue: Promise<any> = Promise.resolve();

  constructor() {
    this.sessionDir = config.sessionDir;
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.operationQueue.then(async () => {
      try {
        return await fn();
      } catch (err) {
        console.warn('[HgSession] Erro em operação exclusiva:', err);
        throw err;
      }
    });
    this.operationQueue = next.catch(() => {});
    return next;
  }

  async getContext(headless = true): Promise<{ context: BrowserContext; page: Page }> {
    if (this.context && this.page && !this.page.isClosed()) {
      return { context: this.context, page: this.page };
    }

    // Se já havia um contexto, fecha antes de criar outro
    await this.closeContextInternal();

    // Limpeza de arquivo de trava residual do Chrome se existir
    this.cleanupSingletonLock();

    try {
      this.context = await chromium.launchPersistentContext(this.sessionDir, {
        channel: 'chrome',
        headless,
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-first-run',
          '--no-default-browser-check'
        ],
        viewport: { width: 1280, height: 800 }
      });

      this.page = this.context.pages().length > 0 ? this.context.pages()[0] : await this.context.newPage();

      // Monitora tokens de requisições nativas
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
      // Pequena pausa para o sistema operacional liberar os arquivos do Chrome
      await new Promise(r => setTimeout(r, 800));
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const now = Date.now();
    if (this.authCache && (now - this.authCache.timestamp < this.AUTH_CACHE_TTL_MS)) {
      return this.authCache.authenticated;
    }

    return this.runExclusive(async () => {
      try {
        const { page } = await this.getContext(true);
        
        // Se a página já está no app, apenas checa via fetch in page
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
    return this.runExclusive(async () => {
      console.log('[HgSession] 🌐 Abrindo janela interativa do Chrome para login no Hourglass...');
      this.invalidateCache();

      // Fecha o modo headless anterior para abrir a janela visível
      await this.closeContextInternal();

      const { context, page } = await this.getContext(false);
      await page.goto('https://app.hourglass-app.com/v2/page/app/scheduling/mm', { waitUntil: 'domcontentloaded' });

      // Monitora abas extras (como o popup de login do Google)
      let activePage = page;
      context.on('page', newPage => {
        activePage = newPage;
      });

      // Aguarda até 5 minutos para o usuário logar
      for (let i = 0; i < 300; i++) {
        await new Promise(r => setTimeout(r, 1000));
        
        // Percorre todas as abas abertas procurando confirmação de login
        for (const p of context.pages()) {
          try {
            const u = p.url();
            if (u.includes('/app') && !u.includes('login') && !u.includes('auth')) {
              const isSignInScreen = await p.evaluate(() => {
                const text = document.body ? document.body.innerText : '';
                return text.includes('Hourglass Sign In') || !!document.querySelector('#email');
              });

              if (!isSignInScreen) {
                console.log('[HgSession] ✅ Login detectado com sucesso!');
                this.authCache = { authenticated: true, timestamp: Date.now() };
                
                // Tenta coletar dados do usuário logado
                try {
                  const startup = await p.evaluate(async () => {
                    const res = await fetch('/api/v0.2/fsreport/startup');
                    return res.ok ? await res.json() : null;
                  });
                  if (startup?.whoami?.user) {
                    this.currentUser = startup.whoami.user;
                  }
                } catch {}

                return true;
              }
            }
          } catch {}
        }
      }

      console.warn('[HgSession] Tempo limite de login esgotado.');
      return false;
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

          // Tenta obter XSRF token dos cookies caso não tenha vindo
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
