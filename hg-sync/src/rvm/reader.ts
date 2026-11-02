import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';

export interface RvmPublisher {
  id: string;
  name: string;
  hg_id: number | null;
  hg_name?: string;
  gender?: string;
}

export interface RvmWorkbookPart {
  id: string;
  week_id: string;
  date: string;
  seq: number;
  section: string;
  tipo_parte: string;
  modalidade: string;
  funcao: 'Titular' | 'Ajudante';
  status: string;
  titulo_parte: string;
  raw_publisher_name?: string;
  resolved_publisher_id?: string;
  resolved_publisher_name?: string;
  is_chairman_derived?: boolean;
}

export class RvmReader {
  private client: SupabaseClient | null = null;

  constructor() {
    if (config.supabaseUrl && config.supabaseKey) {
      this.client = createClient(config.supabaseUrl, config.supabaseKey);
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  // 1. Semanas publicadas no RVM (app_settings.week_published)
  async getPublishedWeeks(): Promise<Record<string, string>> {
    if (!this.client) return {};
    try {
      const { data, error } = await this.client
        .from('app_settings')
        .select('value')
        .eq('key', 'week_published')
        .maybeSingle();

      if (error || !data?.value) return {};
      return data.value as Record<string, string>;
    } catch (e) {
      console.warn('[RVM Reader] Erro ao ler week_published:', e);
      return {};
    }
  }

  // 2. Lista de publicadores do RVM (com hg_id se houver)
  async getPublishers(): Promise<RvmPublisher[]> {
    if (!this.client) return [];
    try {
      const { data, error } = await this.client
        .from('publishers')
        .select('id, data');

      if (error || !data) return [];

      return data.map((row: any) => {
        const d = row.data || {};
        return {
          id: row.id,
          name: (d.name || '').trim(),
          hg_id: d.hg_id ? parseInt(d.hg_id) : null,
          hg_name: d.hg_name || d.name,
          gender: d.gender
        };
      });
    } catch (e) {
      console.warn('[RVM Reader] Erro ao ler publishers:', e);
      return [];
    }
  }

  // 3. Partes da Reunião de Meio de Semana a partir de uma semana
  async getMidweekParts(fromWeekId: string): Promise<RvmWorkbookPart[]> {
    if (!this.client) return [];
    try {
      const { data, error } = await this.client
        .from('workbook_parts')
        .select('*')
        .gte('week_id', fromWeekId)
        .order('week_id', { ascending: true })
        .order('seq', { ascending: true });

      if (error || !data) return [];
      return data as RvmWorkbookPart[];
    } catch (e) {
      console.warn('[RVM Reader] Erro ao ler workbook_parts:', e);
      return [];
    }
  }
}

export const rvmReader = new RvmReader();

