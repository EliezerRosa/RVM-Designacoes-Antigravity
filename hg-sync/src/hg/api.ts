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
    const schedUrl = `/api/v0.2/scheduling/mm/schedule/${startWeek}_${endWeek}?lgroup=${config.lgroup}`;
    const metaUrl = `/api/v0.2/scheduling/mm/meeting/${startWeek}_${endWeek}?lgroup=${config.lgroup}&no_subs=true`;

    const [schedRes, metaRes] = await Promise.all([
      hgSession.fetchInPage<any[]>(schedUrl),
      hgSession.fetchInPage<any[]>(metaUrl)
    ]);

    const schedList = schedRes.status === 200 && Array.isArray(schedRes.data) ? schedRes.data : [];
    const metaList = metaRes.status === 200 && Array.isArray(metaRes.data) ? metaRes.data : [];
    const metaMap = new Map(metaList.map((m: any) => [m.date, m]));

    return schedList.map((item: any) => {
      const meta = metaMap.get(item.date);

      const tgw = (meta?.tgw || []).map((mPart: any) => {
        const found = (item.tgw || []).find((x: any) => x.part === mPart.id);
        return {
          id: found?.id || 0,
          assignee: found?.assignee || 0,
          assistant: found?.assistant || 0,
          part: mPart.id
        };
      });

      const fm = (meta?.fm || []).map((mPart: any) => {
        const found = (item.fm || []).find((x: any) => x.part === mPart.id);
        return {
          id: found?.id || 0,
          assignee: found?.assignee || 0,
          assistant: found?.assistant || 0,
          part: mPart.id
        };
      });

      // Em meeting.lac, o Dirigente do EBC possui type === 'cbs'
      const cbsMetaPart = (meta?.lac || []).find((mPart: any) => mPart.type === 'cbs');
      const regularLacMeta = (meta?.lac || []).filter((mPart: any) => mPart.type !== 'cbs');

      const lac = regularLacMeta.map((mPart: any) => {
        const found = (item.lac || []).find((x: any) => x.part === mPart.id);
        return {
          id: found?.id || 0,
          assignee: found?.assignee || 0,
          assistant: found?.assistant || 0,
          part: mPart.id
        };
      });

      const cbsSlot = cbsMetaPart ? (item.lac || []).find((x: any) => x.part === cbsMetaPart.id) : null;
      const cbsAssignee = cbsSlot ? cbsSlot.assignee : (item.cbs || 0);

      return {
        weekId: item.date,
        chairman: item.chairman,
        openprayer: item.openprayer,
        closeprayer: item.closeprayer,
        cbs_reader: item.cbs_reader,
        cbs: cbsAssignee,
        cbsPartId: cbsMetaPart?.id,
        tgw: tgw.length > 0 ? tgw : item.tgw,
        fm: fm.length > 0 ? fm : item.fm,
        lac: lac.length > 0 ? lac : item.lac
      };
    });
  }

  async getMidweekMeetingMeta(startWeek: string, endWeek: string): Promise<any[]> {
    const url = `/api/v0.2/scheduling/mm/meeting/${startWeek}_${endWeek}?lgroup=${config.lgroup}&no_subs=true`;
    const res = await hgSession.fetchInPage<any[]>(url);
    return res.status === 200 && Array.isArray(res.data) ? res.data : [];
  }

  // Salvar parte core do meio de semana via REST API nativa (chairman, openprayer, closeprayer, cbs_reader)
  async saveMidweekCore(date: string, partType: string, assigneeHgId: number): Promise<boolean> {
    const url = `/api/v0.2/scheduling/mm/schedule/${date}/core?lgroup=${config.lgroup}`;
    const res = await hgSession.fetchInPage(url, {
      method: 'PUT',
      body: { part_type: partType, assignee: assigneeHgId }
    });
    return res.status === 200 || res.status === 201 || res.status === 204;
  }

  // Salvar parte de seção do meio de semana via REST API nativa (tgw, fm titular/ajudante, lac, dirigente ebc)
  async saveMidweekAssignment(date: string, partId: number, assigneeHgId: number, isAssistant = false): Promise<boolean> {
    const url = `/api/v0.2/scheduling/mm/schedule/${date}/asmt?lgroup=${config.lgroup}`;
    const res = await hgSession.fetchInPage(url, {
      method: 'PUT',
      body: {
        assignee: assigneeHgId,
        assistant: isAssistant,
        classroom: 0,
        part: partId
      }
    });
    return res.status === 200 || res.status === 201 || res.status === 204;
  }

  /**
   * Salva qualquer slot do Meio de Semana (core, tgw, fm titular/ajudante, lac, cbs)
   * usando REST API nativa do Hourglass diretamente, com fallback via DOM se necessário.
   */
  async saveMidweekSlot(
    date: string,
    slotKey: string,
    targetHgId: number,
    hgCurrent: HgWeekScheduleCurrent | null,
    slotLabel?: string,
    targetName?: string
  ): Promise<boolean> {
    // 1. Core slots (Presidente, Oração Inicial, Oração Final, Leitor do EBC)
    if (['chairman', 'openprayer', 'closeprayer', 'cbs_reader'].includes(slotKey)) {
      const ok = await this.saveMidweekCore(date, slotKey, targetHgId);
      if (ok) return true;
      return await hgBrowser.saveMidweekSlotViaDom(date, slotKey, slotLabel || slotKey, targetName || '');
    }

    // 2. Dirigente do EBC (armazenado como parte 'cbs' da seção LAC)
    if (slotKey === 'cbs') {
      const partId = hgCurrent?.cbsPartId;
      if (partId && partId > 0) {
        const ok = await this.saveMidweekAssignment(date, partId, targetHgId, false);
        if (ok) return true;
      }
      return await hgBrowser.saveMidweekSlotViaDom(date, slotKey, slotLabel || slotKey, targetName || '');
    }

    // 3. TGW (Tesouros da Palavra)
    if (slotKey.startsWith('tgw_')) {
      const idx = parseInt(slotKey.split('_')[1], 10);
      const hgSlot = hgCurrent?.tgw?.[idx];
      const partId = hgSlot?.part;
      if (partId && partId > 0) {
        const ok = await this.saveMidweekAssignment(date, partId, targetHgId, false);
        if (ok) return true;
      }
      return await hgBrowser.saveMidweekSlotViaDom(date, slotKey, slotLabel || slotKey, targetName || '');
    }

    // 4. FM (Faça Seu Melhor no Ministério — Titular e Ajudante)
    if (slotKey.startsWith('fm_')) {
      const parts = slotKey.split('_');
      const idx = parseInt(parts[1], 10);
      const role = parts[2]; // 'assignee' | 'assistant'
      const hgSlot = hgCurrent?.fm?.[idx];
      const partId = hgSlot?.part;
      if (partId && partId > 0) {
        const ok = await this.saveMidweekAssignment(date, partId, targetHgId, role === 'assistant');
        if (ok) return true;
      }
      return await hgBrowser.saveMidweekSlotViaDom(date, slotKey, slotLabel || slotKey, targetName || '');
    }

    // 5. LAC (Nossa Vida Cristã)
    if (slotKey.startsWith('lac_')) {
      const idx = parseInt(slotKey.split('_')[1], 10);
      const hgSlot = hgCurrent?.lac?.[idx];
      const partId = hgSlot?.part;
      if (partId && partId > 0) {
        const ok = await this.saveMidweekAssignment(date, partId, targetHgId, false);
        if (ok) return true;
      }
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
