import { useCallback, useMemo } from 'react';
import type { RefObject } from 'react';
import type { ChatMessage } from '../services/agentService';
import type { AgentAction, AgentActionType } from '../services/agentActionService';
import type { WorkbookPart } from '../types';
import type { ChatActionChipItem } from '../components/ui/ChatActionChips';
import type { PostResponseActionItem } from '../components/ui/PostResponseActions';
import type { SlashCommandItem } from '../components/ui/SlashCommandMenu';

interface Params {
    input: string;
    setInput: (value: string) => void;
    inputRef: RefObject<HTMLInputElement | null>;
    currentWeekId?: string;
    canSendZap: boolean;
    canSeeApprovalMicroUi: boolean;
    accessLevel: 'elder' | 'publisher';
    currentWeekProposals: WorkbookPart[];
    currentWeekCompletableParts: WorkbookPart[];
    currentWeekCompletedParts: WorkbookPart[];
    shouldShowAvailabilityMicroUi: boolean;
    shouldShowPublisherEditMicroUi: boolean;
    messages: ChatMessage[];
    lastUserPrompt: string;
    canExecute: (actionType: AgentActionType) => boolean;
    sendMessage: (overrideInput?: string) => Promise<void>;
    handleShareS140: (weekId: string, viewOnly?: boolean) => Promise<void>;
    executeDirectAction: (action: AgentAction, nextTopic?: string) => Promise<void>;
    handleApproveProposal: (partId: string) => Promise<void>;
    handleCompletePart: (partId: string) => Promise<void>;
    handleUndoCompletePart: (partId: string) => Promise<void>;
    setProposalRejectFocusId: (partId: string | null) => void;
    setActiveTopic: (topic: string) => void;
}

export function useTemporalChatSemanticControls({
    input,
    setInput,
    inputRef,
    currentWeekId,
    canSendZap,
    canSeeApprovalMicroUi,
    accessLevel,
    currentWeekProposals,
    currentWeekCompletableParts,
    currentWeekCompletedParts,
    shouldShowAvailabilityMicroUi,
    shouldShowPublisherEditMicroUi,
    messages,
    lastUserPrompt,
    canExecute,
    sendMessage,
    handleShareS140,
    executeDirectAction,
    handleApproveProposal,
    handleCompletePart,
    handleUndoCompletePart,
    setProposalRejectFocusId,
    setActiveTopic,
}: Params) {
    const contextualChips = useMemo<ChatActionChipItem[]>(() => {
        const chips: ChatActionChipItem[] = [];

        if (currentWeekId) {
            chips.push({
                id: 'chip-status',
                label: `Status ${currentWeekId}`,
                onClick: () => sendMessage(`Resuma o estado da semana ${currentWeekId} e destaque pendências e conflitos.`)
            });

            chips.push({
                id: 'chip-s140-view',
                label: 'Ver S-140',
                onClick: () => void handleShareS140(currentWeekId, true),
                tone: 'accent'
            });
        }

        if (currentWeekId && canExecute('GENERATE_WEEK')) {
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
                onClick: () => sendMessage(`Mostre as propostas pendentes da semana ${currentWeekId} e prepare a aprovação ou rejeição.`),
                tone: 'accent'
            });
        }

        if (shouldShowAvailabilityMicroUi) {
            chips.push({
                id: 'chip-availability',
                label: 'Bloquear data',
                onClick: () => setActiveTopic('Publicadores e elegibilidade')
            });
        }

        if (shouldShowPublisherEditMicroUi) {
            chips.push({
                id: 'chip-publisher-edit',
                label: 'Editar ficha',
                onClick: () => setActiveTopic('Publicadores e elegibilidade'),
                tone: 'accent'
            });
        }

        if (currentWeekCompletableParts.length > 0 && canExecute('COMPLETE_PART')) {
            chips.push({
                id: 'chip-complete-part',
                label: 'Concluir parte',
                onClick: () => setActiveTopic('Designações da semana')
            });
        }

        if (currentWeekId) {
            chips.push({
                id: 'chip-ranking',
                label: 'Ver ranking',
                onClick: () => sendMessage(`Mostre o ranking dos melhores candidatos para as partes pendentes da semana ${currentWeekId}.`)
            });
        }

        if (currentWeekId && canSendZap) {
            chips.push({
                id: 'chip-share-s140',
                label: 'Compartilhar S-140',
                onClick: () => void handleShareS140(currentWeekId, false),
                tone: 'accent'
            });
        }

        if (canExecute('UNDO_LAST')) {
            chips.push({
                id: 'chip-undo',
                label: 'Desfazer última',
                onClick: () => void executeDirectAction({
                    type: 'UNDO_LAST',
                    params: {},
                    description: 'Desfazendo última ação'
                }, 'Recuperação e ajuste')
            });
        }

        return chips;
    }, [currentWeekId, canSendZap, currentWeekProposals, canSeeApprovalMicroUi, shouldShowAvailabilityMicroUi, shouldShowPublisherEditMicroUi, currentWeekCompletableParts, canExecute, sendMessage, handleShareS140, executeDirectAction, setActiveTopic]);

    const slashCommands = useMemo(() => {
        const allCommands: Array<{
            id: string;
            command: string;
            description: string;
            requiredAction?: AgentActionType;
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
                onSelect: () => {
                    setInput(`Mostre as propostas pendentes da semana ${currentWeekId || ''} com um resumo pronto para aprovar ou rejeitar.`.trim());
                    inputRef.current?.focus();
                }
            },
            {
                id: 'cmd-aprovar-primeira-proposta',
                command: '/aprovar-primeira-proposta',
                description: 'Aprova a primeira proposta pendente da semana em foco',
                requiredAction: 'APPROVE_PROPOSAL',
                onSelect: () => {
                    setInput('');
                    if (currentWeekProposals[0]) {
                        void handleApproveProposal(currentWeekProposals[0].id);
                    }
                }
            },
            {
                id: 'cmd-rejeitar-primeira-proposta',
                command: '/rejeitar-primeira-proposta',
                description: 'Abre a rejeição da primeira proposta pendente da semana em foco',
                requiredAction: 'REJECT_PROPOSAL',
                onSelect: () => {
                    setInput('');
                    if (currentWeekProposals[0]) {
                        setProposalRejectFocusId(currentWeekProposals[0].id);
                        setActiveTopic('Aprovação de designações');
                    }
                }
            },
            {
                id: 'cmd-bloquear-data',
                command: '/bloquear-data',
                description: 'Abre a micro-UI de indisponibilidade para o publicador em foco',
                requiredAction: 'UPDATE_AVAILABILITY',
                onSelect: () => {
                    setInput('');
                    setActiveTopic('Publicadores e elegibilidade');
                }
            },
            {
                id: 'cmd-editar-publicador',
                command: '/editar-publicador',
                description: 'Abre a micro-UI curta da ficha principal do publicador em foco',
                requiredAction: 'UPDATE_PUBLISHER',
                onSelect: () => {
                    setInput('');
                    setActiveTopic('Publicadores e elegibilidade');
                }
            },
            {
                id: 'cmd-concluir-primeira-parte',
                command: '/concluir-primeira-parte',
                description: 'Conclui a primeira parte pronta da semana em foco',
                requiredAction: 'COMPLETE_PART',
                onSelect: () => {
                    setInput('');
                    if (currentWeekCompletableParts[0]) {
                        void handleCompletePart(currentWeekCompletableParts[0].id);
                    }
                }
            },
            {
                id: 'cmd-desfazer-conclusao',
                command: '/desfazer-conclusao',
                description: 'Desfaz a conclusão da primeira parte concluída na semana em foco',
                requiredAction: 'UNDO_COMPLETE_PART',
                onSelect: () => {
                    setInput('');
                    if (currentWeekCompletedParts[0]) {
                        void handleUndoCompletePart(currentWeekCompletedParts[0].id);
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
                onSelect: () => {
                    setInput('');
                    if (currentWeekId) {
                        void handleShareS140(currentWeekId, false);
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
            }
        ];

        return allCommands.filter(command => !command.requiredAction || canExecute(command.requiredAction));
    }, [currentWeekId, currentWeekProposals, currentWeekCompletableParts, currentWeekCompletedParts, canExecute, setInput, inputRef, handleApproveProposal, handleCompletePart, handleUndoCompletePart, setProposalRejectFocusId, setActiveTopic, executeDirectAction, handleShareS140]);

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
        const actions: PostResponseActionItem[] = [
            {
                id: `copy-${idx}`,
                label: 'Copiar',
                onClick: async () => {
                    await navigator.clipboard.writeText(msg.content);
                },
                variant: 'subtle'
            },
            {
                id: `refine-${idx}`,
                label: 'Refinar',
                onClick: () => {
                    setInput(`Refine a resposta anterior considerando o contexto atual da semana ${currentWeekId || ''}.`);
                    inputRef.current?.focus();
                }
            }
        ];

        if (isLastAssistant) {
            if (lastUserPrompt) {
                actions.push({
                    id: `retry-${idx}`,
                    label: 'Tentar de novo',
                    onClick: () => void sendMessage(lastUserPrompt),
                    variant: 'subtle'
                });
            }

            if (currentWeekId) {
                actions.push({
                    id: `view-s140-${idx}`,
                    label: 'Ver S-140',
                    onClick: () => void handleShareS140(currentWeekId, true),
                    variant: 'primary'
                });
            }

            if (currentWeekProposals.length > 0 && canExecute('APPROVE_PROPOSAL')) {
                actions.push({
                    id: `approve-proposal-${idx}`,
                    label: 'Aprovar 1a proposta',
                    onClick: () => void handleApproveProposal(currentWeekProposals[0].id),
                    variant: 'primary'
                });
            }

            if (currentWeekProposals.length > 0 && canExecute('REJECT_PROPOSAL')) {
                actions.push({
                    id: `review-proposals-${idx}`,
                    label: 'Rever propostas',
                    onClick: () => {
                        setProposalRejectFocusId(currentWeekProposals[0].id);
                        setActiveTopic('Aprovação de designações');
                    },
                    variant: 'subtle'
                });
            }

            if (shouldShowAvailabilityMicroUi) {
                actions.push({
                    id: `availability-${idx}`,
                    label: 'Bloquear data',
                    onClick: () => setActiveTopic('Publicadores e elegibilidade'),
                    variant: 'subtle'
                });
            }

            if (shouldShowPublisherEditMicroUi) {
                actions.push({
                    id: `publisher-edit-${idx}`,
                    label: 'Editar ficha',
                    onClick: () => setActiveTopic('Publicadores e elegibilidade'),
                    variant: 'subtle'
                });
            }

            if (currentWeekCompletableParts.length > 0 && canExecute('COMPLETE_PART')) {
                actions.push({
                    id: `complete-part-${idx}`,
                    label: 'Concluir 1a parte',
                    onClick: () => void handleCompletePart(currentWeekCompletableParts[0].id),
                    variant: 'primary'
                });
            }

            if (currentWeekCompletedParts.length > 0 && canExecute('UNDO_COMPLETE_PART')) {
                actions.push({
                    id: `undo-complete-part-${idx}`,
                    label: 'Desfazer conclusão',
                    onClick: () => void handleUndoCompletePart(currentWeekCompletedParts[0].id),
                    variant: 'subtle'
                });
            }

            if (currentWeekId && canExecute('GENERATE_WEEK')) {
                actions.push({
                    id: `generate-week-${idx}`,
                    label: 'Gerar semana',
                    onClick: () => void executeDirectAction({
                        type: 'GENERATE_WEEK',
                        params: { weekId: currentWeekId },
                        description: `Gerando designações da semana ${currentWeekId}`
                    }, 'Designações da semana'),
                    variant: 'primary'
                });
            }

            if (currentWeekId && canExecute('CLEAR_WEEK')) {
                actions.push({
                    id: `clear-week-${idx}`,
                    label: 'Limpar semana',
                    onClick: () => void executeDirectAction({
                        type: 'CLEAR_WEEK',
                        params: { weekId: currentWeekId },
                        description: `Limpando designações da semana ${currentWeekId}`
                    }, 'Designações da semana'),
                    variant: 'subtle'
                });
            }

            if (currentWeekId && canSendZap) {
                actions.push({
                    id: `share-s140-${idx}`,
                    label: 'Compartilhar S-140',
                    onClick: () => void handleShareS140(currentWeekId, false),
                    variant: 'primary'
                });
            }

            if (accessLevel === 'elder') {
                actions.push({
                    id: `undo-${idx}`,
                    label: 'Desfazer última',
                    onClick: () => void sendMessage('desfaça a última ação executada'),
                    variant: 'subtle'
                });
            }
        }

        return actions;
    }, [messages, setInput, currentWeekId, inputRef, lastUserPrompt, sendMessage, handleShareS140, currentWeekProposals, canExecute, handleApproveProposal, setProposalRejectFocusId, setActiveTopic, shouldShowAvailabilityMicroUi, shouldShowPublisherEditMicroUi, currentWeekCompletableParts, handleCompletePart, currentWeekCompletedParts, handleUndoCompletePart, executeDirectAction, canSendZap, accessLevel]);

    return {
        contextualChips,
        visibleSlashCommands,
        buildPostResponseActions,
    };
}