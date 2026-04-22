import { getModalidadeFromTipo } from '../constants/mappings';
import { EnumFuncao, type Publisher } from '../types';
import { isPastWeekDate } from './eligibilityService';

interface PartEligibilityRecord {
    weekId: string;
    tipoParte: string;
    modalidade?: string | null;
    date: string;
    section: string;
    funcao?: string | null;
    partTitle?: string | null;
}

interface WeekTitularRecord {
    partTitle?: string | null;
    resolvedPublisherName?: string | null;
}

interface UnifiedActionContextDependencies {
    publisherDirectoryReader: {
        loadAllPublishers: () => Promise<Publisher[]>;
    };
    partContextReader: {
        getPartEligibilityRecord: (partId: string) => Promise<PartEligibilityRecord | null>;
        getWeekTitulares: (weekId: string) => Promise<WeekTitularRecord[]>;
    };
}

export function createUnifiedActionContextService(dependencies: UnifiedActionContextDependencies) {
    async function loadPublishers() {
        return dependencies.publisherDirectoryReader.loadAllPublishers();
    }

    function matchPublisherByName(publishers: Publisher[], publisherName: string) {
        const normalized = publisherName.trim().toLowerCase();
        return publishers.find(publisher => publisher.name.trim().toLowerCase() === normalized) || null;
    }

    return {
        async resolvePublisherByName(publisherName: string) {
            const publishers = await loadPublishers();
            return matchPublisherByName(publishers, publisherName);
        },

        async buildEligibilityContext(partId: string, publisherName: string, publisherOverride?: Publisher) {
            const cleanPartId = partId.trim();
            const partData = await dependencies.partContextReader.getPartEligibilityRecord(cleanPartId);

            if (!partData) {
                throw new Error(`Parte não encontrada: "${cleanPartId}". Detalhe: Registro inexistente`);
            }

            const publishers = await loadPublishers();
            const publisher = publisherOverride || matchPublisherByName(publishers, publisherName);

            if (!publisher) {
                throw new Error(`Publicador não encontrado: "${publisherName}"`);
            }

            const tipoParte = partData.tipoParte || '';
            const modalidade = partData.modalidade || getModalidadeFromTipo(tipoParte);
            const funcao = partData.funcao === 'Ajudante' ? EnumFuncao.AJUDANTE : EnumFuncao.TITULAR;
            const isOracaoInicial = tipoParte.toLowerCase().includes('inicial');
            const isOracaoFinal = tipoParte.toLowerCase().includes('final');
            const isPastWeek = isPastWeekDate(partData.date);

            // Always query week titulares to find presidentName and titularGender
            const weekTitulares = await dependencies.partContextReader.getWeekTitulares(partData.weekId);

            // Find president of the week (for oração final blocking)
            const presidentRecord = weekTitulares.find(t =>
                (t.partTitle || '').toLowerCase().includes('presidente')
            );
            const presidentName = presidentRecord?.resolvedPublisherName || undefined;

            let titularGender: 'brother' | 'sister' | undefined;

            if (funcao === EnumFuncao.AJUDANTE) {
                const currentTitle = partData.partTitle || '';
                const baseTitle = currentTitle
                    .replace(/\s*-\s*Ajudante.*/i, '')
                    .replace(/\(Ajudante\)/i, '')
                    .trim()
                    .toLowerCase();

                const titularMatch = weekTitulares.find(titular =>
                    (titular.partTitle || '').toLowerCase().includes(baseTitle)
                );

                if (titularMatch?.resolvedPublisherName) {
                    const titular = publishers.find(candidate =>
                        candidate.name.trim() === titularMatch.resolvedPublisherName?.trim()
                    );
                    if (titular) {
                        titularGender = titular.gender;
                    }
                }
            }

            return {
                publisher,
                weekId: partData.weekId,
                context: {
                    modalidade,
                    funcao,
                    date: partData.date,
                    secao: partData.section,
                    isOracaoInicial,
                    isOracaoFinal,
                    isPastWeek,
                    titularGender,
                    presidentName,
                },
            };
        },
    };
}