import type { WorkbookPart, Publisher } from '../types';

export type AgentActionType = 'SIMULATE_ASSIGNMENT' | 'REMOVE_ASSIGNMENT' | 'CHECK_ELIGIBILITY';

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
            responseContent.match(/{[\s\S]*"type"\s*:\s*"SIMULATE_ASSIGNMENT"[\s\S]*}/);

        if (jsonMatch) {
            try {
                const jsonStr = jsonMatch[1] || jsonMatch[0];
                const data = JSON.parse(jsonStr);

                if (data.type && (data.type === 'SIMULATE_ASSIGNMENT' || data.type === 'REMOVE_ASSIGNMENT')) {
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
            case 'SIMULATE_ASSIGNMENT':
                const { partId, publisherId, publisherName } = action.params;

                // Find target part
                const targetPart = parts.find(p => p.id === partId);
                if (!targetPart) {
                    return { success: false, message: `Parte não encontrada (ID: ${partId})` };
                }

                // If finding by name (common for LLM), resolve ID
                let resolvedPublisherId = publisherId;
                let resolvedName = publisherName;

                if (!publisherId && publisherName) {
                    const pub = publishers.find(p => p.name.toLowerCase().includes(publisherName.toLowerCase()));
                    if (pub) {
                        resolvedPublisherId = pub.id;
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
                    resolvedPublisherId: resolvedPublisherId,
                    resolvedPublisherName: resolvedName,
                    status: 'PENDING'
                };

                return {
                    success: true,
                    message: `Simulado: ${resolvedName} designado para '${targetPart.partTitle || 'Parte'}'`,
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
                    resolvedPublisherId: undefined,
                    resolvedPublisherName: undefined,
                    status: 'PENDING'
                };

                return {
                    success: true,
                    message: `Simulado: Designação removida de '${partToRemove.partTitle}'`,
                    affectedParts: [cleanedPart]
                };

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
        }
    }
};
