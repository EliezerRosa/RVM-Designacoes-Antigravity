import { useMemo } from 'react';
import type { Publisher, WorkbookPart } from '../types';

interface Params {
    publishers: Publisher[];
    parts: WorkbookPart[];
    currentWeekId?: string;
    focusedPartId?: string | null;
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
    focusedPartId,
    lastUserPrompt,
    activeTopic,
    canUpdateAvailability,
    canUpdatePublisher,
    canSeeSensitiveData,
    accessLevel,
}: Params) {
    const focusedPart = useMemo(
        () => focusedPartId ? parts.find(part => part.id === focusedPartId) || null : null,
        [focusedPartId, parts]
    );

    const mentionedPublisherId = useMemo(() => {
        const normalizedText = normalizeSemanticText(lastUserPrompt);
        const bestMatch = publishers.reduce<{ id: string; score: number } | null>((currentBest, publisher) => {
            const normalizedName = normalizeSemanticText(publisher.name);
            if (normalizedText.includes(normalizedName)) {
                if (!currentBest || normalizedName.length > currentBest.score) {
                    currentBest = { id: publisher.id, score: normalizedName.length };
                }
            }

            publisher.aliases?.forEach(alias => {
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

    const focusedPublisherId = useMemo(() => {
        if (mentionedPublisherId) return mentionedPublisherId;
        if (focusedPart?.resolvedPublisherId) return focusedPart.resolvedPublisherId;

        const assignedName = focusedPart?.resolvedPublisherName || focusedPart?.rawPublisherName;
        if (!assignedName) return null;
        const normalizedAssignedName = normalizeSemanticText(assignedName);
        return publishers.find(publisher => normalizeSemanticText(publisher.name) === normalizedAssignedName)?.id || null;
    }, [focusedPart, mentionedPublisherId, publishers]);

    const shouldShowAvailabilityMicroUi = canUpdateAvailability && accessLevel === 'elder' && (
        Boolean(mentionedPublisherId) ||
        activeTopic === 'Publicadores e elegibilidade' ||
        /dispon|indispon|agenda|bloque/i.test(lastUserPrompt)
    );

    const shouldShowPublisherEditMicroUi = canUpdatePublisher && canSeeSensitiveData && accessLevel === 'elder' && (
        Boolean(mentionedPublisherId) ||
        activeTopic === 'Publicadores e elegibilidade' ||
        /nome|telefone|condi|fun[cç][aã]o|inapto|apto|cadastro|ficha/i.test(lastUserPrompt)
    );

    const currentWeekParts = useMemo(
        () => currentWeekId ? parts.filter(part => part.weekId === currentWeekId) : [],
        [parts, currentWeekId]
    );

    const currentWeekProposals = useMemo(() => {
        return currentWeekParts
            .filter(part => part.status === 'PROPOSTA')
            .sort((left, right) => left.seq - right.seq);
    }, [currentWeekParts]);

    const currentWeekCompletedParts = useMemo(() => {
        return currentWeekParts
            .filter(part => part.status === 'CONCLUIDA')
            .sort((left, right) => left.seq - right.seq);
    }, [currentWeekParts]);

    return {
        focusedPublisherId,
        focusedPart,
        shouldShowAvailabilityMicroUi,
        shouldShowPublisherEditMicroUi,
        currentWeekParts,
        currentWeekProposals,
        currentWeekCompletedParts,
    };
}