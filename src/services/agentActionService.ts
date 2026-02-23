import type { WorkbookPart, Publisher, HistoryRecord } from '../types';
import { markManualSelection } from './manualSelectionTracker';

import { generationService } from './generationService';
import { workbookService } from './workbookService';
import { undoService } from './undoService';
import { getRankedCandidates, explainScoreForAgent } from './unifiedRotationService';
import { checkEligibility } from './eligibilityService';
import { communicationService } from './communicationService';
import { specialEventService } from './specialEventService';
import { dataDiscoveryService } from './dataDiscoveryService';
import { auditService } from './auditService';

export type AgentActionType =
    | 'GENERATE_WEEK'
    | 'ASSIGN_PART'
    | 'UNDO_LAST'
    | 'NAVIGATE_WEEK'
    | 'VIEW_S140'
    | 'SHARE_S140_WHATSAPP'
    | 'CHECK_SCORE' // Nova Tool
    | 'CLEAR_WEEK'
    | 'UPDATE_PUBLISHER' // Nova Tool
    | 'UPDATE_AVAILABILITY' // Nova Tool
    | 'UPDATE_ENGINE_RULES' // Nova Tool
    | 'MANAGE_SPECIAL_EVENT' // Nova Tool
    | 'SEND_S140' // Nova Tool - Fase 3
    | 'SEND_S89' // Nova Tool - Fase 3
    | 'FETCH_DATA' // Nova Tool - Fase 4 (Visão Total)
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
            responseContent.match(/{\s*[\s\S]*"type"\s*:\s*"(?:GENERATE_WEEK|ASSIGN_PART|UNDO_LAST|NAVIGATE_WEEK|VIEW_S140|SHARE_S140_WHATSAPP|SIMULATE_ASSIGNMENT|CHECK_SCORE|CLEAR_WEEK|UPDATE_PUBLISHER|UPDATE_AVAILABILITY|UPDATE_ENGINE_RULES|MANAGE_SPECIAL_EVENT|SEND_S140|SEND_S89|FETCH_DATA)"[\s\S]*}/);

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

                case 'UPDATE_PUBLISHER': {
                    let { publisherName, updates, ...directUpdates } = action.params;

                    // Robustez: Se o agente mandou parâmetros flat (ex: {publisherName, isQualified}),
                    // nós os movemos para o objeto 'updates'.
                    if (!updates && Object.keys(directUpdates).length > 0) {
                        updates = directUpdates;
                    }

                    if (!publisherName || !updates) {
                        return { success: false, message: 'Faltam parâmetros: publisherName ou updates.' };
                    }

                    // Correção: Mapear 'isQualified: true' para 'isNotQualified: false' se necessário
                    if ('isQualified' in updates) {
                        updates.isNotQualified = !updates.isQualified;
                        delete updates.isQualified;
                    }

                    const pub = publishers.find(p => p.name.toLowerCase().includes(publisherName.toLowerCase().trim()));
                    if (!pub) {
                        return { success: false, message: `Publicador "${publisherName}" não encontrado na base de dados.` };
                    }

                    try {
                        const { api } = await import('./api');
                        const updatedPub = { ...pub, ...updates };

                        await api.updatePublisher(updatedPub);

                        // Auditoria Nível 2
                        await auditService.logAction({
                            table_name: 'publishers',
                            operation: 'AGENT_INTENT',
                            record_id: updatedPub.id,
                            new_data: updatedPub,
                            description: `Agente atualizou publicador: ${action.description}`
                        });

                        return {
                            success: true,
                            message: `**Atualização Concluída:** Dados de **${pub.name}** foram alterados com sucesso!`,
                            data: updatedPub,
                            actionType: 'UPDATE_PUBLISHER'
                        };
                    } catch (e) {
                        console.error('[AgentAction] Fail to update publisher', e);
                        return { success: false, message: `Erro ao atualizar publicador: ${e instanceof Error ? e.message : 'Desconhecido'}` };
                    }
                }

                case 'UPDATE_AVAILABILITY': {
                    const { publisherName, unavailableDates } = action.params;
                    if (!publisherName || !unavailableDates || !Array.isArray(unavailableDates)) {
                        return { success: false, message: 'Faltam parâmetros: publisherName ou unavailableDates (Array de strings).' };
                    }

                    const pub = publishers.find(p => p.name.toLowerCase().includes(publisherName.toLowerCase().trim()));
                    if (!pub) {
                        return { success: false, message: `Publicador "${publisherName}" não encontrado para bloquar as datas.` };
                    }

                    try {
                        const { api } = await import('./api');

                        // Atualizando mantendo modo `always` implícito (Padrão para quem está bloqueando datas específicas)
                        const updatedPub = {
                            ...pub,
                            availability: {
                                ...pub.availability,
                                exceptionDates: unavailableDates // Substituído ou mesclado dependendo da lógica do JSON do modelo, ideal é que o prompt peça o status completo.
                            }
                        };

                        await api.updatePublisher(updatedPub);

                        // Auditoria Nível 2
                        await auditService.logAction({
                            table_name: 'publishers',
                            operation: 'AGENT_INTENT',
                            record_id: updatedPub.id,
                            new_data: updatedPub,
                            description: `Agente bloqueou datas de disponibilidade: ${action.description}`
                        });

                        return {
                            success: true,
                            message: `**Agenda Atualizada:** As seguintes datas **(${unavailableDates.join(', ')})** foram marcadas como indisponíveis para **${pub.name}**!`,
                            data: updatedPub,
                            actionType: 'UPDATE_AVAILABILITY'
                        };

                    } catch (e) {
                        console.error('[AgentAction] Fail to update availability', e);
                        return { success: false, message: `Erro ao ajustar agenda: ${e instanceof Error ? e.message : 'Desconhecido'}` };
                    }
                }

                case 'UPDATE_ENGINE_RULES': {
                    const { settings } = action.params;
                    if (!settings || typeof settings !== 'object') {
                        return { success: false, message: 'Faltam os parâmetros de configuração (objeto settings).' };
                    }

                    try {
                        const { api } = await import('./api');
                        const { updateRotationConfig, getRotationConfig } = await import('./unifiedRotationService');

                        // 1. Persistir no banco
                        const currentGlobalConfig = getRotationConfig();
                        const mergedConfig = { ...currentGlobalConfig, ...settings };

                        await api.setSetting('engine_config', mergedConfig);

                        // Auditoria Nível 3
                        await auditService.logAction({
                            table_name: 'settings',
                            operation: 'AGENT_INTENT',
                            record_id: 'engine_config',
                            new_data: mergedConfig,
                            description: `Agente alterou regras do motor: ${action.description}`
                        });

                        // 2. Aplicar em memória imediatamente
                        updateRotationConfig(settings);

                        return {
                            success: true,
                            message: `**Configuração do Motor Atualizada:** As novas regras foram aplicadas com sucesso e persistidas no banco.`,
                            data: settings,
                            actionType: 'UPDATE_ENGINE_RULES'
                        };
                    } catch (e) {
                        console.error('[AgentAction] Fail to update engine rules', e);
                        return { success: false, message: `Erro ao atualizar regras do motor: ${e instanceof Error ? e.message : 'Desconhecido'}` };
                    }
                }

                case 'SEND_S140': {
                    const { weekId } = action.params;

                    if (!weekId) return { success: false, message: 'Semana não especificada.' };

                    try {
                        const weekParts = parts.filter(p => p.weekId === weekId);
                        const message = communicationService.prepareS140Message(weekId, weekParts);

                        await communicationService.logNotification({
                            type: 'S140',
                            recipient_name: 'Grupo de Anciãos e Servos',
                            title: `Programação da Semana ${weekId}`,
                            content: message,
                            status: 'PREPARED',
                            metadata: { weekId },
                            action_url: communicationService.generateWhatsAppUrl('', message)
                        });

                        return {
                            success: true,
                            message: `**Programação da Semana ${weekId}**: Abrindo ferramenta de envio...`,
                            data: { weekId, openModal: true },
                            actionType: 'SEND_S140'
                        };
                    } catch (e) {
                        return { success: false, message: `Erro ao preparar S-140: ${e instanceof Error ? e.message : 'Desconhecido'}` };
                    }
                }

                case 'SEND_S89': {
                    const { weekId } = action.params;

                    if (!weekId) return { success: false, message: 'Semana não especificada.' };

                    try {
                        const weekParts = parts.filter(p => p.weekId === weekId && (p.resolvedPublisherName || p.rawPublisherName));

                        let count = 0;
                        for (const part of weekParts) {
                            const pType = (part.tipoParte || '').toLowerCase();
                            const pSection = (part.section || '').toLowerCase();

                            // 1. Filtros Inteligentes (User Request 2.2)
                            // Ignorar Presidente, Cânticos e Comentários
                            // MAS Incluir Oração Final
                            const isAdminPart = pType.includes('presidente') ||
                                pType.includes('cântico') ||
                                pType.includes('cantico') ||
                                pType.includes('comentários') ||
                                pType.includes('comentarios');

                            const isFinalPrayer = pType.includes('oração final') || pType.includes('oracao final');

                            if (isAdminPart && !isFinalPrayer) {
                                console.log(`[AgentAction] Pulando parte administrativa: ${part.tipoParte}`);
                                continue;
                            }

                            // 2. Identificar se é Estudante (Para S-89 Image Capture - User Request 2.1)
                            // Geralmente na seção "Faça seu melhor no ministério" ou tipos específicos
                            const isStudent = pSection.includes('ministério') ||
                                pSection.includes('ministerio') ||
                                pType.includes('leitura') ||
                                pType.includes('conversa') ||
                                pType.includes('revisita') ||
                                pType.includes('estudo');

                            const { content, phone } = communicationService.prepareS89Message(part, publishers, weekParts);

                            await communicationService.logNotification({
                                type: 'S89',
                                recipient_name: part.resolvedPublisherName || part.rawPublisherName,
                                recipient_phone: phone,
                                title: `S-89: ${part.tipoParte}`,
                                content: content,
                                status: 'PREPARED',
                                metadata: {
                                    weekId,
                                    partId: part.id,
                                    isStudent: isStudent // Flag crucial para o Hub
                                },
                                action_url: phone ? communicationService.generateWhatsAppUrl(phone, content) : undefined
                            });
                            count++;
                        }

                        return {
                            success: true,
                            message: `**Designações da Semana ${weekId}**: Abrindo ferramenta de cartões...`,
                            data: { weekId, openModal: true },
                            actionType: 'SEND_S89'
                        };
                    } catch (e) {
                        return { success: false, message: `Erro ao preparar S-89: ${e instanceof Error ? e.message : 'Desconhecido'}` };
                    }
                }

                case 'FETCH_DATA': {
                    const { table, select, filters, limit, order, context } = action.params;

                    try {
                        let tablesToQuery = [table];
                        if (context) {
                            tablesToQuery = dataDiscoveryService.getTableFromContext(context);
                        }

                        if (!tablesToQuery[0] && !table) {
                            return { success: false, message: 'Tabela ou Contexto não especificado para FETCH_DATA.' };
                        }

                        const results: Record<string, any[]> = {};
                        for (const t of tablesToQuery) {
                            results[t] = await dataDiscoveryService.fetchData({
                                table: t,
                                select,
                                filters,
                                limit: limit || 50,
                                order
                            });
                        }

                        return {
                            success: true,
                            message: `**Consulta Realizada**: Dados obtidos dos contextos: ${Object.keys(results).join(', ')}.`,
                            data: results,
                            actionType: 'FETCH_DATA'
                        };
                    } catch (e) {
                        console.error('[AgentAction] Fail to fetch data', e);
                        return { success: false, message: `Erro ao buscar dados: ${e instanceof Error ? e.message : 'Desconhecido'}` };
                    }
                }

                case 'MANAGE_SPECIAL_EVENT': {
                    const { action: subAction, eventData, eventId } = action.params;

                    try {
                        if (subAction === 'CREATE_AND_APPLY') {
                            if (!eventData || !eventData.week || !eventData.templateId) {
                                return { success: false, message: 'Faltam dados do evento (week, templateId).' };
                            }

                            // 1. Criar o evento
                            const newEvent = await specialEventService.createEvent(eventData);

                            // 2. Buscar partes da semana para aplicar impacto
                            const weekParts = await workbookService.getAll({ weekId: eventData.week });
                            const partIds = weekParts.map(p => p.id);

                            if (partIds.length > 0) {
                                // 3. Aplicar impacto
                                const { affected } = await specialEventService.applyEventImpact(newEvent, partIds);
                                return {
                                    success: true,
                                    message: `**Evento Criado e Aplicado:** "${newEvent.theme || newEvent.templateId}" na semana ${eventData.week}. ${affected} partes foram impactadas.`,
                                    data: { event: newEvent, affected },
                                    actionType: 'MANAGE_SPECIAL_EVENT'
                                };
                            }

                            return {
                                success: true,
                                message: `**Evento Criado:** "${newEvent.theme || newEvent.templateId}" para a semana ${eventData.week}. Nota: Nenhuma parte da apostila encontrada para esta semana para aplicar o impacto imediato.`,
                                data: { event: newEvent, affected: 0 },
                                actionType: 'MANAGE_SPECIAL_EVENT'
                            };
                        }

                        if (subAction === 'DELETE') {
                            if (!eventId) return { success: false, message: 'Falta o ID do evento para deletar.' };

                            // 1. Buscar evento para poder reverter impacto
                            const allEvents = await specialEventService.getAllEvents();
                            const eventToDel = allEvents.find(e => e.id === eventId);

                            if (eventToDel && eventToDel.isApplied) {
                                await specialEventService.revertEventImpact(eventToDel);
                            }

                            await specialEventService.deleteEvent(eventId);
                            return {
                                success: true,
                                message: `**Evento Removido:** O evento foi deletado e seus impactos na apostila foram revertidos.`,
                                actionType: 'MANAGE_SPECIAL_EVENT'
                            };
                        }

                        return { success: false, message: `Sub-ação "${subAction}" não implementada para MANAGE_SPECIAL_EVENT.` };

                    } catch (e) {
                        console.error('[AgentAction] Fail to manage special event', e);
                        return { success: false, message: `Erro ao gerenciar evento especial: ${e instanceof Error ? e.message : 'Desconhecido'}` };
                    }
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
