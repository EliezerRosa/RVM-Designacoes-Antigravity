/**
 * DocumentPort — Adaptador de Documentos Oficiais para o Carrossel Cronológico
 *
 * Busca e prepara formulários oficiais (S-140, S-89, S-4 e S-1) ordenados cronologicamente,
 * usando o schema real (`seq`, `resolved_publisher_id`, `mapDbToWorkbookPart`, `rm.*`)
 * e carregamento dinâmico dos geradores para evitar impacto em SSR/testes Node.
 */

import { supabase } from '../../../lib/supabase';
import { WorkbookStatus, type Publisher, type WorkbookPart } from '../../../types';
import { mapDbToWorkbookPart } from '../../../services/workbookService';
import { getTodayWeekIdLocal } from '../../../utils/dateUtils';
import { isManuallyAssignable } from '../../../constants/s140Template';
import { formatDateBr } from '../core/dateFormat';

export { formatDateBr };

export interface DocumentCarouselItem {
  id: string;
  docType: 's140' | 's89' | 's4' | 's1' | 'pdf';
  title: string;
  subtitle: string;
  dateStr: string;
  htmlContent?: string;
  imageBase64?: string;
  naturalWidth?: number;
  isInitialFocus?: boolean;
}

const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

const MONTH_NORM_MAP: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

function escapeHtml(raw?: string | number | null): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeSearchName(raw?: string | null): string {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveTargetMonthNumber(monthSlot?: string): number | undefined {
  if (!monthSlot) return undefined;
  const now = new Date();
  if (monthSlot === 'current-month') return now.getMonth() + 1;
  if (monthSlot === 'next-month') return ((now.getMonth() + 1) % 12) + 1;
  const norm = normalizeSearchName(monthSlot);
  return MONTH_NORM_MAP[norm];
}

function renderS89FallbackHtml(
  studentName: string,
  assistantName: string | undefined,
  dateBr: string,
  partLabel: string,
  roomLabel: string,
  isStudent: boolean
): string {
  return `
    <div style="width:460px;padding:26px 28px 22px;background:#ffffff;color:#000000;font-family:Arial,Helvetica,sans-serif;border:2px solid #111827;box-sizing:border-box;line-height:1.45;">
      <div style="text-align:center;font-weight:700;font-size:15px;letter-spacing:0.3px;margin-bottom:18px;">
        DESIGNAÇÃO PARA A REUNIÃO<br/>NOSSA VIDA E MINISTÉRIO CRISTÃO
      </div>
      <div style="margin-bottom:10px;font-size:14px;">
        <strong>Nome:</strong>
        <span style="border-bottom:1px dotted #374151;padding:0 6px 1px;display:inline-block;min-width:290px;">${escapeHtml(studentName)}</span>
      </div>
      ${
        isStudent
          ? `<div style="margin-bottom:10px;font-size:14px;">
              <strong>Ajudante:</strong>
              <span style="border-bottom:1px dotted #374151;padding:0 6px 1px;display:inline-block;min-width:270px;">${escapeHtml(assistantName || '—')}</span>
            </div>`
          : ''
      }
      <div style="margin-bottom:10px;font-size:14px;">
        <strong>Data:</strong>
        <span style="border-bottom:1px dotted #374151;padding:0 6px 1px;display:inline-block;min-width:295px;">${escapeHtml(dateBr)}</span>
      </div>
      <div style="margin-bottom:12px;font-size:14px;">
        <strong>Parte:</strong>
        <span style="border-bottom:1px dotted #374151;padding:0 6px 1px;display:inline-block;min-width:292px;">${escapeHtml(partLabel)}</span>
      </div>
      <div style="margin-bottom:14px;font-size:13px;">
        <strong>Local:</strong> ${escapeHtml(roomLabel)}
      </div>
      <div style="font-size:11.5px;color:#374151;border-top:1px solid #d1d5db;padding-top:10px;">
        <strong>Observação${isStudent ? ' para o estudante' : ''}:</strong> A fonte de matéria e a lição de estudo constam na Apostila da Reunião Vida e Ministério.
      </div>
      <div style="margin-top:12px;font-size:11px;color:#4b5563;">S-89-T</div>
    </div>
  `;
}

function renderS4CardHtml(params: {
  publisherName: string;
  monthLabel: string;
  hasPreached: boolean;
  bibleStudies: number;
  hours: number | null;
  notes: string | null;
}): string {
  const showHours = params.hours !== null && params.hours !== undefined;
  return `
    <div style="width:480px;padding:28px 32px 22px;background:#ffffff;color:#000000;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;line-height:1.4;">
      <div style="font-size:17px;font-weight:700;text-align:center;letter-spacing:0.04em;margin-bottom:20px;">
        RELATÓRIO DE SERVIÇO DE CAMPO
      </div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px;">
        <span style="font-weight:700;font-size:14.5px;white-space:nowrap;">Nome:</span>
        <span style="flex:1;border-bottom:1.5px dotted #6b7280;color:#1e3a8a;font-weight:600;font-size:14.5px;padding:0 4px 1px;">${escapeHtml(params.publisherName)}</span>
      </div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:16px;">
        <span style="font-weight:700;font-size:14.5px;white-space:nowrap;">Mês:</span>
        <span style="flex:1;border-bottom:1.5px dotted #6b7280;color:#1e3a8a;font-weight:600;font-size:14.5px;padding:0 4px 1px;">${escapeHtml(params.monthLabel)}</span>
      </div>
      <div style="border:2px solid #000000;margin-bottom:16px;">
        <div style="display:flex;">
          <div style="flex:1;padding:9px 11px;font-size:13.5px;border-right:2px solid #000000;">
            Marque se você participou em alguma<br/>modalidade do ministério durante o mês.
          </div>
          <div style="width:54px;display:flex;align-items:center;justify-content:center;padding:8px;">
            <div style="width:22px;height:22px;border:2px solid #000000;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px;color:#1e3a8a;">
              ${params.hasPreached ? '✓' : ''}
            </div>
          </div>
        </div>
        <div style="display:flex;border-top:2px solid #000000;">
          <div style="flex:1;padding:9px 11px;font-size:13.5px;border-right:2px solid #000000;">
            Estudos bíblicos
          </div>
          <div style="width:54px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#1e3a8a;">
            ${params.bibleStudies > 0 ? escapeHtml(params.bibleStudies) : '—'}
          </div>
        </div>
        <div style="display:flex;border-top:2px solid #000000;">
          <div style="flex:1;padding:9px 11px;font-size:13.5px;line-height:1.35;border-right:2px solid #000000;">
            Horas (se for pioneiro auxiliar, regular, especial<br/>ou missionário em campo)
          </div>
          <div style="width:54px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#1e3a8a;">
            ${showHours ? escapeHtml(params.hours) : '—'}
          </div>
        </div>
      </div>
      <div style="border:2px solid #000000;padding:8px 11px;min-height:54px;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;margin-bottom:4px;">Observações:</div>
        <div style="font-size:13px;color:#1f2937;">${escapeHtml(params.notes || '')}</div>
      </div>
      <div style="font-size:11.5px;color:#374151;">S-4-T&nbsp;&nbsp;11/23</div>
    </div>
  `;
}

function renderS1SheetHtml(params: {
  congregationName: string;
  congregationNumber: string;
  monthLabel: string;
  activePublishers: number;
  pubs: { count: number; studies: number };
  aux: { count: number; studies: number; hours: number };
  reg: { count: number; studies: number; hours: number };
}): string {
  return `
    <div style="width:800px;padding:34px 42px 28px;background:#ffffff;color:#000000;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;line-height:1.4;">
      <div style="text-align:center;font-size:19px;font-weight:700;margin-bottom:4px;">
        RELATÓRIO DE SERVIÇO DE CAMPO E DE ASSISTÊNCIA
      </div>
      <div style="text-align:center;font-size:19px;font-weight:700;margin-bottom:24px;">
        ÀS REUNIÕES DA CONGREGAÇÃO
      </div>
      <div style="display:flex;justify-content:space-between;gap:18px;margin-bottom:22px;font-size:14px;">
        <div style="flex:1;">
          <strong>Congregação:</strong>
          <span style="border-bottom:1px dotted #000;padding:0 8px 2px;display:inline-block;min-width:210px;">${escapeHtml(params.congregationName)}</span>
        </div>
        <div>
          <strong>Nº:</strong>
          <span style="border-bottom:1px dotted #000;padding:0 8px 2px;display:inline-block;min-width:70px;text-align:center;">${escapeHtml(params.congregationNumber || '—')}</span>
        </div>
        <div>
          <strong>Mês:</strong>
          <span style="border-bottom:1px dotted #000;padding:0 8px 2px;display:inline-block;min-width:140px;text-align:center;">${escapeHtml(params.monthLabel)}</span>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;border:2px solid #000000;margin-bottom:20px;">
        <thead>
          <tr>
            <th style="width:36%;border:1px solid #000;border-bottom:2px solid #000;padding:9px;"></th>
            <th style="width:21%;border:1px solid #000;border-bottom:2px solid #000;padding:9px;font-weight:600;text-align:center;font-size:13.5px;">Quantos<br/>relataram</th>
            <th style="width:21%;border:1px solid #000;border-bottom:2px solid #000;padding:9px;font-weight:600;text-align:center;font-size:13.5px;">Estudos<br/>bíblicos</th>
            <th style="width:22%;border:1px solid #000;border-bottom:2px solid #000;padding:9px;font-weight:600;text-align:center;font-size:13.5px;">Horas</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border:1px solid #000;padding:11px 10px;font-size:14.5px;">Publicadores</td>
            <td style="border:1px solid #000;padding:11px 10px;text-align:center;font-size:15.5px;font-weight:600;">${escapeHtml(params.pubs.count)}</td>
            <td style="border:1px solid #000;padding:11px 10px;text-align:center;font-size:15.5px;">${escapeHtml(params.pubs.studies)}</td>
            <td style="border:1px solid #000;padding:11px 10px;background:#9ca3af;"></td>
          </tr>
          <tr>
            <td style="border:1px solid #000;padding:11px 10px;font-size:14.5px;">Pioneiros auxiliares</td>
            <td style="border:1px solid #000;padding:11px 10px;text-align:center;font-size:15.5px;font-weight:600;">${escapeHtml(params.aux.count)}</td>
            <td style="border:1px solid #000;padding:11px 10px;text-align:center;font-size:15.5px;">${escapeHtml(params.aux.studies)}</td>
            <td style="border:1px solid #000;padding:11px 10px;text-align:center;font-size:15.5px;">${escapeHtml(params.aux.hours)}</td>
          </tr>
          <tr>
            <td style="border:1px solid #000;padding:11px 10px;font-size:14.5px;">Pioneiros regulares / especiais</td>
            <td style="border:1px solid #000;padding:11px 10px;text-align:center;font-size:15.5px;font-weight:600;">${escapeHtml(params.reg.count)}</td>
            <td style="border:1px solid #000;padding:11px 10px;text-align:center;font-size:15.5px;">${escapeHtml(params.reg.studies)}</td>
            <td style="border:1px solid #000;padding:11px 10px;text-align:center;font-size:15.5px;">${escapeHtml(params.reg.hours)}</td>
          </tr>
        </tbody>
      </table>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:28px;">
        <div style="display:flex;border:2px solid #000;width:260px;">
          <div style="padding:8px 10px;border-right:1px solid #000;flex:1;font-size:13.5px;">Publicadores ativos</div>
          <div style="width:76px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;">${escapeHtml(params.activePublishers)}</div>
        </div>
        <div style="width:260px;border-top:1px dotted #000;text-align:center;padding-top:5px;font-size:12.5px;color:#374151;">
          (Secretário)
        </div>
      </div>
      <div style="font-size:12px;color:#374151;">S-1-T&nbsp;&nbsp;11/23</div>
    </div>
  `;
}

function extractPartNumber(text: string): string | null {
  const m = text.match(/^(\d+)/);
  return m ? m[1] : null;
}

function resolveS89CardParams(part: WorkbookPart, weekParts: WorkbookPart[]) {
  const isAjudante = part.funcao === 'Ajudante';
  const currentNum = extractPartNumber(part.tituloParte || part.tipoParte || '');
  let partForPdf: WorkbookPart = part;
  let assistantName: string | undefined;

  if (isAjudante) {
    const titular = weekParts.find((p) => {
      const pNum = extractPartNumber(p.tituloParte || p.tipoParte || '');
      return (pNum && pNum === currentNum || p.tipoParte === part.tipoParte) && p.funcao === 'Titular' && p.id !== part.id;
    });
    if (titular) {
      partForPdf = titular;
      assistantName = part.resolvedPublisherName || part.rawPublisherName || undefined;
    }
  } else {
    const assistant = weekParts.find((p) => {
      const pNum = extractPartNumber(p.tituloParte || p.tipoParte || '');
      return (pNum && pNum === currentNum || p.tipoParte === part.tipoParte) && p.funcao === 'Ajudante' && p.id !== part.id;
    });
    assistantName = assistant?.resolvedPublisherName || assistant?.rawPublisherName || undefined;
  }

  const pType = (part.tipoParte || '').toLowerCase();
  const pSection = (part.section || '').toLowerCase();
  const isStudent =
    pSection.includes('ministério') ||
    pSection.includes('ministerio') ||
    pType.includes('leitura') ||
    pType.includes('conversa') ||
    pType.includes('revisita') ||
    pType.includes('estudo') ||
    pType.includes('discípulos') ||
    pType.includes('crenças');

  return { partForPdf, assistantName, isStudent };
}

export const documentPort = {
  /**
   * Prepara lista cronológica de programações S-140
   */
  async getS140ChronologicalList(
    targetWeekId?: string,
    allPublishers: Publisher[] = []
  ): Promise<DocumentCarouselItem[]> {
    try {
      const { data: rawData, error } = await supabase
        .from('workbook_parts')
        .select('*')
        .order('week_id', { ascending: true })
        .order('seq', { ascending: true });

      let partsList: WorkbookPart[] = [];
      if (!error && rawData && rawData.length > 0) {
        partsList = rawData.map((row) => mapDbToWorkbookPart(row as Record<string, unknown>));
      } else {
        const { data: rpcData } = await supabase.rpc('get_my_workbook_parts');
        if (Array.isArray(rpcData)) {
          partsList = rpcData
            .map((row) => mapDbToWorkbookPart(row as Record<string, unknown>))
            .sort((a, b) => a.weekId.localeCompare(b.weekId) || (a.seq || 0) - (b.seq || 0));
        }
      }

      if (!partsList.length) return [];

      const byWeek = new Map<string, WorkbookPart[]>();
      for (const p of partsList) {
        if (!p.weekId) continue;
        if (!byWeek.has(p.weekId)) byWeek.set(p.weekId, []);
        byWeek.get(p.weekId)!.push(p);
      }

      const todayMonday = getTodayWeekIdLocal();
      const allWeekIds = Array.from(byWeek.keys()).sort();
      // Prioriza horizonte atual/futuro se existir; mantém ao menos as últimas semanas caso só haja histórico
      const futureWeeks = allWeekIds.filter((w) => w >= todayMonday);
      const weekIds = futureWeeks.length > 0 ? futureWeeks : allWeekIds.slice(-6);

      const effectiveFocus =
        (targetWeekId && weekIds.includes(targetWeekId) ? targetWeekId : undefined) ||
        weekIds.find((w) => w >= todayMonday) ||
        weekIds[0];

      const { prepareS140UnifiedData, renderS140ToElement } = await import('../../../services/s140GeneratorUnified');

      const items: DocumentCarouselItem[] = [];
      for (const wid of weekIds) {
        const weekParts = byWeek.get(wid)!;
        const formattedDate = formatDateBr(wid);
        let html: string | undefined;

        try {
          const unifiedData = await prepareS140UnifiedData(weekParts, allPublishers);
          html = renderS140ToElement(unifiedData).outerHTML;
        } catch (err) {
          console.warn(`[DocumentPort] Fallback de HTML S-140 para ${wid}:`, err);
          html = `<div style="width:800px;padding:24px;font-family:sans-serif;color:#111827;box-sizing:border-box;">Semana ${escapeHtml(formattedDate)} — visualização simplificada (${weekParts.length} partes)</div>`;
        }

        items.push({
          id: `s140-${wid}`,
          docType: 's140',
          title: `Programação S-140 · Semana de ${formattedDate}`,
          subtitle: `${weekParts.length} partes programadas`,
          dateStr: formattedDate,
          htmlContent: html,
          naturalWidth: 800,
          isInitialFocus: wid === effectiveFocus,
        });
      }

      return items;
    } catch (e) {
      console.error('[DocumentPort] Erro ao gerar lista cronológica S-140:', e);
      return [];
    }
  },

  /**
   * Prepara lista cronológica de designações S-89
   */
  async getS89ChronologicalList(
    publisherId?: string,
    targetWeekId?: string,
    isSelf: boolean = false
  ): Promise<DocumentCarouselItem[]> {
    try {
      const todayMonday = getTodayWeekIdLocal();
      let allParts: WorkbookPart[] = [];

      if (isSelf) {
        const { data: rpcData } = await supabase.rpc('get_my_workbook_parts');
        if (Array.isArray(rpcData)) {
          allParts = rpcData.map((row) => mapDbToWorkbookPart(row as Record<string, unknown>));
        }
      }

      if (!allParts.length) {
        let query = supabase
          .from('workbook_parts')
          .select('*')
          .gte('week_id', todayMonday)
          .neq('status', WorkbookStatus.CANCELADA)
          .order('week_id', { ascending: true })
          .order('seq', { ascending: true });

        if (targetWeekId && !publisherId) {
          query = query.eq('week_id', targetWeekId);
        }

        const { data, error } = await query;
        if (!error && data) {
          allParts = data.map((row) => mapDbToWorkbookPart(row as Record<string, unknown>));
        }
      }

      const targetParts = allParts.filter((part) => {
        if (part.weekId < todayMonday) return false;
        if (part.status === WorkbookStatus.CANCELADA || part.isChairmanDerived) return false;
        if (!isManuallyAssignable(part.tipoParte)) return false;
        if (publisherId) return part.resolvedPublisherId === publisherId;
        if (targetWeekId) return part.weekId === targetWeekId;
        return Boolean(part.resolvedPublisherId || part.resolvedPublisherName);
      });

      if (!targetParts.length) return [];

      const byWeek = new Map<string, WorkbookPart[]>();
      for (const p of allParts) {
        if (!byWeek.has(p.weekId)) byWeek.set(p.weekId, []);
        byWeek.get(p.weekId)!.push(p);
      }

      const { generateS89PngBase64 } = await import('../../../services/s89Generator');
      const sortedTargets = [...targetParts].sort(
        (a, b) => a.weekId.localeCompare(b.weekId) || (a.seq || 0) - (b.seq || 0)
      );

      const items: DocumentCarouselItem[] = [];
      for (const part of sortedTargets.slice(0, 12)) {
        const weekParts = byWeek.get(part.weekId) || [];
        const { partForPdf, assistantName, isStudent } = resolveS89CardParams(part, weekParts);
        const dateBr = formatDateBr(part.date || part.weekId);
        const assigneeName = part.resolvedPublisherName || part.rawPublisherName || 'Designado';
        const titularName = partForPdf.resolvedPublisherName || partForPdf.rawPublisherName || assigneeName;
        const roomLabel = part.modalidade?.toLowerCase().includes('b') ? 'Sala auxiliar B' : 'Salão Principal';
        let imgBase64: string | undefined;

        try {
          imgBase64 = (await generateS89PngBase64(partForPdf, assistantName, undefined, isStudent)) || undefined;
        } catch (err) {
          console.warn(`[DocumentPort] Falha ao renderizar PNG S-89 de ${part.id}:`, err);
        }

        const fallbackHtml = !imgBase64
          ? renderS89FallbackHtml(
              titularName,
              assistantName,
              dateBr,
              partForPdf.tituloParte || partForPdf.tipoParte || 'Designação',
              roomLabel,
              isStudent
            )
          : undefined;

        items.push({
          id: `s89-${part.id}`,
          docType: 's89',
          title: `S-89 · ${part.tipoParte || 'Designação'}`,
          subtitle: `${assigneeName} (${part.funcao}) · ${dateBr}`,
          dateStr: dateBr,
          imageBase64: imgBase64,
          htmlContent: fallbackHtml,
          naturalWidth: 460,
          isInitialFocus: targetWeekId ? part.weekId === targetWeekId : items.length === 0,
        });
      }

      return items;
    } catch (e) {
      console.error('[DocumentPort] Erro ao buscar S-89s:', e);
      return [];
    }
  },

  /**
   * Prepara lista cronológica de cartões S-4 (Relatório de Serviço de Campo)
   */
  async getS4ChronologicalList(
    publisherName?: string,
    monthSlot?: string
  ): Promise<DocumentCarouselItem[]> {
    try {
      const { rmService } = await import('../../../services/rm/rmService');
      const rmPubs = await rmService.listPublishers().catch(() => []);
      if (!rmPubs.length) return [];

      let targetPub = rmPubs[0];
      if (publisherName) {
        const q = normalizeSearchName(publisherName);
        const exact = rmPubs.find((p) => normalizeSearchName(p.name) === q);
        const partial = rmPubs.find((p) => normalizeSearchName(p.name).includes(q));
        if (!exact && !partial) return [];
        targetPub = exact || partial!;
      }

      const reports = await rmService.listReports({ publisher_id: targetPub.id }).catch(() => []);
      if (!reports.length) return [];

      const chronological = [...reports]
        .sort((a, b) => a.reference_year - b.reference_year || a.reference_month - b.reference_month)
        .slice(-12);

      const targetMonth = resolveTargetMonthNumber(monthSlot);
      let focusIdx = chronological.length - 1;
      if (targetMonth) {
        const foundIdx = chronological.findIndex((r) => r.reference_month === targetMonth);
        if (foundIdx >= 0) focusIdx = foundIdx;
      }

      return chronological.map((rep, idx) => {
        const monthName = MONTHS_PT[(rep.reference_month || 1) - 1] || String(rep.reference_month);
        const monthLabel = `${monthName} de ${rep.reference_year}`;
        const dateStr = `${String(rep.reference_month).padStart(2, '0')}/${rep.reference_year}`;

        return {
          id: `s4-${rep.id}`,
          docType: 's4',
          title: `Cartão S-4 · ${monthLabel}`,
          subtitle: targetPub.name,
          dateStr,
          naturalWidth: 480,
          isInitialFocus: idx === focusIdx,
          htmlContent: renderS4CardHtml({
            publisherName: targetPub.name,
            monthLabel,
            hasPreached: Boolean(rep.has_preached),
            bibleStudies: rep.bible_studies || 0,
            hours: rep.hours,
            notes: rep.notes,
          }),
        };
      });
    } catch (e) {
      console.warn('[DocumentPort] Falha ao gerar lista S-4:', e);
      return [];
    }
  },

  /**
   * Prepara lista cronológica de folhas S-1 (Consolidação Mensal da Congregação)
   */
  async getS1ChronologicalList(monthSlot?: string): Promise<DocumentCarouselItem[]> {
    try {
      const { rmService } = await import('../../../services/rm/rmService');
      const [congs, pubs, allReports] = await Promise.all([
        rmService.listCongregations().catch(() => []),
        rmService.listPublishers().catch(() => []),
        rmService.listReports().catch(() => []),
      ]);

      if (!allReports.length) return [];

      const cong = congs[0];
      const congName = cong?.name || 'Parque Jacaraípe';
      const congNumber = cong?.number || '';
      const activePubsCount = pubs.filter((p) => p.is_congregated).length;

      const pubById = new Map(pubs.map((p) => [p.id, p]));
      const byPeriod = new Map<string, typeof allReports>();

      for (const rep of allReports) {
        const key = `${rep.reference_year}-${String(rep.reference_month).padStart(2, '0')}`;
        const list = byPeriod.get(key) || [];
        list.push(rep);
        byPeriod.set(key, list);
      }

      const sortedKeys = Array.from(byPeriod.keys()).sort().slice(-12);
      const targetMonth = resolveTargetMonthNumber(monthSlot);
      let focusIdx = sortedKeys.length - 1;
      if (targetMonth) {
        const mm = String(targetMonth).padStart(2, '0');
        const idx = sortedKeys.findIndex((k) => k.endsWith(`-${mm}`));
        if (idx >= 0) focusIdx = idx;
      }

      return sortedKeys.map((key, idx) => {
        const [yStr, mStr] = key.split('-');
        const year = Number(yStr);
        const month = Number(mStr);
        const monthName = MONTHS_PT[month - 1] || mStr;
        const monthLabel = `${monthName} de ${year}`;
        const periodReports = (byPeriod.get(key) || []).filter((r) => r.has_preached);

        const pubsAgg = { count: 0, studies: 0 };
        const auxAgg = { count: 0, studies: 0, hours: 0 };
        const regAgg = { count: 0, studies: 0, hours: 0 };

        for (const r of periodReports) {
          const pub = pubById.get(r.publisher_id);
          const isReg = Boolean(r.is_regular_pioneer || r.is_special_pioneer || pub?.is_regular_pioneer || pub?.is_special_pioneer);
          const isAux = !isReg && Boolean(r.is_auxiliary_pioneer);

          if (isReg) {
            regAgg.count += 1;
            regAgg.studies += r.bible_studies || 0;
            regAgg.hours += Number(r.hours || 0);
          } else if (isAux) {
            auxAgg.count += 1;
            auxAgg.studies += r.bible_studies || 0;
            auxAgg.hours += Number(r.hours || 0);
          } else {
            pubsAgg.count += 1;
            pubsAgg.studies += r.bible_studies || 0;
          }
        }

        return {
          id: `s1-${key}`,
          docType: 's1',
          title: `Consolidação S-1 · ${monthLabel}`,
          subtitle: `${periodReports.length} relatórios computados`,
          dateStr: `${mStr}/${yStr}`,
          naturalWidth: 800,
          isInitialFocus: idx === focusIdx,
          htmlContent: renderS1SheetHtml({
            congregationName: congName,
            congregationNumber: congNumber,
            monthLabel,
            activePublishers: activePubsCount,
            pubs: pubsAgg,
            aux: auxAgg,
            reg: regAgg,
          }),
        };
      });
    } catch (e) {
      console.warn('[DocumentPort] Falha ao gerar lista S-1:', e);
      return [];
    }
  },
};
