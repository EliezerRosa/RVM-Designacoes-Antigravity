/**
 * DocumentPort — Adaptador de Documentos Oficiais para o Carrossel Cronológico
 *
 * Busca e prepara formulários oficiais (S-140, S-89, S-4, S-1 e PDFs)
 * ordenados rigorosamente pelo tempo, identificando o item de foco solicitado.
 */

import { supabase } from '../../../lib/supabase';
import type { Publisher, WorkbookPart } from '../../../types';
import { prepareS140UnifiedData, generateS140UnifiedHTML } from '../../../services/s140GeneratorUnified';
import { generateS89PngBase64 } from '../../../services/s89Generator';

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

export const documentPort = {
  /**
   * Prepara lista cronológica de programações S-140
   */
  async getS140ChronologicalList(
    targetWeekId?: string,
    allPublishers: Publisher[] = []
  ): Promise<DocumentCarouselItem[]> {
    try {
      // Buscar semanas com partes importadas
      const { data: partsData } = await supabase
        .from('workbook_parts')
        .select('*')
        .order('week_id', { ascending: true })
        .order('order_index', { ascending: true });

      if (!partsData || !partsData.length) return [];

      // Agrupar por semana
      const byWeek = new Map<string, WorkbookPart[]>();
      for (const p of partsData) {
        const wid = p.week_id;
        if (!byWeek.has(wid)) byWeek.set(wid, []);
        byWeek.get(wid)!.push(p as WorkbookPart);
      }

      const weekIds = Array.from(byWeek.keys()).sort();
      const today = new Date().toISOString().split('T')[0];
      const effectiveFocus = targetWeekId || weekIds.find((w) => w >= today) || weekIds[0];

      const items: DocumentCarouselItem[] = [];

      for (const wid of weekIds) {
        const weekParts = byWeek.get(wid)!;
        let html: string | undefined;

        try {
          const unifiedData = await prepareS140UnifiedData(weekParts, allPublishers);
          html = generateS140UnifiedHTML(unifiedData);
        } catch {
          html = `<div style="padding: 20px; font-family: sans-serif;">Semana ${wid} — visualização simplificada</div>`;
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
   * Prepara lista cronológica de designações S-89 de um publicador
   */
  async getS89ChronologicalList(
    publisherId?: string,
    targetWeekId?: string
  ): Promise<DocumentCarouselItem[]> {
    try {
      let query = supabase.from('workbook_parts').select('*');
      if (publisherId) {
        query = query.or(`assignee_id.eq.${publisherId},assistant_id.eq.${publisherId}`);
      }

      const { data, error } = await query.order('week_id', { ascending: true });
      if (error || !data || !data.length) return [];

      const items: DocumentCarouselItem[] = [];

      for (const part of data) {
        const wid = part.week_id;
        let imgBase64: string | undefined;

        try {
          imgBase64 = (await generateS89PngBase64(part as WorkbookPart)) || undefined;
        } catch {
          // Fallback se não conseguir renderizar imagem
        }

        items.push({
          id: `s89-${part.id}`,
          docType: 's89',
          title: `S-89 · ${part.tipo_parte || part.tipoParte || 'Parte de Estudante'}`,
          subtitle: `${part.assignee_name || 'Designado'} · ${wid}`,
          dateStr: wid,
          imageBase64: imgBase64,
          isInitialFocus: wid === targetWeekId,
        });
      }

      return items;
    } catch (e) {
      console.error('[DocumentPort] Erro ao buscar S-89s:', e);
      return [];
    }
  },
};
