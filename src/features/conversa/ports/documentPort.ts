/**
 * DocumentPort — Adaptador de Documentos Oficiais para o Carrossel Cronológico
 *
 * Busca e prepara formulários oficiais (S-140 e S-89) ordenados cronologicamente,
 * usando o schema real (`seq`, `resolved_publisher_id`, `mapDbToWorkbookPart`)
 * e carregamento dinâmico dos geradores para evitar impacto em SSR/testes Node.
 */

import { supabase } from '../../../lib/supabase';
import { WorkbookStatus, type Publisher, type WorkbookPart } from '../../../types';
import { mapDbToWorkbookPart } from '../../../services/workbookService';
import { getTodayWeekIdLocal } from '../../../utils/dateUtils';
import { isManuallyAssignable } from '../../../constants/s140Template';

export interface DocumentCarouselItem {
  id: string;
  docType: 's140' | 's89' | 's4' | 's1' | 'pdf';
  title: string;
  subtitle: string;
  dateStr: string;
  htmlContent?: string;
  imageBase64?: string;
  isInitialFocus?: boolean;
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
        let html: string | undefined;

        try {
          const unifiedData = await prepareS140UnifiedData(weekParts, allPublishers);
          html = renderS140ToElement(unifiedData).outerHTML;
        } catch (err) {
          console.warn(`[DocumentPort] Fallback de HTML S-140 para ${wid}:`, err);
          html = `<div style="padding: 20px; font-family: sans-serif; color: #111827;">Semana ${wid} — visualização simplificada (${weekParts.length} partes)</div>`;
        }

        const dateParts = wid.split('-');
        const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : wid;

        items.push({
          id: `s140-${wid}`,
          docType: 's140',
          title: `Programação S-140 · Semana de ${formattedDate}`,
          subtitle: `${weekParts.length} partes programadas`,
          dateStr: wid,
          htmlContent: html,
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
        let imgBase64: string | undefined;

        try {
          imgBase64 = (await generateS89PngBase64(partForPdf, assistantName, undefined, isStudent)) || undefined;
        } catch (err) {
          console.warn(`[DocumentPort] Falha ao renderizar PNG S-89 de ${part.id}:`, err);
        }

        items.push({
          id: `s89-${part.id}`,
          docType: 's89',
          title: `S-89 · ${part.tipoParte || 'Designação'}`,
          subtitle: `${part.resolvedPublisherName || part.rawPublisherName || 'Designado'} (${part.funcao}) · ${part.weekId}`,
          dateStr: part.weekId,
          imageBase64: imgBase64,
          isInitialFocus: targetWeekId ? part.weekId === targetWeekId : items.length === 0,
        });
      }

      return items;
    } catch (e) {
      console.error('[DocumentPort] Erro ao buscar S-89s:', e);
      return [];
    }
  },
};
