import type { ImpedimentEntry } from './publisherImpedimentService';
import { workbookService } from './workbookService';

export interface ReflectionResult {
    processed: number;
    failed: number;
}

function buildReflectionReason(publisherName: string, impedimentReason: string): string {
    return `Reflexao automatica de privilegios: ${publisherName} ficou inelegivel para esta designacao (${impedimentReason}).`;
}

/**
 * Marca designações afetadas como pendentes/rejeitadas para revisão humana.
 * Centraliza a regra para App e PublisherStatusForm usarem o mesmo fluxo.
 */
export async function reflectPublisherImpediments(
    publisherName: string,
    impediments: ImpedimentEntry[]
): Promise<ReflectionResult> {
    const unique = Array.from(new Map(impediments.map(item => [item.part.id, item])).values());
    if (unique.length === 0) return { processed: 0, failed: 0 };

    const settled = await Promise.allSettled(
        unique.map(({ part, reason }) =>
            workbookService.rejectProposal(part.id, buildReflectionReason(publisherName, reason))
        )
    );

    const failed = settled.filter(result => result.status === 'rejected').length;
    return {
        processed: unique.length - failed,
        failed,
    };
}