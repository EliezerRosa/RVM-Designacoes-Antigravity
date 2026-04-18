import { useMemo } from 'react';
import type { Publisher, WorkbookPart } from '../types';

interface Params {
    publishers: Publisher[];
    parts: WorkbookPart[];
    currentWeekId?: string;
    lastUserPrompt: string;
    activeTopic: string;
    canUpdateAvailability: boolean;
    canUpdatePublisher: boolean;
    canSeeSensitiveData: boolean;
    accessLevel: 'elder' | 'publisher';
}

const normalizeSemanticText = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function useTemporalChatSemanticContext({
    publishers,
    parts,
    currentWeekId,
    lastUserPrompt,
    activeTopic,
    canUpdateAvailability,
    canUpdatePublisher,
    canSeeSensitiveData,
    accessLevel,
}: Params) {
    const focusedPublisherId = useMemo(() => {
        const normalizedText = normalizeSemanticText(lastUserPrompt);
        const bestMatch = publishers.reduce<{ id: string; score: number } | null>((currentBest, publisher) => {
            const normalizedName = normalizeSemanticText(publisher.name);
            if (normalizedText.includes(normalizedName)) {
                if (!currentBest || normalizedName.length > currentBest.score) {
                    currentBest = { id: publisher.id, score: normalizedName.length };
                }
            }

            publisher.aliases.forEach(alias => {
                const normalizedAlias = normalizeSemanticText(alias);
                if (normalizedAlias && normalizedText.includes(normalizedAlias)) {
                    if (!currentBest || normalizedAlias.length > currentBest.score) {
                        currentBest = { id: publisher.id, score: normalizedAlias.length };
                    }
                }
            });

            return currentBest;
        }, null);

        return bestMatch?.id || null;
    }, [lastUserPrompt, publishers]);

    const shouldShowAvailabilityMicroUi = canUpdateAvailability && accessLevel === 'elder' && (
        Boolean(focusedPublisherId) ||
        activeTopic === 'Publicadores e elegibilidade' ||
        /dispon|indispon|agenda|bloque/i.test(lastUserPrompt)
    );

    const shouldShowPublisherEditMicroUi = canUpdatePublisher && canSeeSensitiveData && accessLevel === 'elder' && (
        Boolean(focusedPublisherId) ||
        activeTopic === 'Publicadores e elegibilidade' ||
        /nome|telefone|condi|fun[cç][aã]o|inapto|apto|cadastro|ficha/i.test(lastUserPrompt)
    );

    const currentWeekProposals = useMemo(() => {
        if (!currentWeekId) return [];
        return parts
            .filter(part => part.weekId === currentWeekId && part.status === 'PROPOSTA')
            .sort((left, right) => left.seq - right.seq);
    }, [parts, currentWeekId]);

    const currentWeekCompletableParts = useMemo(() => {
        if (!currentWeekId) return [];
        return parts
            .filter(part => part.weekId === currentWeekId && (part.status === 'APROVADA' || part.status === 'DESIGNADA') && Boolean(part.resolvedPublisherName))
            .sort((left, right) => left.seq - right.seq);
    }, [parts, currentWeekId]);

    const currentWeekCompletedParts = useMemo(() => {
        if (!currentWeekId) return [];
        return parts
            .filter(part => part.weekId === currentWeekId && part.status === 'CONCLUIDA')
            .sort((left, right) => left.seq - right.seq);
    }, [parts, currentWeekId]);

    return {
        focusedPublisherId,
        shouldShowAvailabilityMicroUi,
        shouldShowPublisherEditMicroUi,
        currentWeekProposals,
        currentWeekCompletableParts,
        currentWeekCompletedParts,
    };
}