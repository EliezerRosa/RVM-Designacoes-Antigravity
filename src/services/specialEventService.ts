/**
 * Special Event Service
 * Gerencia eventos especiais que impactam semanas da apostila
 */

import { supabase } from '../lib/supabase';
import type { EventTemplate, SpecialEvent, EventImpactAction } from '../types';

// ============================================================================
// TEMPLATES PRÉ-DEFINIDOS (Pode ser movido para BD futuramente)
// ============================================================================

export const EVENT_TEMPLATES: EventTemplate[] = [
    // EVENTO 1 (Discurso de Visitante) - REMOVIDO conforme solicitação do usuário

    {
        id: 'visita-sc',
        name: 'Visita do Superintendente de Circuito',
        description: 'Semana de visita do SC. Cancela EBC, Necessidades Locais e Comentários Finais. Mantém Discurso de Ensino na Vida Cristã. Adiciona transição para o SC.',
        impact: { action: 'SC_VISIT_LOGIC' },
        defaults: { duration: 30, requiresTheme: false, requiresAssignee: false },
    },
    {
        id: 'assembleia-circuito',
        name: 'Assembleia de Circuito',
        description: 'Não há reunião nesta semana devido à Assembleia de Circuito.',
        impact: { action: 'CANCEL_WEEK' },
        defaults: { duration: 0, requiresTheme: false, requiresAssignee: false },
    },
    {
        id: 'congresso',
        name: 'Congresso Regional',
        description: 'Não há reunião nesta semana devido ao Congresso Regional.',
        impact: { action: 'CANCEL_WEEK' },
        defaults: { duration: 0, requiresTheme: false, requiresAssignee: false },
    },
    {
        id: 'boletim-cg',
        name: 'Boletim do Corpo Governante',
        description: 'Boletim AAAA nº NN do Corpo Governante. Adiciona parte extra e ajusta tempo do EBC (não exclui). Preserva tempo total.',
        impact: {
            action: 'TIME_ADJUSTMENT',
            timeReduction: { targetPart: 'EBC', minutes: 10 }
        },
        defaults: { duration: 10, theme: 'Boletim do Corpo Governante', requiresTheme: true, requiresAssignee: false },
    },
    {
        id: 'evento-especial',
        name: 'Evento Especial',
        description: 'Evento personalizado. Requer tema e responsável.',
        impact: { action: 'ADD_PART' },
        defaults: { duration: 15, requiresTheme: true, requiresAssignee: true },
    },
    // --- EVENTOS SATÉLITE (Vinculados a Assembleia/Congresso) ---
    {
        id: 'preparacao-assembleia',
        name: 'Preparação para Assembleia de Circuito',
        description: 'Parte de preparação para assembleia. Reduz tempo de outra parte na Vida Cristã. Use na semana anterior à Assembleia.',
        impact: { action: 'REDUCE_VIDA_CRISTA_TIME' },
        defaults: { duration: 10, requiresTheme: true, requiresAssignee: true },
    },
    {
        id: 'recapitulacao-assembleia',
        name: 'Recapitulação da Assembleia de Circuito',
        description: 'Parte de recapitulação da assembleia. Reduz tempo de outra parte na Vida Cristã. Use na semana posterior à Assembleia.',
        impact: { action: 'REDUCE_VIDA_CRISTA_TIME' },
        defaults: { duration: 10, requiresTheme: true, requiresAssignee: true },
    },
    {
        id: 'preparacao-congresso',
        name: 'Preparação para Congresso',
        description: 'Parte de preparação para o congresso. Reduz tempo de outra parte na Vida Cristã. Use na semana anterior ao Congresso.',
        impact: { action: 'REDUCE_VIDA_CRISTA_TIME' },
        defaults: { duration: 10, requiresTheme: true, requiresAssignee: true },
    },
    {
        id: 'recapitulacao-congresso',
        name: 'Recapitulação do Congresso',
        description: 'Parte de recapitulação do congresso. Reduz tempo de outra parte na Vida Cristã. Use na semana posterior ao Congresso.',
        impact: { action: 'REDUCE_VIDA_CRISTA_TIME' },
        defaults: { duration: 10, requiresTheme: true, requiresAssignee: true },
    },
    // --- EVENTOS INFORMATIVOS ---
    {
        id: 'anuncio',
        name: 'Anúncio',
        description: 'Anúncio para a congregação. Por padrão sem impacto nas partes, mas pode ser configurado para cancelar/reduzir partes se necessário.',
        impact: { action: 'NO_IMPACT' },
        defaults: { duration: 0, requiresTheme: true, requiresAssignee: false },
    },
    {
        id: 'notificacao',
        name: 'Notificação',
        description: 'Notificação informativa. Por padrão sem impacto nas partes, mas pode ser configurado para cancelar/reduzir partes se necessário.',
        impact: { action: 'NO_IMPACT' },
        defaults: { duration: 0, requiresTheme: true, requiresAssignee: false },
    },
];

// ============================================================================
// HELPER: Converter snake_case do BD para camelCase do TypeScript
// ============================================================================
function mapDbToEvent(row: Record<string, unknown>): SpecialEvent {
    return {
        id: row.id as string,
        week: row.week as string,
        templateId: row.template_id as string,
        theme: row.theme as string | undefined,
        responsible: row.responsible as string | undefined,
        duration: row.duration as number | undefined,
        boletimYear: row.boletim_year as number | undefined,
        boletimNumber: row.boletim_number as number | undefined,
        guidelines: row.guidelines as string | undefined,
        observations: row.observations as string | undefined,
        configuration: row.configuration as SpecialEvent['configuration'],
        isApplied: row.is_applied as boolean | undefined,
        appliedAt: row.applied_at as string | undefined,
        details: row.details as Record<string, unknown> | undefined,
        createdAt: row.created_at as string | undefined,
        updatedAt: row.updated_at as string | undefined,
        createdBy: row.created_by as string | undefined,
        parentEventId: row.parent_event_id as string | undefined,
        targetPartId: row.target_part_id as string | undefined,
        // Suporte Múltiplos Impactos (JSONB)
        impacts: row.impacts as EventImpactOverride[] | undefined,
        // Campos legados (Para retrocompatibilidade)
        overrideAction: row.override_action as EventImpactAction | undefined,
        affectedPartIds: row.affected_part_ids as string[] | undefined,
        content: row.content as string | undefined,
        reference: row.reference as string | undefined,
        links: row.links as string[] | undefined,
    };
}

// ============================================================================
// MÉTODOS DO SERVIÇO
// ============================================================================

export const specialEventService = {
    // Obter todos os templates disponíveis
    getTemplates(): EventTemplate[] {
        return EVENT_TEMPLATES;
    },

    // Obter template por ID
    getTemplateById(id: string): EventTemplate | undefined {
        return EVENT_TEMPLATES.find(t => t.id === id);
    },

    // Obter eventos de uma semana específica
    async getEventsByWeek(weekId: string): Promise<SpecialEvent[]> {
        const { data, error } = await supabase
            .from('special_events')
            .select('*')
            .eq('week', weekId);

        if (error) throw new Error(`Erro ao buscar eventos: ${error.message}`);
        return (data || []).map(row => mapDbToEvent(row as Record<string, unknown>));
    },

    // Obter TODOS os eventos ordenados por semana
    async getAllEvents(): Promise<SpecialEvent[]> {
        const { data, error } = await supabase
            .from('special_events')
            .select('*')
            .order('week', { ascending: true });

        if (error) throw new Error(`Erro ao buscar eventos: ${error.message}`);
        return (data || []).map(row => mapDbToEvent(row as Record<string, unknown>));
    },

    // Obter todos os eventos futuros
    async getFutureEvents(): Promise<SpecialEvent[]> {
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('special_events')
            .select('*')
            .gte('week', today)
            .order('week', { ascending: true });

        if (error) throw new Error(`Erro ao buscar eventos: ${error.message}`);
        return (data || []).map(row => mapDbToEvent(row as Record<string, unknown>));
    },

    // Criar novo evento
    async createEvent(event: Omit<SpecialEvent, 'id'>): Promise<SpecialEvent> {
        // Converter camelCase para snake_case
        const dbEvent = {
            template_id: event.templateId,
            week: event.week,
            theme: event.theme,
            responsible: event.responsible,
            duration: event.duration,
            is_applied: event.isApplied ?? false,
            applied_at: event.appliedAt,
            boletim_year: event.boletimYear,
            boletim_number: event.boletimNumber,
            guidelines: event.guidelines,
            observations: event.observations,
            configuration: event.configuration,
            details: event.details,
            parent_event_id: event.parentEventId,
            target_part_id: event.targetPartId,
            // Novos campos
            override_action: event.overrideAction,
            affected_part_ids: event.affectedPartIds,
            content: event.content,
            reference: event.reference,
            links: event.links,
        };

        const { data, error } = await supabase
            .from('special_events')
            .insert(dbEvent)
            .select()
            .single();

        if (error) throw new Error(`Erro ao criar evento: ${error.message}`);
        return mapDbToEvent(data as Record<string, unknown>);
    },

    // Atualizar evento existente
    async updateEvent(id: string, updates: Partial<SpecialEvent>): Promise<void> {
        // Converter camelCase para snake_case
        const dbUpdates: Record<string, unknown> = {};
        if (updates.templateId !== undefined) dbUpdates.template_id = updates.templateId;
        if (updates.week !== undefined) dbUpdates.week = updates.week;
        if (updates.theme !== undefined) dbUpdates.theme = updates.theme;
        if (updates.responsible !== undefined) dbUpdates.responsible = updates.responsible;
        if (updates.duration !== undefined) dbUpdates.duration = updates.duration;
        if (updates.isApplied !== undefined) dbUpdates.is_applied = updates.isApplied;
        if (updates.appliedAt !== undefined) dbUpdates.applied_at = updates.appliedAt;
        if (updates.boletimYear !== undefined) dbUpdates.boletim_year = updates.boletimYear;
        if (updates.boletimNumber !== undefined) dbUpdates.boletim_number = updates.boletimNumber;
        if (updates.guidelines !== undefined) dbUpdates.guidelines = updates.guidelines;
        if (updates.observations !== undefined) dbUpdates.observations = updates.observations;
        if (updates.configuration !== undefined) dbUpdates.configuration = updates.configuration;
        if (updates.details !== undefined) dbUpdates.details = updates.details;

        // Suporte Múltiplos Impactos
        if (updates.impacts !== undefined) dbUpdates.impacts = updates.impacts;

        // Novos campos / Legados
        if (updates.overrideAction !== undefined) dbUpdates.override_action = updates.overrideAction;
        if (updates.affectedPartIds !== undefined) dbUpdates.affected_part_ids = updates.affectedPartIds;
        if (updates.content !== undefined) dbUpdates.content = updates.content;
        if (updates.reference !== undefined) dbUpdates.reference = updates.reference;
        if (updates.links !== undefined) dbUpdates.links = updates.links;

        const { error } = await supabase
            .from('special_events')
            .update(dbUpdates)
            .eq('id', id);

        if (error) throw new Error(`Erro ao atualizar evento: ${error.message}`);
    },

    // Deletar evento
    async deleteEvent(id: string): Promise<void> {
        const { error } = await supabase
            .from('special_events')
            .delete()
            .eq('id', id);

        if (error) throw new Error(`Erro ao deletar evento: ${error.message}`);
    },

    // ========================================================================
    // LÓGICA DE IMPACTO
    // ========================================================================

    /**
     * Helper interno para resolver os impactos de um evento (lê JSONB ou gera fallback)
     */
    _resolveImpacts(event: SpecialEvent, template: EventTemplate): EventImpactOverride[] {
        if (event.impacts && event.impacts.length > 0) {
            return event.impacts;
        }

        // Retro-compatibilidade (Fallback)
        const action = event.overrideAction || template.impact.action || 'NO_IMPACT';
        const legacyImpact: EventImpactOverride = { action: action as EventImpactAction };

        if (event.affectedPartIds && event.affectedPartIds.length > 0) {
            legacyImpact.affectedPartIds = event.affectedPartIds;
        }

        if (event.targetPartId) {
            legacyImpact.timeReductionDetails = {
                targetPartId: event.targetPartId,
                minutes: event.duration || 10
            };
        } else if (template.impact.timeReduction) {
            legacyImpact.timeReductionDetails = {
                targetType: template.impact.timeReduction.targetPart as any,
                minutes: template.impact.timeReduction.minutes
            };
        }

        return [legacyImpact];
    },

    /**
     * Aplica o impacto de um evento especial nas partes da apostila.
     * @param event Evento a ser aplicado
     * @param weekParts IDs das partes da semana afetada
     */
    async applyEventImpact(event: SpecialEvent, weekParts: string[]): Promise<{ affected: number }> {
        const template = this.getTemplateById(event.templateId);
        if (!template) throw new Error(`Template não encontrado: ${event.templateId}`);

        const resolvedImpacts = this._resolveImpacts(event, template);
        let totalAffected = 0;

        // 1. Aplicar vínculos visuais (*¹) globais DEFINIDOS NO EVENTO
        if (event.affectedPartIds && event.affectedPartIds.length > 0) {
            const { error, count } = await supabase
                .from('workbook_parts')
                .update({ affected_by_event_id: event.id })
                .in('id', event.affectedPartIds);
            if (error) throw error;
            totalAffected += count || 0;
        }

        for (const impact of resolvedImpacts) {
            switch (impact.action) {
                case 'NO_IMPACT':
                    if (impact.affectedPartIds && impact.affectedPartIds.length > 0) {
                        const { error, count } = await supabase
                            .from('workbook_parts')
                            .update({ affected_by_event_id: event.id })
                            .in('id', impact.affectedPartIds);
                        if (error) throw error;
                        totalAffected += count || 0;
                    }
                    break;

                case 'REPLACE_PART':
                    if (impact.affectedPartIds && impact.affectedPartIds.length > 0) {
                        const { error, count } = await supabase
                            .from('workbook_parts')
                            .update({ status: 'CANCELADA', cancel_reason: `Evento: ${template.name}`, affected_by_event_id: event.id })
                            .in('id', impact.affectedPartIds);
                        if (error) throw error;
                        totalAffected += count || 0;
                    } else if (template.impact.targetType) {
                        // Fallback filtering by tipo_parte
                        const targetTypes = Array.isArray(template.impact.targetType)
                            ? template.impact.targetType
                            : [template.impact.targetType];
                        const { data: parts } = await supabase
                            .from('workbook_parts')
                            .select('id, tipo_parte')
                            .in('id', weekParts);
                        if (parts) {
                            const idsToCancel = parts
                                .filter(p => targetTypes.includes(p.tipo_parte))
                                .map(p => p.id);
                            if (idsToCancel.length > 0) {
                                const { error, count } = await supabase
                                    .from('workbook_parts')
                                    .update({ status: 'CANCELADA', cancel_reason: `Evento: ${template.name}`, affected_by_event_id: event.id })
                                    .in('id', idsToCancel);
                                if (error) throw error;
                                totalAffected += count || 0;
                            }
                        }
                    }
                    break;

                case 'REPLACE_SECTION':
                    if (template.impact.targetType) {
                        const { error, count } = await supabase
                            .from('workbook_parts')
                            .update({ status: 'CANCELADA', cancel_reason: `Evento: ${template.name}`, affected_by_event_id: event.id })
                            .in('id', weekParts)
                            .eq('section', template.impact.targetType);
                        if (error) throw error;
                        totalAffected += count || 0;
                    }
                    break;

                case 'CANCEL_WEEK':
                    {
                        const { error, count } = await supabase
                            .from('workbook_parts')
                            .update({ status: 'CANCELADA', cancel_reason: `Evento: ${template.name}`, affected_by_event_id: event.id })
                            .in('id', weekParts);
                        if (error) throw error;
                        totalAffected += count || 0;
                    }
                    break;

                case 'SC_VISIT_LOGIC':
                    {
                        const { data: parts } = await supabase
                            .from('workbook_parts')
                            .select('id, tipo_parte, section')
                            .in('id', weekParts);

                        if (parts) {
                            const partsToCancel = parts.filter(p =>
                                p.tipo_parte === 'Dirigente do EBC' ||
                                p.tipo_parte === 'Leitor do EBC' ||
                                p.tipo_parte === 'Necessidades Locais' ||
                                p.tipo_parte === 'Comentários Finais'
                            );

                            if (partsToCancel.length > 0) {
                                const idsToCancel = partsToCancel.map(p => p.id);
                                const { error, count } = await supabase
                                    .from('workbook_parts')
                                    .update({ status: 'CANCELADA', cancel_reason: `Visita SC: ${template.name}`, affected_by_event_id: event.id })
                                    .in('id', idsToCancel);
                                if (error) throw error;
                                totalAffected += count || 0;
                            }
                        }
                    }
                    break;

                case 'TIME_ADJUSTMENT':
                case 'REDUCE_VIDA_CRISTA_TIME':
                    {
                        const reductionDetails = impact.timeReductionDetails;

                        if (reductionDetails) {
                            // Fase 5.b: Suporte a N partes
                            const targetIds = reductionDetails.targetPartIds ||
                                (reductionDetails.targetPartId ? [reductionDetails.targetPartId] : []);

                            const targetType = reductionDetails.targetType || 'Dirigente do EBC';

                            let query = supabase.from('workbook_parts').select('id, tipo_parte, duracao').in('id', weekParts);
                            if (targetIds.length > 0) {
                                query = query.in('id', targetIds);
                            }

                            const { data: parts } = await query;

                            // Filtrar quais aplicar
                            const partsToReduce = parts?.filter(p =>
                                targetIds.length > 0 ? targetIds.includes(p.id) : p.tipo_parte === targetType
                            ) || [];

                            for (const partToReduce of partsToReduce) {
                                const currentDuration = parseInt(partToReduce.duracao) || (targetType === 'Dirigente do EBC' ? 30 : 15);
                                const newDuration = Math.max(5, currentDuration - reductionDetails.minutes);

                                const { error } = await supabase
                                    .from('workbook_parts')
                                    .update({
                                        duracao: `${newDuration} min`,
                                        original_duration: partToReduce.duracao,
                                        affected_by_event_id: event.id
                                    })
                                    .eq('id', partToReduce.id);
                                if (error) throw error;
                                totalAffected += 1;
                            }
                        }
                    }
                    break;

                case 'ADD_PART':
                    {
                        const { data: existingParts } = await supabase
                            .from('workbook_parts')
                            .select('seq, date, week_display, batch_id')
                            .in('id', weekParts)
                            .order('seq', { ascending: false })
                            .limit(1);

                        const lastPart = existingParts?.[0];
                        const newSeq = lastPart ? (lastPart.seq + 1) : 99;

                        const { error: insertError } = await supabase
                            .from('workbook_parts')
                            .insert({
                                batch_id: lastPart?.batch_id,
                                week_id: event.week,
                                week_display: lastPart?.week_display || event.week,
                                date: lastPart?.date || event.week,
                                section: 'Vida Cristã',
                                tipo_parte: 'Evento Especial',
                                part_title: event.theme || template?.name || 'Evento Especial',
                                modalidade: 'Discurso de Ensino',
                                duracao: `${event.duration || impact.newPartDetails?.duration || template?.defaults.duration || 10} min`,
                                seq: newSeq,
                                funcao: 'Titular',
                                raw_publisher_name: event.responsible || '',
                                resolved_publisher_name: event.responsible || '',
                                status: event.responsible ? 'DESIGNADA' : 'PENDENTE',
                                created_by_event_id: event.id,
                                affected_by_event_id: event.id,
                            });
                        if (insertError) throw insertError;
                        totalAffected += 1;
                    }
                    break;

                case 'REASSIGN_PART':
                    break;
            }
        }

        // Marcar evento como aplicado
        await supabase
            .from('special_events')
            .update({ is_applied: true, applied_at: new Date().toISOString() })
            .eq('id', event.id);

        return { affected: totalAffected };
    },

    /**
     * Reverte o impacto de um evento (ao deletar).
     * Restaura partes canceladas para PENDENTE e durações originais.
     */
    async revertEventImpact(event: SpecialEvent): Promise<{ restored: number }> {
        const template = this.getTemplateById(event.templateId);
        if (!template) return { restored: 0 };

        let restored = 0;

        // 1. Restaurar partes canceladas pelo evento
        const { error: cancelError, count: cancelCount } = await supabase
            .from('workbook_parts')
            .update({ status: 'PENDENTE', cancel_reason: null, affected_by_event_id: null })
            .eq('affected_by_event_id', event.id)
            .eq('status', 'CANCELADA');

        if (cancelError) throw cancelError;
        restored += cancelCount || 0;

        // 2. Limpar vínculos de partes que NÃO foram canceladas (ex: Informativos/NO_IMPACT)
        const { error: linkError, count: linkCount } = await supabase
            .from('workbook_parts')
            .update({ affected_by_event_id: null })
            .eq('affected_by_event_id', event.id)
            .neq('status', 'CANCELADA');
        
        if (linkError) throw linkError;
        restored += linkCount || 0;

        // 3. Restaurar durações originais (se houver)
        const { data: adjustedParts, error: adjError } = await supabase
            .from('workbook_parts')
            .select('id, original_duration')
            .eq('affected_by_event_id', event.id)
            .not('original_duration', 'is', null);

        if (adjError) throw adjError;

        if (adjustedParts && adjustedParts.length > 0) {
            for (const part of adjustedParts) {
                await supabase
                    .from('workbook_parts')
                    .update({ 
                        duracao: part.original_duration, 
                        original_duration: null, 
                        affected_by_event_id: null 
                    })
                    .eq('id', part.id);
                restored++;
            }
        }

        // Deletar partes CRIADAS pelo evento (ADD_PART)
        const { count: deletedCount } = await supabase
            .from('workbook_parts')
            .delete()
            .eq('created_by_event_id', event.id);
        restored += deletedCount || 0;

        // Marcar evento como não aplicado
        await supabase
            .from('special_events')
            .update({ is_applied: false, applied_at: null })
            .eq('id', event.id);

        return { restored };
    },

    /**
     * Marca partes como "pendentes de impacto" (sem aplicar ainda).
     * Usado quando o evento é criado sem auto-apply.
     * Mostra indicadores visuais amarelos pulsantes.
     */
    async markPendingImpact(event: SpecialEvent, weekParts: string[]): Promise<{ marked: number }> {
        const template = this.getTemplateById(event.templateId);
        if (!template) return { marked: 0 };

        const resolvedImpacts = this._resolveImpacts(event, template);
        let totalMarked = 0;

        // 1. Marcar vínculos visuais (*¹) globais
        if (event.affectedPartIds && event.affectedPartIds.length > 0) {
            const { count } = await supabase
                .from('workbook_parts')
                .update({ pending_event_id: event.id })
                .in('id', event.affectedPartIds);
            totalMarked += count || 0;
        }

        for (const impact of resolvedImpacts) {
            switch (impact.action) {
                case 'NO_IMPACT':
                    break;

                case 'REPLACE_PART':
                    if (impact.affectedPartIds && impact.affectedPartIds.length > 0) {
                        const { count } = await supabase
                            .from('workbook_parts')
                            .update({ pending_event_id: event.id })
                            .in('id', impact.affectedPartIds);
                        totalMarked += count || 0;
                    } else if (template.impact.targetType) {
                        const targetTypes = Array.isArray(template.impact.targetType)
                            ? template.impact.targetType
                            : [template.impact.targetType];
                        const { data: parts } = await supabase
                            .from('workbook_parts')
                            .select('id, tipo_parte')
                            .in('id', weekParts);
                        if (parts) {
                            const idsToMark = parts
                                .filter(p => targetTypes.includes(p.tipo_parte))
                                .map(p => p.id);
                            if (idsToMark.length > 0) {
                                const { count } = await supabase
                                    .from('workbook_parts')
                                    .update({ pending_event_id: event.id })
                                    .in('id', idsToMark);
                                totalMarked += count || 0;
                            }
                        }
                    }
                    break;

                case 'REPLACE_SECTION':
                    if (template.impact.targetType) {
                        const { count } = await supabase
                            .from('workbook_parts')
                            .update({ pending_event_id: event.id })
                            .in('id', weekParts)
                            .eq('section', template.impact.targetType);
                        totalMarked += count || 0;
                    }
                    break;

                case 'CANCEL_WEEK':
                    {
                        const { count } = await supabase
                            .from('workbook_parts')
                            .update({ pending_event_id: event.id })
                            .in('id', weekParts);
                        totalMarked += count || 0;
                    }
                    break;

                case 'SC_VISIT_LOGIC':
                    {
                        const { data: parts } = await supabase
                            .from('workbook_parts')
                            .select('id, tipo_parte')
                            .in('id', weekParts);

                        if (parts) {
                            const partsToMark = parts.filter(p =>
                                p.tipo_parte === 'Dirigente do EBC' ||
                                p.tipo_parte === 'Leitor do EBC' ||
                                p.tipo_parte === 'Necessidades Locais' ||
                                p.tipo_parte === 'Comentários Finais'
                            ).map(p => p.id);

                            if (partsToMark.length > 0) {
                                const { count } = await supabase
                                    .from('workbook_parts')
                                    .update({ pending_event_id: event.id })
                                    .in('id', partsToMark);
                                totalMarked += count || 0;
                            }
                        }
                    }
                    break;

                case 'TIME_ADJUSTMENT':
                case 'REDUCE_VIDA_CRISTA_TIME':
                    {
                        const reductionDetails = impact.timeReductionDetails;
                        if (reductionDetails) {
                            const targetIds = reductionDetails.targetPartIds ||
                                (reductionDetails.targetPartId ? [reductionDetails.targetPartId] : []);
                            const targetType = reductionDetails.targetType || 'Dirigente do EBC';

                            let query = supabase.from('workbook_parts').select('id, tipo_parte').in('id', weekParts);
                            if (targetIds.length > 0) {
                                query = query.in('id', targetIds);
                            }

                            const { data: parts } = await query;

                            const partsToMark = parts?.filter(p =>
                                targetIds.length > 0 ? targetIds.includes(p.id) : p.tipo_parte === targetType
                            ) || [];

                            if (partsToMark.length > 0) {
                                const idsToMark = partsToMark.map(p => p.id);
                                const { count } = await supabase
                                    .from('workbook_parts')
                                    .update({ pending_event_id: event.id })
                                    .in('id', idsToMark);
                                totalMarked += count || 0;
                            }
                        }
                    }
                    break;

                case 'ADD_PART':
                case 'REASSIGN_PART':
                    break;
            }
        }

        return { marked: totalMarked };
    },

    /**
     * Limpa marcações de "pendente" de um evento.
     * Usado quando evento é deletado ou aplicado.
     */
    async clearPendingMarks(eventId: string): Promise<void> {
        await supabase
            .from('workbook_parts')
            .update({ pending_event_id: null })
            .eq('pending_event_id', eventId);
    },
};
