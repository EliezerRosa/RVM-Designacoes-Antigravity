import type { WorkbookPart, Publisher } from '../types';
import { markManualSelection } from './manualSelectionTracker';

import { generationService } from './generationService';
import { workbookService } from './workbookService';

export type AgentActionType =
    | 'GENERATE_WEEK'
    | 'ASSIGN_PART'
    | 'UNDO_LAST'
    | 'NAVIGATE_WEEK'
    | 'SHARE_S140_WHATSAPP'
    // Legacy support for transition (optional)
    | 'SIMULATE_ASSIGNMENT';

export interface AgentAction {
    type: AgentActionType;
    params: Record<string, any>;
    description: string;
}

export interface ActionResult {
    success: boolean;
    message: string;
    data?: any;
    actionType?: AgentActionType;
}

// Service implementation
export const agentActionService = {

    // Parse response to find actions
    detectAction(responseContent: string): AgentAction | null {
        // Try to find JSON block
        const jsonMatch = responseContent.match(/```json\s*([\s\S]*?)\s*```/) ||
            responseContent.match(/{\s*[\s\S]*"type"\s*:\s*"(?:GENERATE_WEEK|ASSIGN_PART|UNDO_LAST|NAVIGATE_WEEK|SHARE_S140_WHATSAPP|SIMULATE_ASSIGNMENT)"[\s\S]*}/);

        if (jsonMatch) {
            try {
                const jsonStr = jsonMatch[1] || jsonMatch[0];
                const data = JSON.parse(jsonStr);

                if (data.type) {
                    return {
                        type: data.type,
                        params: data.params || {},
                        description: data.description || 'Ação sugerida pelo agente'
                    };
                }
            } catch (e) {
                console.error('[AgentAction] Failed to parse action JSON:', e);
            }
        }
        return null;
    },

    // Execute the action directly (Authorized User Mode)
    async executeAction(action: AgentAction, parts: WorkbookPart[], publishers: Publisher[]): Promise<ActionResult> {
        console.log('[AgentAction] Executing:', action);

        try {
            switch (action.type) {
                case 'GENERATE_WEEK': {
                    const { weekId } = action.params;
                    if (!weekId) return { success: false, message: 'Semana não especificada.' };

                    const result = await generationService.generateDesignations(parts, publishers, {
                        generationWeeks: [weekId],
                        isDryRun: false
                    });

                    return {
                        success: result.success,
                        message: result.message || (result.success ? 'Geração concluída com sucesso.' : 'Falha na geração.'),
                        data: result,
                        actionType: 'GENERATE_WEEK'
                    };
                }

                case 'ASSIGN_PART':
                case 'SIMULATE_ASSIGNMENT': {
                    const { partId, publisherId, publisherName, weekId, partName } = action.params;

                    let targetPart = parts.find(p => p.id === partId);

                    // Fallback: Tentar encontrar por Nome + Semana se ID não fornecido
                    // Fallback: Tentar encontrar por Nome + Semana se ID não fornecido
                    if (!targetPart && weekId && partName) {
                        const candidates = parts.filter(p => p.weekId === weekId);
                        const qName = partName.toLowerCase();

                        targetPart = candidates.find(p => {
                            const pTitle = (p.tituloParte || '').toLowerCase();
                            const pType = (p.tipoParte || '').toLowerCase();

                            // 1. Query inside DB (standard)
                            if (pTitle && pTitle.includes(qName)) return true;
                            if (pType && pType.includes(qName)) return true;

                            // 2. DB inside Query (handles "1. Term..." vs "Term")
                            // Must correspond to significant length to avoid false positives with short words
                            if (pTitle && pTitle.length > 5 && qName.includes(pTitle)) return true;
                            if (pType && pType.length > 5 && qName.includes(pType)) return true;

                            return false;
                        });
                    }

                    if (!targetPart) {
                        return { success: false, message: `Parte não encontrada (ID: ${partId} | Nome: ${partName})` };
                    }

                    // Resolve Publisher
                    let resolvedName = publisherName;

                    if (!publisherId && publisherName) {
                        const pub = publishers.find(p => p.name.toLowerCase().includes(publisherName.toLowerCase().trim()));
                        if (pub) {
                            resolvedName = pub.name;
                        } else {
                            // Se não achou exato, verifica se é remoção
                            if (publisherName.toLowerCase() === 'remover' || publisherName === '') {
                                resolvedName = '';
                            } else {
                                return { success: false, message: `Publicador '${publisherName}' não encontrado.` };
                            }
                        }
                    }

                    // Salvar diretamente
                    if (resolvedName) {
                        // Se tem nome, status -> PROPOSTA (ou mantém APPROVED se já estava)
                        const newStatus = (targetPart.status === 'APROVADA' || targetPart.status === 'CONCLUIDA')
                            ? targetPart.status
                            : 'PROPOSTA';

                        await workbookService.updatePart(targetPart.id, {
                            resolvedPublisherName: resolvedName,
                            status: newStatus
                        });

                        // Marcar seleção manual
                        try {
                            await markManualSelection(
                                resolvedName,
                                targetPart.tipoParte,
                                targetPart.weekId,
                                targetPart.date
                            );
                        } catch (e) {
                            console.warn('[AgentAction] Erro ao marcar seleção manual:', e);
                        }

                    } else {
                        // Remoção
                        await workbookService.updatePart(targetPart.id, {
                            resolvedPublisherName: '',
                            status: 'PENDENTE'
                        });
                    }

                    return {
                        success: true,
                        message: resolvedName ? `Parte atribuída a ${resolvedName}` : 'Designação removida.',
                        data: { partId: targetPart.id, assignedTo: resolvedName },
                        actionType: 'ASSIGN_PART'
                    };
                }

                case 'UNDO_LAST': {
                    return {
                        success: true,
                        message: 'Solicitação de UNDO recebida. (Não implementado nesta camada)',
                        actionType: 'UNDO_LAST'
                    };
                }

                case 'NAVIGATE_WEEK': {
                    const { weekId } = action.params;
                    return {
                        success: true,
                        message: `Navegando para semana ${weekId}`,
                        data: { weekId },
                        actionType: 'NAVIGATE_WEEK'
                    };
                }

                case 'SHARE_S140_WHATSAPP': {
                    const { weekId } = action.params;
                    return {
                        success: true,
                        message: `Compartilhando S-140 da semana ${weekId}`,
                        data: { weekId },
                        actionType: 'SHARE_S140_WHATSAPP'
                    };
                }

                default:
                    return { success: false, message: `Tipo de ação desconhecido: ${action.type}` };
            }
        } catch (e) {
            console.error('[AgentAction] Execution error:', e);
            return {
                success: false,
                message: e instanceof Error ? e.message : 'Erro desconhecido na execução.'
            };
        }
    }
};
