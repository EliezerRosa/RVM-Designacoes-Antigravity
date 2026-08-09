import { useCallback, useMemo } from 'react';
import type { RefObject } from 'react';
import type { ChatMessage } from '../services/agentService';
import type { AgentAction, AgentActionType } from '../services/agentActionService';
import type { WorkbookPart } from '../types';
import type { ChatActionChipItem } from '../components/ui/ChatActionChips';
import type { PostResponseActionItem } from '../components/ui/PostResponseActions';
import type { SlashCommandItem } from '../components/ui/SlashCommandMenu';
import { getTodayWeekIdLocal } from '../utils/dateUtils';
import { resolveAgentActionState } from '../utils/agentFocus';

interface Params {
    input: string;
    setInput: (value: string) => void;
    inputRef: RefObject<HTMLInputElement | null>;
    currentWeekId?: string;
    canSendZap: boolean;
    canSeeApprovalMicroUi: boolean;
    focusedPublisherId?: string | null;
    focusedPart?: WorkbookPart | null;
    currentWeekParts: WorkbookPart[];
    currentWeekProposals: WorkbookPart[];
    currentWeekCompletedParts: WorkbookPart[];
    shouldShowAvailabilityMicroUi: boolean;
    shouldShowPublisherEditMicroUi: boolean;
    messages: ChatMessage[];
    canExecute: (actionType: AgentActionType) => boolean;
    sendMessage: (overrideInput?: string) => Promise<void>;
    handleShareS140: (weekId: string, viewOnly?: boolean) => Promise<void>;
    handlePublishWeek: (weekId: string) => Promise<void>;
    handleUnpublishWeek: (weekId: string) => Promise<void>;
    executeDirectAction: (action: AgentAction, nextTopic?: string) => Promise<void>;
    handleApproveProposal: (partId: string) => Promise<void>;
    handleUndoCompletePart: (partId: string) => Promise<void>;
    setProposalRejectFocusId: (partId: string | null) => void;
    setActiveTopic: (topic: string) => void;
    openApprovalMicroUi: () => void;
    openAvailabilityMicroUi: () => void;
    openPublisherEditMicroUi: () => void;
}

export function useTemporalChatSemanticControls({
    input,
    setInput,
    inputRef,
    currentWeekId,
    canSendZap,
    canSeeApprovalMicroUi,
    focusedPublisherId,
    focusedPart,
    currentWeekParts,
    currentWeekProposals,
    currentWeekCompletedParts,
    shouldShowAvailabilityMicroUi,
    shouldShowPublisherEditMicroUi,
    messages,
    canExecute,
    sendMessage,
    handleShareS140,
    handlePublishWeek,
    handleUnpublishWeek,
    executeDirectAction,
    handleApproveProposal,
    handleUndoCompletePart,
    setProposalRejectFocusId,
    setActiveTopic,
    openApprovalMicroUi,
    openAvailabilityMicroUi,
    openPublisherEditMicroUi,
}: Params) {
    const focusedProposal = focusedPart?.status === 'PROPOSTA' ? focusedPart : null;
    const focusedCompletedPart = focusedPart && currentWeekCompletedParts.some(part => part.id === focusedPart.id)
        ? focusedPart
        : null;
    const {
        isOperationalWeek,
        hasVacantParts,
        hasPublishableAssignments,
        canRankFocusedPart,
    } = resolveAgentActionState({
        currentWeekId,
        currentWeekParts,
        focusedPart,
        todayWeekId: getTodayWeekIdLocal(),
    });

    const contextualChips = useMemo<ChatActionChipItem[]>(() => {
        const chips: ChatActionChipItem[] = [];

        if (currentWeekId && isOperationalWeek && hasVacantParts && canExecute('GENERATE_WEEK')) {
            chips.push({
                id: 'chip-generate-week',
                label: 'Gerar semana',
                onClick: () => void executeDirectAction({
                    type: 'GENERATE_WEEK',
                    params: { weekId: currentWeekId },
                    description: `Gerando designações da semana ${currentWeekId}`
                }, 'Designações da semana'),
                tone: 'accent'
            });
        }

        if (currentWeekProposals.length > 0 && canExecute('APPROVE_PROPOSAL') && canSeeApprovalMicroUi) {
            chips.push({
                id: 'chip-proposals',
                label: `Propostas (${currentWeekProposals.length})`,
                onClick: openApprovalMicroUi,
                tone: 'accent'
            });
        }

        if (shouldShowAvailabilityMicroUi && focusedPublisherId) {
            chips.push({
                id: 'chip-availability',
                label: 'Bloquear data',
                onClick: openAvailabilityMicroUi
            });
        }

        if (shouldShowPublisherEditMicroUi && focusedPublisherId) {
            chips.push({
                id: 'chip-publisher-edit',
                label: 'Editar ficha',
                onClick: openPublisherEditMicroUi,
                tone: 'accent'
            });
        }

        if (currentWeekId && focusedPart && canRankFocusedPart) {
            chips.push({
                id: 'chip-ranking',
                label: 'Ver opções para esta parte',
                onClick: () => sendMessage(`Mostre as melhores opções para a parte em foco da semana ${currentWeekId}.`)
            });
        }

        if (currentWeekId && canSendZap && hasPublishableAssignments) {
            chips.push({
                id: 'chip-publish-week',
                label: `Publicar ${currentWeekId}`,
                onClick: () => void handlePublishWeek(currentWeekId),
                tone: 'accent'
            });
        }

        return chips;
    }, [currentWeekId, isOperationalWeek, hasVacantParts, hasPublishableAssignments, canSendZap, currentWeekProposals, canSeeApprovalMicroUi, shouldShowAvailabilityMicroUi, shouldShowPublisherEditMicroUi, focusedPublisherId, focusedPart, canRankFocusedPart, canExecute, handlePublishWeek, executeDirectAction, openApprovalMicroUi, openAvailabilityMicroUi, openPublisherEditMicroUi, sendMessage]);

    const slashCommands = useMemo(() => {
        const allCommands: Array<{
            id: string;
            command: string;
            description: string;
            requiredAction?: AgentActionType;
            isAvailable?: boolean;
            onSelect: () => void;
        }> = [
            {
                id: 'cmd-ajuda',
                command: '/ajuda',
                description: 'Mostra o que o agente pode fazer no contexto atual',
                onSelect: () => {
                    setInput('Quais ações e fluxos você pode me ajudar a executar agora com base no contexto atual?');
                    inputRef.current?.focus();
                }
            },
            {
                id: 'cmd-status',
                command: '/status',
                description: 'Resume semana em foco, pendências e próximos passos',
                onSelect: () => {
                    setInput(`Resuma o estado atual da semana ${currentWeekId || ''}, com pendências e próximos passos.`.trim());
                    inputRef.current?.focus();
                }
            },
            {
                id: 'cmd-designar',
                command: '/designar',
                description: 'Sugere encaixes para a semana em foco',
                onSelect: () => {
                    setInput(`Sugira os melhores encaixes para a semana ${currentWeekId || ''}, destacando equilíbrio e conflitos.`.trim());
                    inputRef.current?.focus();
                }
            },
            {
                id: 'cmd-propostas',
                command: '/propostas',
                description: 'Resume propostas pendentes de aprovação na semana em foco',
                requiredAction: 'APPROVE_PROPOSAL',
                isAvailable: currentWeekProposals.length > 0,
                onSelect: () => {
                    setInput(`Mostre as propostas pendentes da semana ${currentWeekId || ''} com um resumo pronto para aprovar ou rejeitar.`.trim());
                    inputRef.current?.focus();
                }
            },
            {
                id: 'cmd-aprovar-parte',
                command: '/aprovar-parte',
                description: 'Aprova a proposta da parte explicitamente focada',
                requiredAction: 'APPROVE_PROPOSAL',
                isAvailable: Boolean(focusedProposal),
                onSelect: () => {
                    setInput('');
                    if (focusedProposal) {
                        void handleApproveProposal(focusedProposal.id);
                    }
                }
            },
            {
                id: 'cmd-rejeitar-parte',
                command: '/rejeitar-parte',
                description: 'Abre a rejeição da proposta da parte explicitamente focada',
                requiredAction: 'REJECT_PROPOSAL',
                isAvailable: Boolean(focusedProposal),
                onSelect: () => {
                    setInput('');
                    if (focusedProposal) {
                        setProposalRejectFocusId(focusedProposal.id);
                        setActiveTopic('Aprovação de designações');
                        openApprovalMicroUi();
                    }
                }
            },
            {
                id: 'cmd-bloquear-data',
                command: '/bloquear-data',
                description: 'Abre a micro-UI de indisponibilidade para o publicador em foco',
                requiredAction: 'UPDATE_AVAILABILITY',
                isAvailable: Boolean(focusedPublisherId),
                onSelect: () => {
                    setInput('');
                    openAvailabilityMicroUi();
                }
            },
            {
                id: 'cmd-editar-publicador',
                command: '/editar-publicador',
                description: 'Abre a micro-UI curta da ficha principal do publicador em foco',
                requiredAction: 'UPDATE_PUBLISHER',
                isAvailable: Boolean(focusedPublisherId),
                onSelect: () => {
                    setInput('');
                    openPublisherEditMicroUi();
                }
            },
            {
                id: 'cmd-desfazer-conclusao',
                command: '/desfazer-conclusao',
                description: 'Desfaz a conclusão da parte explicitamente focada',
                requiredAction: 'UNDO_COMPLETE_PART',
                isAvailable: Boolean(focusedCompletedPart),
                onSelect: () => {
                    setInput('');
                    if (focusedCompletedPart) {
                        void handleUndoCompletePart(focusedCompletedPart.id);
                    }
                }
            },
            {
                id: 'cmd-historico',
                command: '/historico',
                description: 'Consulta histórico e participação relevante',
                onSelect: () => {
                    setInput('Mostre o histórico de participações mais relevante para a decisão atual.');
                    inputRef.current?.focus();
                }
            },
            {
                id: 'cmd-gerar-semana',
                command: '/gerar-semana',
                description: 'Executa geração da semana em foco',
                requiredAction: 'GENERATE_WEEK',
                isAvailable: isOperationalWeek && hasVacantParts,
                onSelect: () => {
                    setInput('');
                    if (currentWeekId) {
                        void executeDirectAction({
                            type: 'GENERATE_WEEK',
                            params: { weekId: currentWeekId },
                            description: `Gerando designações da semana ${currentWeekId}`
                        }, 'Designações da semana');
                    }
                }
            },
            {
                id: 'cmd-ver-s140',
                command: '/ver-s140',
                description: 'Abre preview do S-140 da semana em foco',
                onSelect: () => {
                    setInput('');
                    if (currentWeekId) {
                        void handleShareS140(currentWeekId, true);
                    }
                }
            },
            {
                id: 'cmd-compartilhar-s140',
                command: '/compartilhar-s140',
                description: 'Abre fluxo de compartilhamento do S-140',
                isAvailable: canSendZap,
                onSelect: () => {
                    setInput('');
                    if (currentWeekId) {
                        void handleShareS140(currentWeekId, false);
                    }
                }
            },
            {
                id: 'cmd-publicar',
                command: '/publicar',
                description: 'Publica a semana em foco: envia S-89 (com link) a cada designado + S-140 ao Grupo (Z-API, em lote)',
                isAvailable: canSendZap && hasPublishableAssignments,
                onSelect: () => {
                    setInput('');
                    if (currentWeekId) {
                        void handlePublishWeek(currentWeekId);
                    }
                }
            },
            {
                id: 'cmd-despublicar',
                command: '/despublicar',
                description: 'Despublica a semana em foco (limpa o marcador para permitir reenviar)',
                isAvailable: canSendZap,
                onSelect: () => {
                    setInput('');
                    if (currentWeekId) {
                        void handleUnpublishWeek(currentWeekId);
                    }
                }
            },
            {
                id: 'cmd-limpar-semana',
                command: '/limpar-semana',
                description: 'Remove designações da semana em foco',
                requiredAction: 'CLEAR_WEEK',
                onSelect: () => {
                    setInput('');
                    if (currentWeekId) {
                        void executeDirectAction({
                            type: 'CLEAR_WEEK',
                            params: { weekId: currentWeekId },
                            description: `Limpando designações da semana ${currentWeekId}`
                        }, 'Designações da semana');
                    }
                }
            },
            {
                id: 'cmd-desfazer',
                command: '/desfazer',
                description: 'Desfaz a última ação executada',
                requiredAction: 'UNDO_LAST',
                onSelect: () => {
                    setInput('');
                    void executeDirectAction({
                        type: 'UNDO_LAST',
                        params: {},
                        description: 'Desfazendo última ação'
                    }, 'Recuperação e ajuste');
                }
            },
            {
                id: 'cmd-listar-politicas',
                command: '/listar-politicas',
                description: '[Admin] Lista todas as políticas de permissão',
                requiredAction: 'MANAGE_PERMISSIONS',
                onSelect: () => {
                    setInput('');
                    void executeDirectAction({
                        type: 'MANAGE_PERMISSIONS',
                        params: { target: 'policy', subAction: 'LIST' },
                        description: 'Listando políticas de permissão'
                    }, 'Permissões e visibilidade');
                }
            },
            {
                id: 'cmd-listar-overrides',
                command: '/listar-overrides',
                description: '[Admin] Lista todos os overrides individuais de permissão',
                requiredAction: 'MANAGE_PERMISSIONS',
                onSelect: () => {
                    setInput('');
                    void executeDirectAction({
                        type: 'MANAGE_PERMISSIONS',
                        params: { target: 'override', subAction: 'LIST' },
                        description: 'Listando overrides individuais'
                    }, 'Permissões e visibilidade');
                }
            },
            {
                id: 'cmd-criar-politica',
                command: '/criar-politica',
                description: '[Admin] Inicia a criação de uma nova política de permissão',
                requiredAction: 'MANAGE_PERMISSIONS',
                onSelect: () => {
                    setInput('Crie uma nova política de permissão. Pergunte: condição-alvo, função-alvo, abas permitidas, ações permitidas, prioridade. Ao final, monte o JSON MANAGE_PERMISSIONS.');
                    inputRef.current?.focus();
                }
            }
        ];

        return allCommands.filter(command =>
            command.isAvailable !== false && (!command.requiredAction || canExecute(command.requiredAction))
        );
    }, [currentWeekId, currentWeekProposals, focusedProposal, focusedCompletedPart, focusedPublisherId, isOperationalWeek, hasVacantParts, hasPublishableAssignments, canSendZap, canExecute, setInput, inputRef, handleApproveProposal, handleUndoCompletePart, setProposalRejectFocusId, setActiveTopic, openApprovalMicroUi, openAvailabilityMicroUi, openPublisherEditMicroUi, executeDirectAction, handleShareS140, handlePublishWeek, handleUnpublishWeek]);

    const visibleSlashCommands = useMemo<SlashCommandItem[]>(() => {
        if (!input.startsWith('/')) return [];
        const normalized = input.toLowerCase();

        return slashCommands
            .filter(command => command.command.toLowerCase().includes(normalized))
            .slice(0, 8)
            .map(command => ({
                id: command.id,
                command: command.command,
                description: command.description,
                onSelect: command.onSelect
            }));
    }, [input, slashCommands]);

    const buildPostResponseActions = useCallback((msg: ChatMessage, idx: number): PostResponseActionItem[] => {
        if (msg.role !== 'assistant') return [];

        const isLastAssistant = idx === [...messages].map((message, messageIndex) => ({ message, messageIndex })).filter(entry => entry.message.role === 'assistant').slice(-1)[0]?.messageIndex;
        const actions: PostResponseActionItem[] = [];

        if (isLastAssistant) {
            if (focusedProposal && canExecute('APPROVE_PROPOSAL')) {
                actions.push({
                    id: `approve-proposal-${idx}`,
                    label: 'Aprovar parte em foco',
                    onClick: () => void handleApproveProposal(focusedProposal.id),
                    variant: 'primary'
                });
            }

            if (focusedProposal && canExecute('REJECT_PROPOSAL')) {
                actions.push({
                    id: `review-proposals-${idx}`,
                    label: 'Rever parte em foco',
                    onClick: () => {
                        setProposalRejectFocusId(focusedProposal.id);
                        openApprovalMicroUi();
                    },
                    variant: 'subtle'
                });
            }

            if (shouldShowAvailabilityMicroUi && focusedPublisherId) {
                actions.push({
                    id: `availability-${idx}`,
                    label: 'Bloquear data',
                    onClick: openAvailabilityMicroUi,
                    variant: 'subtle'
                });
            }

            if (shouldShowPublisherEditMicroUi && focusedPublisherId) {
                actions.push({
                    id: `publisher-edit-${idx}`,
                    label: 'Editar ficha',
                    onClick: openPublisherEditMicroUi,
                    variant: 'subtle'
                });
            }

            if (focusedCompletedPart && canExecute('UNDO_COMPLETE_PART')) {
                actions.push({
                    id: `undo-complete-part-${idx}`,
                    label: 'Desfazer conclusão',
                    onClick: () => void handleUndoCompletePart(focusedCompletedPart.id),
                    variant: 'subtle'
                });
            }

        }

        return actions;
    }, [messages, focusedProposal, canExecute, handleApproveProposal, setProposalRejectFocusId, shouldShowAvailabilityMicroUi, shouldShowPublisherEditMicroUi, focusedPublisherId, focusedCompletedPart, handleUndoCompletePart, openApprovalMicroUi, openAvailabilityMicroUi, openPublisherEditMicroUi]);

    return {
        contextualChips,
        visibleSlashCommands,
        buildPostResponseActions,
    };
}