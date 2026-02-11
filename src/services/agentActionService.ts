import type { WorkbookPart, Publisher, HistoryRecord } from '../types';
import { markManualSelection } from './manualSelectionTracker';

import { generationService } from './generationService';
import { workbookService } from './workbookService';
import { undoService } from './undoService';
import { getRankedCandidates, explainScoreForAgent } from './unifiedRotationService';
import { checkEligibility } from './eligibilityService';

export type AgentActionType =
    | 'GENERATE_WEEK'
    | 'ASSIGN_PART'
    | 'UNDO_LAST'
    | 'NAVIGATE_WEEK'
    | 'VIEW_S140'
    | 'SHARE_S140_WHATSAPP'
    | 'CHECK_SCORE' // Nova Tool
    | 'CLEAR_WEEK'
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
            responseContent.match(/{\s*[\s\S]*"type"\s*:\s*"(?:GENERATE_WEEK|ASSIGN_PART|UNDO_LAST|NAVIGATE_WEEK|VIEW_S140|SHARE_S140_WHATSAPP|SIMULATE_ASSIGNMENT|CHECK_SCORE|CLEAR_WEEK)"[\s\S]*}/);

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
    async executeAction(
        action: AgentAction,
        parts: WorkbookPart[],
        publishers: Publisher[],
        history: HistoryRecord[] = [] // Agora recebe histórico completo
    ): Promise<ActionResult> {
        console.log('[AgentAction] Executing:', action);

        try {
            switch (action.type) {
                case 'CHECK_SCORE': {
                    const { partType, date } = action.params;

                    // 1. Filtrar elegíveis
                    const eligible = publishers.filter(p => checkEligibility(p, partType));

                    if (eligible.length === 0) {
                        return { success: false, message: `Nenhum publicador elegível encontrado para ${partType}.` };
                    }

                    // 2. Calcular Ranking (Full History)
                    const ranked = getRankedCandidates(eligible, partType, history);

                    // 3. Formatar Top 10
                    const topList = ranked.slice(0, 10).map((cand, i) =>
                        `${i + 1}. ${explainScoreForAgent(cand)}`
                    ).join('\n');

                    return {
                        success: true,
                        message: `📊 **Análise do Cérebro (Top 10):**\nPara: ${partType} (Ref: ${date || 'Hoje'})\n\n${topList}`,
                        data: ranked,
                        actionType: 'CHECK_SCORE'
                    };
                }

                case 'GENERATE_WEEK': {
                    const { weekId } = action.params;
                    if (!weekId) return { success: false, message: 'Semana não especificada.' };

                    // Capturar snapshot ANTES da geração (para undo correto)
                    const partsInWeek = parts.filter(p => p.weekId === weekId);
                    undoService.captureBatch(partsInWeek, `Agente: Gerar Semana ${weekId}`);

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

                case 'UNDO_LAST': {
                    const result = await undoService.undo();
                    return {
                        success: result.success,
                        message: result.success ? `Ação desfeita: ${result.description || 'Desconhecida'}` : 'Não há ações para desfazer.',
                        actionType: 'UNDO_LAST'
                    };
                }


                case 'CLEAR_WEEK': {
                    const { weekId: clearWeekId } = action.params;
                    if (!clearWeekId) return { success: false, message: 'Semana não especificada.' };

                    // Capturar snapshot antes de limpar
                    const weekPartsToClean = parts.filter(p => p.weekId === clearWeekId);
                    if (weekPartsToClean.length === 0) {
                        return { success: false, message: 'Nenhuma parte encontrada para esta semana.' };
                    }

                    undoService.captureBatch(weekPartsToClean, `Agente: Limpar Semana ${clearWeekId}`);

                    // Limpar todas as designações da semana direto no banco
                    let clearedCount = 0;
                    for (const p of weekPartsToClean) {
                        if (p.resolvedPublisherName) {
                            await workbookService.updatePart(p.id, {
                                resolvedPublisherName: '',
                                status: 'PENDENTE'
                            });
                            clearedCount++;
                        }
                    }

                    return {
                        success: true,
                        message: `${clearedCount} designações removidas da semana ${clearWeekId}.`,
                        actionType: 'CLEAR_WEEK'
                    };
                }

                case 'ASSIGN_PART':
                case 'SIMULATE_ASSIGNMENT': {
                    const { partId, publisherId, publisherName, weekId, partName } = action.params;

                    let targetPart = parts.find(p => p.id === partId);

                    // Fallback: Tentar encontrar por Nome + Semana se ID não fornecido
                    if (!targetPart && weekId && partName) {
                        const candidates = parts.filter(p => p.weekId === weekId);
                        const qName = partName.toLowerCase().trim();

                        // Normalizar aliases comuns
                        const PART_ALIASES: Record<string, string[]> = {
                            'presidente da reunião': ['presidente', 'chairman', 'chairperson'],
                            'oração final': ['oração', 'oracao final', 'oracao'],
                            'comentários iniciais': ['comentarios iniciais'],
                            'comentários finais': ['comentarios finais'],
                        };

                        // Expandir qName: se é um alias, tentar o nome canônico
                        let expandedNames = [qName];
                        for (const [canonical, aliases] of Object.entries(PART_ALIASES)) {
                            if (aliases.includes(qName) || qName === canonical) {
                                expandedNames = [canonical, ...aliases, qName];
                                break;
                            }
                        }

                        targetPart = candidates.find(p => {
                            const pTitle = (p.tituloParte || '').toLowerCase();
                            const pType = (p.tipoParte || '').toLowerCase();

                            for (const query of expandedNames) {
                                // 1. Query inside DB title/type (standard)
                                if (pTitle && pTitle.includes(query)) return true;
                                if (pType && pType.includes(query)) return true;

                                // 2. Exact match on tipoParte
                                if (pType && pType === query) return true;

                                // 3. DB inside Query (handles "1. Term..." vs "Term")
                                if (pTitle && pTitle.length > 3 && query.includes(pTitle)) return true;
                                if (pType && pType.length > 3 && query.includes(pType)) return true;
                            }

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

                    // UNDO Capture (Temporário aqui, ideal mover para UnifiedActionService)
                    if (resolvedName) {
                        undoService.captureSingle(targetPart, `Agente: Designar ${resolvedName}`);
                    }

                    // DELEGAR para UnifiedActionService
                    const { unifiedActionService } = await import('./unifiedActionService');

                    let actionResult;
                    if (resolvedName) {
                        actionResult = await unifiedActionService.executeDesignation(
                            targetPart.id,
                            resolvedName,
                            'AGENT',
                            'Solicitado via Chat'
                        );
                    } else {
                        actionResult = await unifiedActionService.revertDesignation(
                            targetPart.id,
                            'AGENT',
                            'Solicitado via Chat (Remover)'
                        );
                    }

                    if (!actionResult.success) {
                        return { success: false, message: actionResult.error || 'Erro na designação' };
                    }

                    // Marcar seleção manual (Tracker)
                    if (resolvedName) {
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
                    }

                    return {
                        success: true,
                        message: resolvedName ? `Parte atribuída a ${resolvedName}` : 'Designação removida.',
                        data: { partId: targetPart.id, assignedTo: resolvedName },
                        actionType: 'ASSIGN_PART'
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

                case 'VIEW_S140':
                case 'SHARE_S140_WHATSAPP': {
                    const { weekId } = action.params;
                    return {
                        success: true,
                        message: action.type === 'VIEW_S140'
                            ? `Visualizando S-140 da semana ${weekId}`
                            : `Compartilhando S-140 da semana ${weekId}`,
                        data: { weekId },
                        actionType: action.type
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
