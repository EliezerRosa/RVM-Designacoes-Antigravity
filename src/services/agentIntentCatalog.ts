import type { AgentActionType } from './agentActionService';

export type AgentIntentRisk = 'low' | 'medium' | 'high';
export type AgentIntentPhase = 'single-step' | 'two-phase' | 'impact-preview' | 'staged-communication';

export interface AgentIntentContract {
    intentId: string;
    title: string;
    actionType?: AgentActionType;
    discoveryGate?: AgentActionType;
    visibility: 'agent' | 'scoped-data' | 'sensitive-data' | 'channel-enabled';
    phase: AgentIntentPhase;
    risk: AgentIntentRisk;
    prepare: string[];
    preview: string[];
    commit: string;
    recovery?: string;
}

export const WAVE_ONE_INTENTS: AgentIntentContract[] = [
    {
        intentId: 'approve-designation',
        title: 'Aprovar proposta de designação',
        actionType: 'APPROVE_PROPOSAL',
        discoveryGate: 'APPROVE_PROPOSAL',
        visibility: 'scoped-data',
        phase: 'single-step',
        risk: 'medium',
        prepare: ['parte em foco', 'elderId autenticado'],
        preview: ['parte', 'semana', 'publicador proposto', 'mudança de status'],
        commit: 'workbookLifecycleService.approveProposal(partId, elderId)',
        recovery: 'reject-designation'
    },
    {
        intentId: 'reject-designation',
        title: 'Rejeitar proposta de designação',
        actionType: 'REJECT_PROPOSAL',
        discoveryGate: 'REJECT_PROPOSAL',
        visibility: 'scoped-data',
        phase: 'two-phase',
        risk: 'medium',
        prepare: ['parte em foco', 'motivo curto obrigatório'],
        preview: ['parte', 'publicador atual', 'motivo', 'retorno para pendente'],
        commit: 'workbookLifecycleService.rejectProposal(partId, reason)',
        recovery: 'reassign-part'
    },
    {
        intentId: 'reassign-part',
        title: 'Reatribuir publicador da parte',
        actionType: 'ASSIGN_PART',
        discoveryGate: 'ASSIGN_PART',
        visibility: 'scoped-data',
        phase: 'two-phase',
        risk: 'medium',
        prepare: ['parte em foco', 'candidatos elegíveis'],
        preview: ['antes/depois', 'checagem de elegibilidade'],
        commit: 'workbookAssignmentService.assignPublisher(partId, publisherName, publisherId)',
        recovery: 'UNDO_LAST'
    },
    {
        intentId: 'update-availability',
        title: 'Atualizar disponibilidade do publicador',
        actionType: 'UPDATE_AVAILABILITY',
        discoveryGate: 'UPDATE_AVAILABILITY',
        visibility: 'scoped-data',
        phase: 'two-phase',
        risk: 'low',
        prepare: ['publicador em foco', 'datas a bloquear/liberar'],
        preview: ['datas alteradas', 'total de exceções'],
        commit: 'publisherAvailabilityService.updateAvailability(publisher, unavailableDates)',
        recovery: 'editor granular de disponibilidade'
    },
    {
        intentId: 'edit-publisher-core',
        title: 'Editar ficha principal do publicador',
        actionType: 'UPDATE_PUBLISHER',
        discoveryGate: 'UPDATE_PUBLISHER',
        visibility: 'sensitive-data',
        phase: 'two-phase',
        risk: 'medium',
        prepare: ['ficha atual pré-preenchida'],
        preview: ['somente campos alterados', 'impacto determinístico do rename quando houver'],
        commit: 'publisherMutationService.savePublisherWithPropagation(updatedPublisher, previousPublisher)'
    },
    {
        intentId: 'review-s140-message',
        title: 'Revisar mensagem preparada de S-140',
        actionType: 'SEND_S140',
        discoveryGate: 'SEND_S140',
        visibility: 'channel-enabled',
        phase: 'staged-communication',
        risk: 'medium',
        prepare: ['conteúdo preparado', 'metadados da semana'],
        preview: ['mensagem final', 'canal de envio'],
        commit: 'communicationService.updateNotification(...)'
    },
    {
        intentId: 'manage-local-needs-item',
        title: 'Adicionar ou editar item da fila de necessidades locais',
        actionType: 'MANAGE_LOCAL_NEEDS',
        discoveryGate: 'MANAGE_LOCAL_NEEDS',
        visibility: 'scoped-data',
        phase: 'two-phase',
        risk: 'low',
        prepare: ['tema', 'responsável', 'semana alvo opcional'],
        preview: ['posição na fila', 'destino da semana'],
        commit: 'localNeedsService.addToQueue(...) / update(...)'
    },
    {
        intentId: 'complete-part',
        title: 'Marcar parte como concluída',
        actionType: 'COMPLETE_PART',
        discoveryGate: 'COMPLETE_PART',
        visibility: 'scoped-data',
        phase: 'two-phase',
        risk: 'medium',
        prepare: ['parte em foco'],
        preview: ['status atual e futuro'],
        commit: 'workbookLifecycleService.completePart(partId)',
        recovery: 'workbookLifecycleService.undoCompletePart(partId)'
    },
    {
        intentId: 'undo-complete-part',
        title: 'Desfazer conclusão de parte',
        actionType: 'UNDO_COMPLETE_PART',
        discoveryGate: 'UNDO_COMPLETE_PART',
        visibility: 'scoped-data',
        phase: 'two-phase',
        risk: 'medium',
        prepare: ['parte concluída em foco'],
        preview: ['status atual e retorno para aprovada'],
        commit: 'workbookLifecycleService.undoCompletePart(partId)',
        recovery: 'workbookLifecycleService.completePart(partId)'
    }
];

export function getWaveOneIntent(intentId: string): AgentIntentContract | undefined {
    return WAVE_ONE_INTENTS.find(intent => intent.intentId === intentId);
}