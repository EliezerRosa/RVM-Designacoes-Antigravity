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

  constructor() {
    this.sessionDir = config.sessionDir;
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  async getContext(headless = true): Promise<{ context: BrowserContext; page: Page }> {
    if (this.context && this.page && !this.page.isClosed()) {
      return { context: this.context, page: this.page };
    }

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
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const { page } = await this.getContext(true);
      await page.goto('https://app.hourglass-app.com/v2/page/app', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);

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
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[HgSession] Falha ao verificar autenticação:', e);
      return false;
    }
  }

  getCurrentUser() {
    return this.currentUser;
  }

  async openLoginWindow(): Promise<boolean> {
    console.log('[HgSession] Abrindo janela visível para login no Google...');
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
    }

    const { page } = await this.getContext(false);
    await page.goto('https://app.hourglass-app.com/v2/page/app/scheduling/mm');

    // Aguarda o usuário fazer login (até 5 minutos)
    for (let i = 0; i < 300; i++) {
      await page.waitForTimeout(1000);
      const url = page.url();
      if (url.includes('/app') && !url.includes('login') && !url.includes('auth')) {
        const isLogged = await page.evaluate(() => {
          return !document.body.innerText.includes('Hourglass Sign In');
        });
        if (isLogged) {
          console.log('[HgSession] ✅ Login detectado com sucesso!');
          return true;
        }
      }
    }
    return false;
  }

  async fetchInPage<T = any>(url: string, options: { method?: string; body?: any; headers?: Record<string, string> } = {}): Promise<{ status: number; data: T | null; error?: string }> {
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
  }

  async close() {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
    }
  }
}

export const hgSession = new HgSessionManager();
