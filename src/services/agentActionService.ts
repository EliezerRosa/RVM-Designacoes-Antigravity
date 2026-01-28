import type { WorkbookPart, Publisher, HistoryRecord } from '../types';
import { WorkbookStatus } from '../types';
import { markManualSelection } from './manualSelectionTracker';
import { getNextInRotation, type RotationGroup } from './fairRotationService';
import { checkEligibility } from './eligibilityService';
import { loadCompletedParticipations } from './historyAdapter';

export type AgentActionType = 'SIMULATE_ASSIGNMENT' | 'SIMULATE_BATCH' | 'REMOVE_ASSIGNMENT' | 'CHECK_ELIGIBILITY' | 'SHARE_S140_WHATSAPP';

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

export interface BatchSimulationResult {
    success: boolean;
    message: string;
    results: SimulationResult[];
    skipped: { partId: string; partTitle: string; reason: string }[];
    weekId: string;
}

// Mock service for now, to be expanded
export const agentActionService = {

    // Parse response to find actions
    detectAction(responseContent: string): AgentAction | null {
        // Try to find JSON block
        const jsonMatch = responseContent.match(/```json\s*([\s\S]*?)\s*```/) ||
            responseContent.match(/{\s*[\s\S]*"type"\s*:\s*"(?:SIMULATE_ASSIGNMENT|SIMULATE_BATCH|SHARE_S140_WHATSAPP|REMOVE_ASSIGNMENT)"[\s\S]*}/);

        if (jsonMatch) {
            try {
                const jsonStr = jsonMatch[1] || jsonMatch[0];
                const data = JSON.parse(jsonStr);

                if (data.type && (
                    data.type === 'SIMULATE_ASSIGNMENT' ||
                    data.type === 'SIMULATE_BATCH' ||
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
    },

    /**
     * v9.2: Simula designação em lote para uma semana inteira
     * Usa o Motor de rotação (getNextInRotation) para cada parte pendente
     */
    async simulateBatchAction(
        weekId: string,
        parts: WorkbookPart[],
        publishers: Publisher[],
        strategy: 'rotation' | 'suggest' = 'rotation'
    ): Promise<BatchSimulationResult> {
        console.log(`[AgentAction] Batch simulation for week ${weekId}, strategy: ${strategy}`);

        // Filtrar partes pendentes desta semana (sem designação)
        const pendingParts = parts.filter(p =>
            p.weekId === weekId &&
            !p.rawPublisherName &&
            !p.resolvedPublisherName &&
            p.status !== 'CANCELADA' &&
            p.funcao === 'Titular' // Só Titulares, ajudantes vêm depois
        );

        if (pendingParts.length === 0) {
            return {
                success: false,
                message: `Nenhuma parte pendente encontrada para a semana ${weekId}.`,
                results: [],
                skipped: [],
                weekId
            };
        }

        console.log(`[AgentAction] Found ${pendingParts.length} pending parts`);

        // Carregar histórico para cooldown
        let history: HistoryRecord[] = [];
        try {
            history = await loadCompletedParticipations();
        } catch (e) {
            console.warn('[AgentAction] Failed to load history for batch:', e);
        }

        const results: SimulationResult[] = [];
        const skipped: { partId: string; partTitle: string; reason: string }[] = [];
        const assignedInBatch = new Set<string>(); // Evitar duplicar na mesma semana

        // v9.2.3: Mapear tipoParte para RotationGroup (abrangente)
        const getRotationGroup = (part: WorkbookPart): RotationGroup | null => {
            const tipoParte = (part.tipoParte || '').toUpperCase();
            const section = (part.section || '').toUpperCase();

            // Presidente da Reunião
            if (tipoParte.includes('PRESIDENTE')) return 'presidentes';

            // Orações
            if (tipoParte.includes('ORAÇÃO') || tipoParte.includes('ORACAO')) {
                return 'oracao_final';
            }

            // Seção Tesouros - Ensino (Anciãos/SM)
            if (section.includes('TESOUROS') || tipoParte.includes('TESOUROS') ||
                tipoParte.includes('JOIAS') || tipoParte.includes('DIRIGENTE') ||
                tipoParte.includes('JOÍAS')) {
                return 'ensino';
            }

            // Leitura da Bíblia - Irmãos jovens
            if (tipoParte.includes('LEITURA') && (tipoParte.includes('BÍBLIA') || tipoParte.includes('BIBLIA'))) {
                return 'estudante';
            }

            // Seção Ministério - Estudantes
            if (section.includes('MINISTÉRIO') || section.includes('MINISTERIO') ||
                tipoParte.includes('INICIANDO') || tipoParte.includes('CULTIVANDO') ||
                tipoParte.includes('FAZENDO') || tipoParte.includes('DEMONSTR') ||
                tipoParte.includes('DISCURSO DE ESTUDANTE')) {
                return 'estudante';
            }

            // Seção Vida Cristã - Ensino
            if (section.includes('VIDA CRISTÃ') || section.includes('VIDA CRISTA')) {
                // EBC = Ancião/SM
                if (tipoParte.includes('EBC') || tipoParte.includes('ESTUDO BÍBLICO') ||
                    tipoParte.includes('ESTUDO BIBLICO') || tipoParte.includes('LEITOR') ||
                    tipoParte.includes('DIRIGENTE')) {
                    return 'ensino';
                }
                // Outras partes de Vida Cristã = Ensino
                return 'ensino';
            }

            // Comentários iniciais - Presidente (já coberto acima)
            if (tipoParte.includes('COMENTÁRIOS') || tipoParte.includes('COMENTARIOS')) {
                return 'presidentes';
            }

            // Cânticos - Não precisam de designação
            if (tipoParte.includes('CÂNTICO') || tipoParte.includes('CANTICO')) {
                return null;
            }

            console.log(`[AgentAction] Unknown tipoParte: "${part.tipoParte}" section: "${part.section}"`);
            return 'estudante'; // Fallback para estudante
        };

        // Processar cada parte
        for (const part of pendingParts) {
            const group = getRotationGroup(part);
            if (!group) {
                skipped.push({ partId: part.id, partTitle: part.tituloParte || part.tipoParte || 'Parte', reason: 'Grupo de rotação não identificado' });
                continue;
            }

            try {
                // v9.2.3: Buscar próximo na rotação (skipManualExclusion=true para batch)
                const { publisher } = await getNextInRotation(
                    publishers,
                    group,
                    assignedInBatch,
                    (p) => {
                        // Filtro de elegibilidade
                        const result = checkEligibility(p, part.modalidade as any, part.funcao as any, {
                            date: part.date,
                            partTitle: part.tituloParte,
                            secao: part.section
                        });
                        return result.eligible;
                    },
                    history,
                    true // skipManualExclusion - batch gerencia próprias exclusões
                );

                if (publisher) {
                    assignedInBatch.add(publisher.name);

                    const simulatedPart: WorkbookPart = {
                        ...part,
                        resolvedPublisherName: publisher.name,
                        rawPublisherName: publisher.name,
                        status: WorkbookStatus.PENDENTE
                    };

                    results.push({
                        success: true,
                        message: `${publisher.name} → ${part.tituloParte || part.tipoParte}`,
                        affectedParts: [simulatedPart]
                    });
                } else {
                    skipped.push({
                        partId: part.id,
                        partTitle: part.tituloParte || part.tipoParte || 'Parte',
                        reason: 'Nenhum publicador elegível disponível'
                    });
                }
            } catch (e) {
                console.error(`[AgentAction] Error processing part ${part.id}:`, e);
                skipped.push({
                    partId: part.id,
                    partTitle: part.tituloParte || part.tipoParte || 'Parte',
                    reason: 'Erro ao processar'
                });
            }
        }

        const successCount = results.length;
        const skipCount = skipped.length;

        return {
            success: successCount > 0,
            message: `Simulado: ${successCount} designações criadas${skipCount > 0 ? `, ${skipCount} partes puladas` : ''}.`,
            results,
            skipped,
            weekId
        };
    },

    /**
     * v9.2: Commit de designações em lote
     */
    async commitBatchAction(batchResult: BatchSimulationResult): Promise<void> {
        if (!batchResult.success || batchResult.results.length === 0) {
            return;
        }

        console.log(`[AgentAction] Committing batch of ${batchResult.results.length} assignments`);

        for (const result of batchResult.results) {
            await this.commitAction(result);
        }

        console.log(`[AgentAction] Batch commit complete for week ${batchResult.weekId}`);
    }
};
