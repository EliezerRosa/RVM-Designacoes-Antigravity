import type { WorkbookPart } from '../types';

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
                await dependencies.workbookMutations.updatePart(partId, {
                    resolvedPublisherName: null,
                    rawPublisherName: '',
                    status: 'CONCLUIDA',
                });
                return { committed: true, mode: 'cleanup' as const };
            }

            if (part.status === 'PENDENTE' || part.status === 'PROPOSTA') {
                // Gerado pelo motor automático: is_manual_override = false
                await dependencies.workbookAssignments.assignPublisher(partId, publisher.name, publisher.id, false);
                return { committed: true, mode: 'proposal' as const };
            }

            await dependencies.workbookMutations.updatePart(partId, {
                resolvedPublisherName: publisher.name,
            });
            return { committed: true, mode: 'direct-update' as const };
        },
    };
}