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
            matchConfidence: 0,
        });
    }

    const cleared: WorkbookPart[] = toClear.map(p => ({
        ...p,
        resolvedPublisherId: null as any,
        resolvedPublisherName: null as any,
        rawPublisherName: '',
        status: 'PENDENTE' as any,
        matchConfidence: 0,
    }));

    const refreshedParts = (workbookParts || []).map(p =>
        idsSet.has(p.id) ? cleared.find(c => c.id === p.id)! : p,
    );

    // 2) Roda motor SEM generationWeeks para não forçar re-geração de parts
    // já designadas em outras posições da mesma semana. As parts limpadas no
    // passo 1 estão com status PENDENTE; o motor as encontra naturalmente.
    const result = await generationService.generateDesignations(refreshedParts, publishers, {
        isDryRun: false,
    });

    // 3) Limpa flags needs_reassignment para parts agora resolvidas
    for (const partId of partIds) {
        try { await supabase.rpc('clear_part_reassignment_flag', { p_part_id: partId }); }
        catch (e) { console.warn('[reassignmentService] clear flag err:', e); }
    }

    // 4) Refresca workbook
    if (onPartsRefresh) await onPartsRefresh();

    return {
        success: result.success,
        partsGenerated: result.partsGenerated,
        warnings: result.warnings ?? [],
    };
}
