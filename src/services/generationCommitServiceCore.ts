import type { WorkbookPart } from '../types';
import { isCleanablePart } from '../constants/mappings';

export interface GeneratedPublisherSelection {
    id: string;
    name: string;
}

export interface GenerationCommitDependencies {
    localNeedsClient: {
        assignToPart: (preassignmentId: string, partId: string) => Promise<unknown>;
    };
    workbookMutations: {
        updatePart: (partId: string, updates: Record<string, unknown>) => Promise<unknown>;
    };
    workbookAssignments: {
        assignPublisher: (partId: string, publisherName: string, publisherId?: string, isManual?: boolean) => Promise<unknown>;
    };
}

export function createGenerationCommitService(dependencies: GenerationCommitDependencies) {
    return {
        async commitGeneratedAssignment(input: {
            partId: string;
            part?: WorkbookPart;
            publisher: GeneratedPublisherSelection;
            localNeedsTheme?: string;
            preassignmentId?: string;
        }) {
            const { partId, part, publisher, localNeedsTheme, preassignmentId } = input;

            if (preassignmentId && localNeedsTheme) {
                await dependencies.localNeedsClient.assignToPart(preassignmentId, partId);
                await dependencies.workbookMutations.updatePart(partId, {
                    tituloParte: `Necessidades Locais: ${localNeedsTheme}`,
                });
            }

            if (!part) {
                return { committed: true, mode: 'noop' as const };
            }

            if (publisher.id === 'CLEANUP' && publisher.name === '') {
                // Cântico limpo fica CONCLUIDA (não é designável); designação inválida removida volta a PENDENTE para ser refeita.
                const isSong = isCleanablePart(part.tipoParte);
                await dependencies.workbookMutations.updatePart(partId, {
                    resolvedPublisherName: null,
                    resolvedPublisherId: null,
                    rawPublisherName: '',
                    status: isSong ? 'CONCLUIDA' : 'PENDENTE',
                });
                return { committed: true, mode: isSong ? ('cleanup' as const) : ('cleanup-invalid' as const) };
            }

            if (part.status === 'PENDENTE' || part.status === 'PROPOSTA') {
                // Gerado pelo motor automático: is_manual_override = false
                await dependencies.workbookAssignments.assignPublisher(partId, publisher.name, publisher.id, false);
                return { committed: true, mode: 'proposal' as const };
            }

            await dependencies.workbookMutations.updatePart(partId, {
                resolvedPublisherName: publisher.name,
                ...(publisher.id && publisher.id !== 'preassigned' ? { resolvedPublisherId: publisher.id } : {}),
            });
            return { committed: true, mode: 'direct-update' as const };
        },
    };
}