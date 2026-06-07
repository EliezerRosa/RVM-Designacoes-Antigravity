import { supabase } from '../lib/supabase';
import { loadCompletedParticipations } from './historyAdapter';
import { getRankedEligibleForPart, type RankedEligibleCandidate } from './rankedEligibleService';
import { workbookAssignmentService } from './workbookAssignmentService';
import { workbookService } from './workbookService';
import type { HistoryRecord, Publisher, WorkbookPart } from '../types';

export interface ReassignResult {
    success: boolean;
    partsGenerated: number;
    warnings: string[];
}

export interface ReassignmentSuggestion {
    targetPart: WorkbookPart;
    selectedPublisher: Publisher | null;
    rankedCandidates: RankedEligibleCandidate[];
}

function clearPartLocally(part: WorkbookPart): WorkbookPart {
    return {
        ...part,
        resolvedPublisherId: null as any,
        resolvedPublisherName: '',
        rawPublisherName: '',
        status: 'PENDENTE' as any,
    };
}

/**
 * Consulta pura do motor para uma única parte, sem escrever no banco.
 * Sempre usa o estado atual da semana foco e retorna a fila canônica já ordenada.
 */
export async function consultReassignmentSuggestion(
    targetPart: WorkbookPart,
    workbookParts: WorkbookPart[],
    publishers: Publisher[],
    history: HistoryRecord[] = [],
): Promise<ReassignmentSuggestion> {
    const weekParts = workbookParts.filter(part => part.weekId === targetPart.weekId);
    const rankedResult = getRankedEligibleForPart(
        targetPart,
        weekParts,
        publishers,
        history,
        {
            applyEngineRules: true,
            excludeAssignedInSameWeek: true,
        },
    );

    return {
        targetPart,
        selectedPublisher: rankedResult.eligibleCandidates[0]?.publisher || null,
        rankedCandidates: rankedResult.eligibleCandidates,
    };
}

/**
 * Reatribui um conjunto de parts de forma cirúrgica: consulta o motor por parte,
 * aplica apenas o candidato escolhido naquele slot e remove o flag
 * needs_reassignment somente quando houve redistribuição real.
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

    const history = await loadCompletedParticipations();
    const idsSet = new Set(partIds);
    let workingParts = workbookParts.map(part => idsSet.has(part.id) ? clearPartLocally(part) : part);
    const warnings: string[] = [];
    let partsGenerated = 0;

    for (const partId of partIds) {
        const currentPart = workingParts.find(part => part.id === partId);
        if (!currentPart) {
            warnings.push(`Parte ${partId} não encontrada para reatribuição.`);
            continue;
        }

        try {
            // 1) Limpa apenas a parte alvo no banco e na visão local.
            await workbookService.updatePart(partId, {
                resolvedPublisherId: null as any,
                resolvedPublisherName: null as any,
                rawPublisherName: '',
                status: 'PENDENTE' as any,
            });

            workingParts = workingParts.map(part =>
                part.id === partId ? clearPartLocally(part) : part,
            );

            // 2) Consulta o motor somente para a parte atual, com o estado já limpo.
            const suggestion = await consultReassignmentSuggestion(
                workingParts.find(part => part.id === partId) || clearPartLocally(currentPart),
                workingParts,
                publishers,
                history,
            );

            if (!suggestion.selectedPublisher) {
                warnings.push(`Sem candidato elegível para ${currentPart.tipoParte} (${currentPart.weekDisplay}).`);
                continue;
            }

            // 3) Comita apenas a parte rejeitada.
            const updatedPart = await workbookAssignmentService.assignPublisher(
                partId,
                suggestion.selectedPublisher.name,
                suggestion.selectedPublisher.id,
                false,
            );

            partsGenerated += 1;
            workingParts = workingParts.map(part =>
                part.id === partId
                    ? {
                        ...part,
                        resolvedPublisherId: updatedPart.resolvedPublisherId,
                        resolvedPublisherName: updatedPart.resolvedPublisherName || '',
                        rawPublisherName: updatedPart.rawPublisherName || '',
                        status: updatedPart.status,
                    }
                    : part,
            );

            try {
                await supabase.rpc('clear_part_reassignment_flag', { p_part_id: partId });
            } catch (e) {
                console.warn('[reassignmentService] clear flag err:', e);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            warnings.push(`Erro ao reatribuir ${currentPart.tipoParte}: ${message}`);
        }
    }

    // 4) Refresca workbook
    if (onPartsRefresh) await onPartsRefresh();

    return {
        success: true,
        partsGenerated,
        warnings,
    };
}
