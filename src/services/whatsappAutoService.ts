/**
 * whatsappAutoService — Utilitário desacoplado para envio automático de WhatsApp.
 *
 * ZERO dependências do app. Pode ser copiado para qualquer projeto.
 *
 * Providers suportados:
 *   1. Evolution API  — self-hosted, gratuito (github.com/EvolutionAPI/evolution-api)
 *   2. Z-API          — serviço SaaS gerenciado, muito popular no BR (z-api.com)
 *   3. Meta Cloud API — oficial WhatsApp Business (developers.facebook.com)
 *   4. Edge Function  — proxy via Supabase Edge Function (mantém chaves seguras)
 *   5. Manual         — fallback: abre api.whatsapp.com/send no browser
 *
 * Uso:
 *   const wa = createWhatsAppAutoService({ provider: 'evolution', ... });
 *   const result = await wa.sendText('5527999999999', 'Olá!');
 */

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: string;
  /** Se true, mensagem foi aberta no browser (fallback manual). */
  manual?: boolean;
}

export interface WhatsAppConnectionStatus {
  connected: boolean;
  instanceName?: string;
  phoneNumber?: string;
  error?: string;
}

/** Interface genérica de um provider. Implementar para adicionar novos. */
export interface WhatsAppProvider {
  readonly name: string;
  sendText(phone: string, message: string): Promise<WhatsAppSendResult>;
  sendImage?(phone: string, imageBase64: string, caption?: string): Promise<WhatsAppSendResult>;
  checkConnection(): Promise<WhatsAppConnectionStatus>;
  fetchChats?(): Promise<Array<{ id: string; name: string; isGroup?: boolean }>>;
  fetchGroupMetadata?(groupIdOrPhone: string): Promise<any>;
}

// ─── Configuração ───────────────────────────────────────────────────────────

export interface EvolutionConfig {
  provider: 'evolution';
  /** URL base da instância (ex: https://evo.meudominio.com.br) */
  baseUrl: string;
  /** API Key global ou da instância */
  apiKey: string;
  /** Nome da instância (ex: "rvm-bot") */
  instanceName: string;
}

export interface ZApiConfig {
  provider: 'z-api';
  /** ID da Instância Z-API (ex: 3A91B...) */
  instanceId: string;
  /** Token da Instância Z-API */
  instanceToken: string;
  /** Client Token (Token de Segurança da conta) */
  clientToken: string;
}

export interface MetaCloudConfig {
  provider: 'meta-cloud';
  /** Token de acesso permanente (System User Token) */
  accessToken: string;
  /** ID do número de telefone do WhatsApp Business */
  phoneNumberId: string;
  /** Versão da Graph API (default: v21.0) */
  apiVersion?: string;
}

export interface EdgeFunctionConfig {
  provider: 'edge-function';
  /** URL do projeto Supabase (ex: https://xxx.supabase.co) */
  supabaseUrl: string;
  /** Anon Key do Supabase */
  supabaseAnonKey: string;
  /** Nome da Edge Function (default: "send-whatsapp") */
  functionName?: string;
  /** Bearer token (se autenticado) — opcional, usa anon se omitido */
  accessToken?: string;
}

export interface ManualConfig {
  provider: 'manual';
}

export type WhatsAppAutoConfig =
  | EvolutionConfig
  | ZApiConfig
  | MetaCloudConfig
  | EdgeFunctionConfig
  | ManualConfig;

// ─── Utilitários internos ───────────────────────────────────────────────────

/** Normaliza telefone brasileiro para formato internacional sem +. */
export function normalizePhoneBR(phone: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  // Remove + ou 0 inicial
  digits = digits.replace(/^0+/, '');
  // Adiciona código do país se não presente
  if (digits.length <= 11 && !digits.startsWith('55')) {
    digits = '55' + digits;
  }
  return digits;
}

/** Valida se o número normalizado parece um celular BR válido. */
export function isValidBRPhone(phone: string): boolean {
  const digits = normalizePhoneBR(phone);
  // 55 + 2 DDD + 9 celular = 13 dígitos, ou 55 + 2 DDD + 8 fixo = 12
  return digits.length >= 12 && digits.length <= 13 && digits.startsWith('55');
}

// ─── Provider: Evolution API ────────────────────────────────────────────────

class EvolutionProvider implements WhatsAppProvider {
  readonly name = 'evolution';
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly instance: string;

  constructor(config: EvolutionConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.instance = config.instanceName;
  }

  async sendText(phone: string, message: string): Promise<WhatsAppSendResult> {
    const number = normalizePhoneBR(phone);
    if (!isValidBRPhone(number)) {
      return { success: false, error: `Número inválido: ${phone}`, provider: this.name };
    }

    try {
      const res = await fetch(
        `${this.baseUrl}/message/sendText/${this.instance}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.apiKey,
          },
          body: JSON.stringify({
            number,
            text: message,
          }),
        }
      );

      if (!res.ok) {
        const body = await res.text();
        return {
          success: false,
          error: `Evolution API ${res.status}: ${body}`,
          provider: this.name,
        };
      }

      const data = await res.json();
      return {
        success: true,
        messageId: data.key?.id || data.messageId || undefined,
        provider: this.name,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        provider: this.name,
      };
    }
  }

  async checkConnection(): Promise<WhatsAppConnectionStatus> {
    try {
      const res = await fetch(
        `${this.baseUrl}/instance/connectionState/${this.instance}`,
        {
          headers: { apikey: this.apiKey },
        }
      );

      if (!res.ok) {
        return { connected: false, error: `HTTP ${res.status}` };
      }

      const data = await res.json();
      const state = data.instance?.state || data.state;
      return {
        connected: state === 'open',
        instanceName: this.instance,
        phoneNumber: data.instance?.phoneNumber,
      };
    } catch (err) {
      return {
        connected: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

// ─── Provider: Z-API ────────────────────────────────────────────────────────

class ZApiProvider implements WhatsAppProvider {
  readonly name = 'z-api';
  private readonly instanceId: string;
  private readonly instanceToken: string;
  private readonly clientToken: string;
  private readonly baseUrl: string;

  constructor(config: ZApiConfig) {
    this.instanceId = config.instanceId;
    this.instanceToken = config.instanceToken;
    this.clientToken = config.clientToken;
    this.baseUrl = `https://api.z-api.io/instances/${this.instanceId}/token/${this.instanceToken}`;
  }

  async sendText(phone: string, message: string): Promise<WhatsAppSendResult> {
    const number = normalizePhoneBR(phone);
    if (!isValidBRPhone(number)) {
      return { success: false, error: `Número inválido: ${phone}`, provider: this.name };
    }

    try {
      const res = await fetch(`${this.baseUrl}/send-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'client-token': this.clientToken,
        },
        body: JSON.stringify({
          phone: number,
          message: message,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        return {
          success: false,
          error: `Z-API ${res.status}: ${body}`,
          provider: this.name,
        };
      }

      const data = await res.json();
      return {
        success: true,
        messageId: data.messageId,
        provider: this.name,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        provider: this.name,
      };
    }
  }

  async sendImage(phone: string, imageBase64: string, caption?: string): Promise<WhatsAppSendResult> {
    const number = normalizePhoneBR(phone);
    if (!isValidBRPhone(number)) {
      return { success: false, error: `Número inválido: ${phone}`, provider: this.name };
    }

    try {
      const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
      const res = await fetch(`${this.baseUrl}/send-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'client-token': this.clientToken,
        },
        body: JSON.stringify({
          phone: number,
          image: `data:image/png;base64,${base64Data}`,
          caption: caption || '',
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        return { success: false, error: `Z-API ${res.status}: ${body}`, provider: this.name };
      }

      const data = await res.json();
      return { success: true, messageId: data.messageId, provider: this.name };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err), provider: this.name };
    }
  }

  async fetchChats(): Promise<Array<{ id: string; name: string; isGroup?: boolean }>> {
    try {
      const res = await fetch(`${this.baseUrl}/chats`, {
        headers: { 'client-token': this.clientToken },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.chats || []);
    } catch (err) {
      console.warn('[ZApiProvider] Error fetching chats:', err);
      return [];
    }
  }

  async fetchGroupMetadata(groupIdOrPhone: string): Promise<any> {
    try {
      const cleanTarget = groupIdOrPhone.trim();
      if (!cleanTarget) return null;

      // 1. Tentar buscar metadata direto se parecer um ID de grupo ou número
      const directRes = await fetch(`${this.baseUrl}/group-metadata/${cleanTarget}`, {
        headers: { 'client-token': this.clientToken },
      });
      if (directRes.ok) {
        return await directRes.json();
      }

      // 2. Se falhar ou for busca por nome, listar chats e procurar por parte do nome
      const chats = await this.fetchChats();
      const targetLower = cleanTarget.toLowerCase();
      const found = chats.find(c => (c.name || '').toLowerCase().includes(targetLower) || c.id === cleanTarget);
      
      if (found?.id) {
        const groupRes = await fetch(`${this.baseUrl}/group-metadata/${found.id}`, {
          headers: { 'client-token': this.clientToken },
        });
        if (groupRes.ok) {
          return await groupRes.json();
        }
      }

      return null;
    } catch (err) {
      console.error('[ZApiProvider] Error fetching group metadata:', err);
      return null;
    }
  }

  async checkConnection(): Promise<WhatsAppConnectionStatus> {
    try {
      const res = await fetch(`${this.baseUrl}/status`, {
        headers: { 'client-token': this.clientToken },
      });

      if (!res.ok) {
        return { connected: false, error: `HTTP ${res.status}` };
      }

      const data = await res.json();
      return {
        connected: data.connected ?? false,
        phoneNumber: data.phone,
      };
    } catch (err) {
      return {
        connected: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

// ─── Provider: Meta Cloud API ───────────────────────────────────────────────

class MetaCloudProvider implements WhatsAppProvider {
  readonly name = 'meta-cloud';
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly apiVersion: string;

  constructor(config: MetaCloudConfig) {
    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
    this.apiVersion = config.apiVersion || 'v21.0';
  }

  async sendText(phone: string, message: string): Promise<WhatsAppSendResult> {
    const number = normalizePhoneBR(phone);
    if (!isValidBRPhone(number)) {
      return { success: false, error: `Número inválido: ${phone}`, provider: this.name };
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.accessToken}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: number,
            type: 'text',
            text: { body: message },
          }),
        }
      );

      if (!res.ok) {
        const body = await res.text();
        return {
          success: false,
          error: `Meta API ${res.status}: ${body}`,
          provider: this.name,
        };
      }

      const data = await res.json();
      return {
        success: true,
        messageId: data.messages?.[0]?.id,
        provider: this.name,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        provider: this.name,
      };
    }
  }

  async checkConnection(): Promise<WhatsAppConnectionStatus> {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`,
        {
          headers: { Authorization: `Bearer ${this.accessToken}` },
        }
      );

      if (!res.ok) {
        return { connected: false, error: `HTTP ${res.status}` };
      }

      const data = await res.json();
      return {
        connected: true,
        phoneNumber: data.display_phone_number,
      };
    } catch (err) {
      return {
        connected: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

// ─── Provider: Supabase Edge Function (proxy seguro) ────────────────────────

class EdgeFunctionProvider implements WhatsAppProvider {
  readonly name = 'edge-function';
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;
  private readonly functionName: string;
  private readonly accessToken?: string;

  constructor(config: EdgeFunctionConfig) {
    this.supabaseUrl = config.supabaseUrl.replace(/\/+$/, '');
    this.supabaseAnonKey = config.supabaseAnonKey;
    this.functionName = config.functionName || 'send-whatsapp';
    this.accessToken = config.accessToken;
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      apikey: this.supabaseAnonKey,
      Authorization: `Bearer ${this.accessToken || this.supabaseAnonKey}`,
    };
  }

  async sendText(phone: string, message: string): Promise<WhatsAppSendResult> {
    const number = normalizePhoneBR(phone);
    if (!isValidBRPhone(number)) {
      return { success: false, error: `Número inválido: ${phone}`, provider: this.name };
    }

    try {
      const res = await fetch(
        `${this.supabaseUrl}/functions/v1/${this.functionName}`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({ phone: number, message }),
        }
      );

      if (!res.ok) {
        const body = await res.text();
        return {
          success: false,
          error: `Edge Function ${res.status}: ${body}`,
          provider: this.name,
        };
      }

      const data = await res.json();
      return {
        success: data.success ?? true,
        messageId: data.messageId,
        error: data.error,
        provider: this.name,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        provider: this.name,
      };
    }
  }

  async sendImage(phone: string, imageBase64: string, caption?: string): Promise<WhatsAppSendResult> {
    const number = normalizePhoneBR(phone);
    if (!isValidBRPhone(number)) {
      return { success: false, error: `Número inválido: ${phone}`, provider: this.name };
    }

    try {
      const res = await fetch(
        `${this.supabaseUrl}/functions/v1/${this.functionName}`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            phone: number,
            image: imageBase64,
            caption: caption || '',
            action: 'send-image'
          }),
        }
      );

      if (!res.ok) {
        const body = await res.text();
        return { success: false, error: `Edge Function ${res.status}: ${body}`, provider: this.name };
      }

      const data = await res.json();
      return { success: true, messageId: data.messageId, provider: this.name };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err), provider: this.name };
    }
  }

  async checkConnection(): Promise<WhatsAppConnectionStatus> {
    try {
      const res = await fetch(
        `${this.supabaseUrl}/functions/v1/${this.functionName}`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({ action: 'check-connection' }),
        }
      );

      if (!res.ok) {
        return { connected: false, error: `HTTP ${res.status}` };
      }

      const data = await res.json();
      return {
        connected: data.connected ?? false,
        instanceName: data.instanceName,
        phoneNumber: data.phoneNumber,
      };
    } catch (err) {
      return {
        connected: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

// ─── Provider: Manual (fallback — abre no browser) ──────────────────────────

class ManualProvider implements WhatsAppProvider {
  readonly name = 'manual';

  async sendText(phone: string, message: string): Promise<WhatsAppSendResult> {
    const number = normalizePhoneBR(phone);
    const encoded = encodeURIComponent(message);
    const url = `https://api.whatsapp.com/send?phone=${number}&text=${encoded}`;

    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    return {
      success: true,
      provider: this.name,
      manual: true,
    };
  }

  async checkConnection(): Promise<WhatsAppConnectionStatus> {
    return { connected: true }; // Sempre "disponível" — depende do browser
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

function createProvider(config: WhatsAppAutoConfig): WhatsAppProvider {
  switch (config.provider) {
    case 'evolution':
      return new EvolutionProvider(config);
    case 'z-api':
      return new ZApiProvider(config);
    case 'meta-cloud':
      return new MetaCloudProvider(config);
    case 'edge-function':
      return new EdgeFunctionProvider(config);
    case 'manual':
      return new ManualProvider();
    default:
      throw new Error(`Provider desconhecido: ${(config as any).provider}`);
  }
}

// ─── Serviço público ────────────────────────────────────────────────────────

export interface WhatsAppAutoService {
  /** Nome do provider ativo. */
  readonly providerName: string;

  /** Envia uma mensagem de texto para o número informado. */
  sendText(phone: string, message: string): Promise<WhatsAppSendResult>;

  /** Envia uma imagem em Base64 (opcionalmente suportado pelo provider). */
  sendImage(phone: string, imageBase64: string, caption?: string): Promise<WhatsAppSendResult>;

  /** Verifica se a conexão com o WhatsApp está ativa. */
  checkConnection(): Promise<WhatsAppConnectionStatus>;

  /** Envia para múltiplos destinatários em sequência, com delay entre cada. */
  sendBulk(
    recipients: Array<{ phone: string; message: string }>,
    options?: { delayMs?: number; onProgress?: (index: number, total: number, result: WhatsAppSendResult) => void }
  ): Promise<WhatsAppSendResult[]>;
}

/**
 * Cria uma instância do serviço de WhatsApp automático.
 *
 * @example
 * // Evolution API (self-hosted)
 * const wa = createWhatsAppAutoService({
 *   provider: 'evolution',
 *   baseUrl: 'https://evo.meusite.com.br',
 *   apiKey: 'minha-chave',
 *   instanceName: 'rvm-bot',
 * });
 * 
 * // Z-API
 * const wa = createWhatsAppAutoService({
 *   provider: 'z-api',
 *   instanceId: '3A91B...',
 *   instanceToken: 'abc...',
 *   clientToken: 'F1...',
 * });
 *
 * // Meta Cloud API
 * const wa = createWhatsAppAutoService({
 *   provider: 'meta-cloud',
 *   accessToken: 'EAAx...',
 *   phoneNumberId: '123456789',
 * });
 *
 * // Edge Function (recomendado para produção — chaves no servidor)
 * const wa = createWhatsAppAutoService({
 *   provider: 'edge-function',
 *   supabaseUrl: 'https://xxx.supabase.co',
 *   supabaseAnonKey: 'sb_...',
 * });
 *
 * // Fallback manual
 * const wa = createWhatsAppAutoService({ provider: 'manual' });
 *
 * // Uso
 * const result = await wa.sendText('27999999999', 'Seu código 2FA: 123456');
 * if (result.success) console.log('Enviado!', result.messageId);
 */
export function createWhatsAppAutoService(config: WhatsAppAutoConfig): WhatsAppAutoService {
  const provider = createProvider(config);

  return {
    get providerName() {
      return provider.name;
    },

    sendText(phone: string, message: string) {
      return provider.sendText(phone, message);
    },

    async sendImage(phone: string, imageBase64: string, caption?: string) {
      if (provider.sendImage) {
        return provider.sendImage(phone, imageBase64, caption);
      }
      return { success: false, error: 'Provedor atual não suporta envio de imagem em modo automação.', provider: provider.name };
    },

    checkConnection() {
      return provider.checkConnection();
    },

    async sendBulk(recipients, options) {
      const delayMs = options?.delayMs ?? 1500; // Default 1.5s entre mensagens
      const results: WhatsAppSendResult[] = [];

      for (let i = 0; i < recipients.length; i++) {
        const { phone, message } = recipients[i];
        const result = await provider.sendText(phone, message);
        results.push(result);
        options?.onProgress?.(i, recipients.length, result);

        // Delay entre mensagens (exceto a última) para evitar bloqueio
        if (i < recipients.length - 1 && delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      return results;
    },
  };
}

// ─── Helper: criar instância a partir de env vars ───────────────────────────

/**
 * Cria serviço a partir de variáveis de ambiente VITE_*.
 * Detecta automaticamente qual provider usar baseado nas vars disponíveis.
 *
 * Prioridade: Evolution > Meta Cloud > Edge Function > Manual
 *
 * Variáveis esperadas:
 *   VITE_WHATSAPP_PROVIDER        — 'evolution' | 'z-api' | 'meta-cloud' | 'edge-function' | 'manual'
 *   VITE_EVOLUTION_BASE_URL       — URL da Evolution API
 *   VITE_EVOLUTION_API_KEY        — Chave da Evolution API
 *   VITE_EVOLUTION_INSTANCE       — Nome da instância
 *   VITE_ZAPI_INSTANCE_ID         — ID da instância Z-API
 *   VITE_ZAPI_INSTANCE_TOKEN      — Token da instância Z-API
 *   VITE_ZAPI_CLIENT_TOKEN        — Client Token Z-API
 *   VITE_META_WA_ACCESS_TOKEN     — Token da Meta Cloud API
 *   VITE_META_WA_PHONE_NUMBER_ID  — Phone Number ID da Meta
 *   VITE_SUPABASE_URL             — (reusa do app)
 *   VITE_SUPABASE_ANON_KEY        — (reusa do app)
 */
export function createWhatsAppAutoServiceFromEnv(): WhatsAppAutoService {
  const explicit = import.meta.env.VITE_WHATSAPP_PROVIDER as string | undefined;

  // Evolution API
  if (
    explicit === 'evolution' ||
    (!explicit && import.meta.env.VITE_EVOLUTION_BASE_URL)
  ) {
    return createWhatsAppAutoService({
      provider: 'evolution',
      baseUrl: import.meta.env.VITE_EVOLUTION_BASE_URL || '',
      apiKey: import.meta.env.VITE_EVOLUTION_API_KEY || '',
      instanceName: import.meta.env.VITE_EVOLUTION_INSTANCE || 'default',
    });
  }

  // Z-API
  if (
    explicit === 'z-api' ||
    (!explicit && import.meta.env.VITE_ZAPI_INSTANCE_ID)
  ) {
    return createWhatsAppAutoService({
      provider: 'z-api',
      instanceId: import.meta.env.VITE_ZAPI_INSTANCE_ID || '',
      instanceToken: import.meta.env.VITE_ZAPI_INSTANCE_TOKEN || '',
      clientToken: import.meta.env.VITE_ZAPI_CLIENT_TOKEN || '',
    });
  }

  // Meta Cloud API
  if (
    explicit === 'meta-cloud' ||
    (!explicit && import.meta.env.VITE_META_WA_ACCESS_TOKEN)
  ) {
    return createWhatsAppAutoService({
      provider: 'meta-cloud',
      accessToken: import.meta.env.VITE_META_WA_ACCESS_TOKEN || '',
      phoneNumberId: import.meta.env.VITE_META_WA_PHONE_NUMBER_ID || '',
    });
  }

  // Edge Function (se Supabase está configurado)
  if (
    explicit === 'edge-function' ||
    (!explicit && import.meta.env.VITE_SUPABASE_URL)
  ) {
    return createWhatsAppAutoService({
      provider: 'edge-function',
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
      supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    });
  }

  // Fallback manual
  return createWhatsAppAutoService({ provider: 'manual' });
}
