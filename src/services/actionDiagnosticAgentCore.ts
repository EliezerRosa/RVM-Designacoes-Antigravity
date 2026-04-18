import { HistoryStatus, type Publisher, type WorkbookPart, type HistoryRecord } from '../types';

export interface LiveFixtures {
    publishers: Publisher[];
    parts: WorkbookPart[];
    history: HistoryRecord[];
    firstWeekId: string | null;
    firstPartId: string | null;
    firstPublisherName: string | null;
    firstPartWithAssignment: WorkbookPart | null;
    firstPartWithoutAssignment: WorkbookPart | null;
}

interface PublisherDirectoryReader {
    loadAllPublishers(): Promise<Publisher[]>;
}

interface WorkbookQueryReader {
    getAllParts(): Promise<WorkbookPart[]>;
}

interface WorkbookMutationWriter {
    updatePart(partId: string, updates: Record<string, unknown>): Promise<unknown>;
}

interface PublisherAvailabilityWriter {
    replaceExceptionDates(publisher: Publisher, dates: string[]): Promise<unknown>;
}

interface ActionResultLike {
    success: boolean;
    data?: {
        partId?: string;
    };
}

export function createActionDiagnosticAgentSupport(dependencies: {
    publisherDirectoryReader: PublisherDirectoryReader;
    workbookReader: WorkbookQueryReader;
    workbookMutations: WorkbookMutationWriter;
    publisherAvailabilityMutations: PublisherAvailabilityWriter;
}) {
    return {
        async loadLiveFixtures(): Promise<LiveFixtures> {
            let publishers: Publisher[] = [];
            let parts: WorkbookPart[] = [];

            try {
                publishers = await dependencies.publisherDirectoryReader.loadAllPublishers();
            } catch (error) {
                console.warn('[Diagnostic] Falha ao carregar publicadores:', error);
            }

            try {
                parts = await dependencies.workbookReader.getAllParts();
            } catch (error) {
                console.warn('[Diagnostic] Falha ao carregar partes:', error);
            }

            const history: HistoryRecord[] = parts
                .filter(part => part.resolvedPublisherName)
                .map(part => ({
                    id: part.id,
                    weekId: part.weekId,
                    weekDisplay: part.weekDisplay,
                    date: part.date,
                    section: part.section,
                    tipoParte: part.tipoParte,
                    modalidade: part.modalidade,
                    tituloParte: part.tituloParte,
                    descricaoParte: part.descricaoParte,
                    detalhesParte: part.detalhesParte,
                    seq: part.seq,
                    funcao: part.funcao,
                    duracao: parseInt(part.duracao) || 0,
                    horaInicio: part.horaInicio,
                    horaFim: part.horaFim,
                    rawPublisherName: part.rawPublisherName,
                    resolvedPublisherId: part.resolvedPublisherId,
                    resolvedPublisherName: part.resolvedPublisherName,
                    status: HistoryStatus.VALIDATED,
                    importSource: 'JSON',
                    importBatchId: part.batch_id || 'diagnostic',
                    createdAt: part.createdAt || new Date(0).toISOString(),
                }));

            const weekIds = [...new Set(parts.map(part => part.weekId))].sort();

            return {
                publishers,
                parts,
                history,
                firstWeekId: weekIds[0] || null,
                firstPartId: parts[0]?.id || null,
                firstPublisherName: publishers[0]?.name || null,
                firstPartWithAssignment: parts.find(part => !!part.resolvedPublisherName) || null,
                firstPartWithoutAssignment: parts.find(part => !part.resolvedPublisherName && part.tipoParte !== 'Cântico') || null,
            };
        },

        async rollbackAssignedPart(result: ActionResultLike, originalPart: WorkbookPart | null | undefined): Promise<void> {
            if (!result.success || !result.data?.partId || !originalPart) {
                return;
            }

            await dependencies.workbookMutations.updatePart(result.data.partId, {
                resolvedPublisherName: originalPart.resolvedPublisherName || '',
                status: originalPart.status || 'PENDENTE',
            });
        },

        async rollbackAvailabilityDate(
            publisherName: string,
            publishers: Publisher[],
            testDate: string,
        ): Promise<void> {
            const freshPublisher = publishers.find(publisher => publisher.name === publisherName);
            if (!freshPublisher) {
                return;
            }

            const cleanedDates = (freshPublisher.availability.exceptionDates || []).filter(date => date !== testDate);
            await dependencies.publisherAvailabilityMutations.replaceExceptionDates(freshPublisher, cleanedDates);
        },
    };
}