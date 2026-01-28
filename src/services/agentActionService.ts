import type { WorkbookPart, Publisher } from '../types';
import { WorkbookStatus } from '../types';
import { markManualSelection } from './manualSelectionTracker';

export type AgentActionType = 'SIMULATE_ASSIGNMENT' | 'REMOVE_ASSIGNMENT' | 'CHECK_ELIGIBILITY' | 'SHARE_S140_WHATSAPP';

export interface AgentAction {
    type: AgentActionType;
    params: Record<string, any>;
    description: string;
}

export interface SimulationResult {
    success: boolean;
    message: string;
    affectedParts?: WorkbookPart[];
    validationErrors?: string[];
}

// Mock service for now, to be expanded
export const agentActionService = {

    // Parse response to find actions
    detectAction(responseContent: string): AgentAction | null {
        // Try to find JSON block
        const jsonMatch = responseContent.match(/```json\s*([\s\S]*?)\s*```/) ||
            responseContent.match(/{[\s\S]*"type"\s*:\s*"(?:SIMULATE_ASSIGNMENT|SHARE_S140_WHATSAPP|REMOVE_ASSIGNMENT)"[\s\S]*}/);

        if (jsonMatch) {
            try {
                const jsonStr = jsonMatch[1] || jsonMatch[0];
                const data = JSON.parse(jsonStr);

                if (data.type && (
                    data.type === 'SIMULATE_ASSIGNMENT' ||
                    data.type === 'REMOVE_ASSIGNMENT' ||
                    data.type === 'SHARE_S140_WHATSAPP'
                )) {
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

    // Execute a simulation (doesn't commit to DB)
    async simulateAction(action: AgentAction, parts: WorkbookPart[], publishers: Publisher[]): Promise<SimulationResult> {
        console.log('[AgentAction] Simulating:', action);

        switch (action.type) {
            case 'SHARE_S140_WHATSAPP':
                const { weekId } = action.params;
                if (!weekId) {
                    return { success: false, message: 'Semana não especificada para compartilhamento.' };
                }
                return {
                    success: true,
                    message: `Preparando imagem do S-140 para semana ${weekId}...`
                };

            case 'SIMULATE_ASSIGNMENT':
                // ... (existing implementation)
                const { partId, publisherId, publisherName } = action.params;

                // Find target part
                const targetPart = parts.find(p => p.id === partId);
                if (!targetPart) {
                    return { success: false, message: `Parte não encontrada (ID: ${partId})` };
                }

                // If finding by name (common for LLM), resolve name
                let resolvedName = publisherName;

                if (!publisherId && publisherName) {
                    const pub = publishers.find(p => p.name.toLowerCase().includes(publisherName.toLowerCase()));
                    if (pub) {
                        resolvedName = pub.name;
                    } else {
                        return { success: false, message: `Publicador '${publisherName}' não encontrado.` };
                    }
                }

                if (!resolvedName) {
                    return { success: false, message: 'Nome do publicador não fornecido.' };
                }

                // Create simulated part
                const simulatedPart: WorkbookPart = {
                    ...targetPart,
                    resolvedPublisherName: resolvedName,
                    status: WorkbookStatus.PENDENTE
                };

                return {
                    success: true,
                    message: `Simulado: ${resolvedName} designado para '${targetPart.tituloParte || 'Parte'}'`,
                    affectedParts: [simulatedPart]
                };

            case 'REMOVE_ASSIGNMENT':
                const { partId: removePartId } = action.params;
                const partToRemove = parts.find(p => p.id === removePartId);
                if (!partToRemove) {
                    return { success: false, message: 'Parte não encontrada para remoção.' };
                }

                const cleanedPart: WorkbookPart = {
                    ...partToRemove,
                    resolvedPublisherName: undefined,
                    status: WorkbookStatus.PENDENTE
                };

                return {
                    success: true,
                    message: `Simulado: Designação removida de '${partToRemove.tituloParte}'`,
                    affectedParts: [cleanedPart]
                };

            default:
                return { success: false, message: 'Ação desconhecida' };
        }
    },

    // Commit changes to database
    async commitAction(result: SimulationResult): Promise<void> {
        if (!result.success || !result.affectedParts) {
            return;
        }

        // Import dynamically to avoid circular dependencies if any (though here it's fine)
        const { workbookService } = await import('./workbookService');

        console.log('[AgentAction] Committing action:', result.affectedParts);

        for (const part of result.affectedParts) {
            await workbookService.updatePart(part.id, {
                resolvedPublisherName: part.resolvedPublisherName,
                status: part.status
            });

            // v9.1: Marcar seleção feita pelo Agente para evitar duplicatas pelo Motor
            // Isso garante que o fairRotationService exclua este publicador da próxima geração
            if (part.resolvedPublisherName) {
                try {
                    await markManualSelection(
                        part.resolvedPublisherName,
                        part.tipoParte || 'Parte via Agente',
                        part.weekId || '',
                        part.date || ''
                    );
                    console.log(`[AgentAction] Seleção marcada no tracker: ${part.resolvedPublisherName}`);
                } catch (e) {
                    console.warn('[AgentAction] Erro ao marcar seleção no tracker:', e);
                }
            }
        }
    }
};
