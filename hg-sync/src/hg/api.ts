import { hgSession } from './session.js';
import { config } from '../config.js';
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
    const res = await hgSession.fetchInPage('/api/v0.2/fsreport/startup');
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

  // Salvar parte do meio de semana via API
  async saveMidweekCore(date: string, partType: string, assigneeHgId: number): Promise<boolean> {
    const url = `/api/v0.2/scheduling/mm/schedule/${date}/core?group=${config.lgroup}`;
    const res = await hgSession.fetchInPage(url, {
      method: 'PUT',
      body: { part_type: partType, assignee: assigneeHgId }
    });
    return res.status === 200 || res.status === 201 || res.status === 204;
  }

  async saveMidweekSection(date: string, section: string, slotId: number | null, payload: any): Promise<boolean> {
    const endpoint = slotId ? `${section}/${slotId}` : `${section}`;
    const url = `/api/v0.2/scheduling/mm/schedule/${date}/${endpoint}?group=${config.lgroup}`;
    const res = await hgSession.fetchInPage(url, {
      method: 'PUT',
      body: payload
    });
    return res.status === 200 || res.status === 201 || res.status === 204;
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

