import { supabase } from '../lib/supabase';
import { generationService } from './generationService';
import { workbookService } from './workbookService';
import type { Publisher, WorkbookPart } from '../types';

export interface ReassignResult {
    success: boolean;
    partsGenerated: number;
    warnings: string[];
}

/**
 * Reatribui um conjunto de parts: limpa assignee, roda motor restrito às semanas
 * afetadas, e remove o flag needs_reassignment. Reutilizado pelos banners
 * de Disponibilidade e Confirmação.
 */
export async function reassignParts(
    partIds: string[],
    publishers: Publisher[],
    workbookParts: WorkbookPart[],
    onPartsRefresh?: () => Promise<void> | void,
): Promise<ReassignResult> {
    if (partIds.length === 0) {
        return { success: true, partsGenerated: 0, warnings: [] };
    }
    const idsSet = new Set(partIds);
    const toClear = workbookParts.filter(p => idsSet.has(p.id));

    // 1) Limpa parts conflitantes (PENDENTE + null assignee)
    for (const part of toClear) {
        await workbookService.updatePart(part.id, {
            resolvedPublisherId: null as any,
            resolvedPublisherName: null as any,
            rawPublisherName: '',
            status: 'PENDENTE' as any,
        });
    }

    const cleared: WorkbookPart[] = toClear.map(p => ({
        ...p,
        resolvedPublisherId: null as any,
        resolvedPublisherName: null as any,
        rawPublisherName: '',
        status: 'PENDENTE' as any,
    }));

    const refreshedParts = (workbookParts || []).map(p =>
        idsSet.has(p.id) ? cleared.find(c => c.id === p.id)! : p,
    );

    // 2) Roda motor restrito às semanas das parts limpadas para evitar
    // efeitos colaterais em outras semanas (partes já designadas não são tocadas).
    const weekIds = [...new Set(toClear.map(p => p.weekId).filter(Boolean))];
    const result = await generationService.generateDesignations(refreshedParts, publishers, {
        isDryRun: false,
        generationWeeks: weekIds.length > 0 ? weekIds : undefined,
    });

    // 3) Limpa flags needs_reassignment apenas se a geração produziu resultado.
    // Se partsGenerated === 0 o publicador não foi encontrado; manter o flag
    // ativo para que o banner continue visível e o admin possa agir manualmente.
    if (result.partsGenerated > 0) {
        for (const partId of partIds) {
            try { await supabase.rpc('clear_part_reassignment_flag', { p_part_id: partId }); }
            catch (e) { console.warn('[reassignmentService] clear flag err:', e); }
        }
    }

    // 4) Refresca workbook
    if (onPartsRefresh) await onPartsRefresh();

    return {
        success: result.success,
        partsGenerated: result.partsGenerated,
        warnings: result.warnings ?? [],
    };
}
