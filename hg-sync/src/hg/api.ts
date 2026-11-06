import { hgSession } from './session.js';
import { hgBrowser } from './browser.js';
import { config } from '../config.js';
import { store } from '../store.js';
import { HgWeekScheduleCurrent } from '../midweek/reconcile.js';

export interface HgUser {
  id: number;
  firstname: string;
  lastname: string;
  displayName: string;
}

export class HgApiClient {
  private usersCache: HgUser[] = [];

  async getStartupData(): Promise<any> {
    const res = await hgSession.fetchInPage<any>('/api/v0.2/fsreport/startup');
    if (res.status === 200 && res.data) {
      if (Array.isArray(res.data.users)) {
        this.usersCache = res.data.users.map((u: any) => ({
          id: u.id,
          firstname: u.firstname,
          lastname: u.lastname,
          displayName: `${u.firstname} ${u.lastname}`.trim()
        }));
      }
      return res.data;
    }
    return null;
  }

  async getCongregationUsers(): Promise<HgUser[]> {
    if (this.usersCache.length > 0) return this.usersCache;
    await this.getStartupData();
    return this.usersCache;
  }

  // 1. Reunião de Meio de Semana
  async getMidweekSchedule(startWeek: string, endWeek: string): Promise<HgWeekScheduleCurrent[]> {
    const url = `/api/v0.2/scheduling/mm/schedule/${startWeek}_${endWeek}?lgroup=${config.lgroup}`;
    const res = await hgSession.fetchInPage<any[]>(url);
    if (res.status === 200 && Array.isArray(res.data)) {
      return res.data.map(item => ({
        weekId: item.date,
        chairman: item.chairman,
        openprayer: item.openprayer,
        closeprayer: item.closeprayer,
        cbs_reader: item.cbs_reader,
        cbs: item.cbs,
        tgw: item.tgw,
        fm: item.fm,
        lac: item.lac
      }));
    }
    return [];
  }

  async getMidweekMeetingMeta(startWeek: string, endWeek: string): Promise<any[]> {
    const url = `/api/v0.2/scheduling/mm/meeting/${startWeek}_${endWeek}?lgroup=${config.lgroup}&no_subs=true`;
    const res = await hgSession.fetchInPage<any[]>(url);
    return res.status === 200 && Array.isArray(res.data) ? res.data : [];
  }

  // Salvar parte core do meio de semana via API
  async saveMidweekCore(date: string, partType: string, assigneeHgId: number): Promise<boolean> {
    const url = `/api/v0.2/scheduling/mm/schedule/${date}/core?group=${config.lgroup}`;
    const res = await hgSession.fetchInPage(url, {
      method: 'PUT',
      body: { part_type: partType, assignee: assigneeHgId }
    });
    return res.status === 200 || res.status === 201 || res.status === 204;
  }

  async saveMidweekSection(date: string, section: string, slotId: number | null, payload: any): Promise<boolean> {
    const learned = store.getEndpoints()[`mm_${section}`];
    if (learned?.urlPattern) {
      const customUrl = learned.urlPattern
        .replace('{date}', date)
        .replace('{slotId}', slotId ? String(slotId) : '')
        .replace('{lgroup}', config.lgroup);
      const customRes = await hgSession.fetchInPage(customUrl, {
        method: learned.method || 'PUT',
        body: payload
      });
      if (customRes.status >= 200 && customRes.status < 300) {
        return true;
      }
    }

    const candidates = slotId
      ? [
          `/api/v0.2/scheduling/mm/schedule/${date}/${section}/${slotId}?group=${config.lgroup}`,
          `/api/v0.2/scheduling/mm/schedule/${date}/${section}?group=${config.lgroup}`
        ]
      : [`/api/v0.2/scheduling/mm/schedule/${date}/${section}?group=${config.lgroup}`];

    for (const url of candidates) {
      const res = await hgSession.fetchInPage(url, {
        method: 'PUT',
        body: payload
      });
      if (res.status === 200 || res.status === 201 || res.status === 204) {
        return true;
      }
    }
    return false;
  }

  /**
   * Salva qualquer slot do Meio de Semana (core, tgw, fm titular/ajudante, lac, cbs)
   * usando estratégia híbrida automática: tenta REST API primeiro e, se o endpoint
   * não aceitar diretamente, executa fallback via DOM headless (aprendendo o endpoint).
   */
  async saveMidweekSlot(
    date: string,
    slotKey: string,
    targetHgId: number,
    hgCurrent: HgWeekScheduleCurrent | null,
    slotLabel?: string,
    targetName?: string
  ): Promise<boolean> {
    // 1. Core slots
    if (['chairman', 'openprayer', 'closeprayer', 'cbs_reader', 'cbs'].includes(slotKey)) {
      const ok = await this.saveMidweekCore(date, slotKey, targetHgId);
      if (ok) return true;
      return await hgBrowser.saveMidweekSlotViaDom(date, slotKey, slotLabel || slotKey, targetName || '');
    }

    // 2. TGW (Tesouros da Palavra)
    if (slotKey.startsWith('tgw_')) {
      const idx = parseInt(slotKey.split('_')[1], 10);
      const hgSlot = hgCurrent?.tgw?.[idx];
      const payload = {
        id: hgSlot?.id,
        part: hgSlot?.part ?? (idx + 1),
        assignee: targetHgId
      };
      const ok = await this.saveMidweekSection(date, 'tgw', hgSlot?.id ?? null, payload);
      if (ok) return true;
      return await hgBrowser.saveMidweekSlotViaDom(date, slotKey, slotLabel || slotKey, targetName || '');
    }

    // 3. FM (Faça Seu Melhor no Ministério — Titular e Ajudante)
    if (slotKey.startsWith('fm_')) {
      const parts = slotKey.split('_');
      const idx = parseInt(parts[1], 10);
      const role = parts[2]; // 'assignee' | 'assistant'
      const hgSlot = hgCurrent?.fm?.[idx];
      const payload = {
        id: hgSlot?.id,
        part: hgSlot?.part ?? (idx + 1),
        assignee: role === 'assignee' ? targetHgId : (hgSlot?.assignee || 0),
        assistant: role === 'assistant' ? targetHgId : (hgSlot?.assistant || 0)
      };
      if (hgSlot) {
        if (role === 'assignee') hgSlot.assignee = targetHgId;
        if (role === 'assistant') hgSlot.assistant = targetHgId;
      }
      const ok = await this.saveMidweekSection(date, 'fm', hgSlot?.id ?? null, payload);
      if (ok) return true;
      return await hgBrowser.saveMidweekSlotViaDom(date, slotKey, slotLabel || slotKey, targetName || '');
    }

    // 4. LAC (Nossa Vida Cristã)
    if (slotKey.startsWith('lac_')) {
      const idx = parseInt(slotKey.split('_')[1], 10);
      const hgSlot = hgCurrent?.lac?.[idx];
      const payload = {
        id: hgSlot?.id,
        part: hgSlot?.part ?? (idx + 1),
        assignee: targetHgId
      };
      const ok = await this.saveMidweekSection(date, 'lac', hgSlot?.id ?? null, payload);
      if (ok) return true;
      return await hgBrowser.saveMidweekSlotViaDom(date, slotKey, slotLabel || slotKey, targetName || '');
    }

    return false;
  }

  // 2. Reunião de Fim de Semana
  async getWeekendSchedule(startDate: string, endDate: string): Promise<any[]> {
    const url = `/api/v0.2/scheduling/wm/schedule/${startDate}_${endDate}?group=${config.lgroup}`;
    const res = await hgSession.fetchInPage<any[]>(url);
    return res.status === 200 && Array.isArray(res.data) ? res.data : [];
  }

  // 3. Áudio/Vídeo e Indicadores
  async getAvSchedule(startDate: string, endDate: string): Promise<any[]> {
    const url = `/api/v0.2/scheduling/av_attendant/${startDate}_${endDate}?group=${config.lgroup}`;
    const res = await hgSession.fetchInPage<any[]>(url);
    return res.status === 200 && Array.isArray(res.data) ? res.data : [];
  }

  // 4. Limpeza
  async getCleaningSchedule(): Promise<any[]> {
    const url = `/api/v0.2/scheduling/other/clean?group=${config.lgroup}`;
    const res = await hgSession.fetchInPage<any[]>(url);
    return res.status === 200 && Array.isArray(res.data) ? res.data : [];
  }
}

export const hgApi = new HgApiClient();
