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
        id: 'assembleia-congresso',
        name: 'Assembleia de Circuito ou Congresso',
        description: 'Não há reunião nesta semana devido à Assembleia de Circuito ou Congresso.',
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
];

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
        return data || [];
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
        return data || [];
    },

    // Criar novo evento
    async createEvent(event: Omit<SpecialEvent, 'id'>): Promise<SpecialEvent> {
        const { data, error } = await supabase
            .from('special_events')
            .insert(event)
            .select()
            .single();

        if (error) throw new Error(`Erro ao criar evento: ${error.message}`);
        return data;
    },

    // Atualizar evento existente
    async updateEvent(id: string, updates: Partial<SpecialEvent>): Promise<void> {
        const { error } = await supabase
            .from('special_events')
            .update(updates)
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
     * Aplica o impacto de um evento especial nas partes da apostila.
     * @param event Evento a ser aplicado
     * @param weekParts IDs das partes da semana afetada
     */
    async applyEventImpact(event: SpecialEvent, weekParts: string[]): Promise<{ affected: number }> {
        const template = this.getTemplateById(event.templateId);
        if (!template) throw new Error(`Template não encontrado: ${event.templateId}`);

        const action = template.impact.action as EventImpactAction;
        let affected = 0;

        switch (action) {
            case 'REPLACE_PART':
                // Marcar partes específicas do tipo alvo como CANCELADA
                if (template.impact.targetType) {
                    const { error, count } = await supabase
                        .from('workbook_parts')
                        .update({ status: 'CANCELADA', cancel_reason: `Evento: ${template.name}`, affected_by_event_id: event.id })
                        .in('id', weekParts)
                        .eq('section', template.impact.targetType);
                    if (error) throw error;
                    affected = count || 0;
                }
                break;

            case 'REPLACE_SECTION':
                // Marcar todas as partes da seção como CANCELADA
                if (template.impact.targetType) {
                    const { error, count } = await supabase
                        .from('workbook_parts')
                        .update({ status: 'CANCELADA', cancel_reason: `Evento: ${template.name}`, affected_by_event_id: event.id })
                        .in('id', weekParts)
                        .eq('section', template.impact.targetType);
                    if (error) throw error;
                    affected = count || 0;
                }
                break;

            case 'CANCEL_WEEK':
                // Cancela TODAS as partes da semana (Assembleia/Congresso)
                {
                    const { error, count } = await supabase
                        .from('workbook_parts')
                        .update({ status: 'CANCELADA', cancel_reason: `Evento: ${template.name}`, affected_by_event_id: event.id })
                        .in('id', weekParts);
                    if (error) throw error;
                    affected = count || 0;
                }
                break;

            case 'SC_VISIT_LOGIC':
                // Lógica especial para Visita do Superintendente de Circuito
                // Cancela: EBC, Necessidades Locais, Comentários Finais
                // MANTÉM: Discurso de Ensino (primeira parte da Vida Cristã)
                {
                    // Buscar partes da semana para aplicar lógica granular
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
                            affected = count || 0;
                        }
                    }
                }
                break;

            case 'TIME_ADJUSTMENT':
                // Ajusta tempo do EBC e adiciona parte do Boletim
                // Não cancela o EBC, apenas reduz a duração
                {
                    const { data: parts } = await supabase
                        .from('workbook_parts')
                        .select('id, tipo_parte, duracao')
                        .in('id', weekParts);

                    if (parts) {
                        const ebcPart = parts.find(p => p.tipo_parte === 'Dirigente do EBC');
                        if (ebcPart && template.impact.timeReduction) {
                            const currentDuration = parseInt(ebcPart.duracao) || 30;
                            const newDuration = Math.max(15, currentDuration - template.impact.timeReduction.minutes);

                            const { error } = await supabase
                                .from('workbook_parts')
                                .update({
                                    duracao: `${newDuration} min`,
                                    original_duration: ebcPart.duracao,
                                    affected_by_event_id: event.id
                                })
                                .eq('id', ebcPart.id);
                            if (error) throw error;
                            affected = 1;
                        }
                    }
                }
                break;

            case 'ADD_PART':
                // Não afeta partes existentes, apenas adiciona nova parte
                // (A criação da nova parte seria feita separadamente)
                affected = 0;
                break;

            case 'REASSIGN_PART':
                // Lógica para reatribuir parte (não muda status)
                affected = 0;
                break;
        }

        // Marcar evento como aplicado
        await supabase
            .from('special_events')
            .update({ is_applied: true, applied_at: new Date().toISOString() })
            .eq('id', event.id);

        return { affected };
    },

    /**
     * Reverte o impacto de um evento (ao deletar).
     * Restaura partes canceladas para PENDENTE e durações originais.
     */
    async revertEventImpact(event: SpecialEvent): Promise<{ restored: number }> {
        const template = this.getTemplateById(event.templateId);
        if (!template) return { restored: 0 };

        let restored = 0;

        // Restaurar partes canceladas
        const { error: cancelError, count: cancelCount } = await supabase
            .from('workbook_parts')
            .update({ status: 'PENDENTE', cancel_reason: null, affected_by_event_id: null })
            .eq('affected_by_event_id', event.id)
            .eq('status', 'CANCELADA');

        if (cancelError) throw cancelError;
        restored += cancelCount || 0;

        // Restaurar durações originais (para TIME_ADJUSTMENT)
        if (template.impact.action === 'TIME_ADJUSTMENT') {
            const { data: adjustedParts } = await supabase
                .from('workbook_parts')
                .select('id, original_duration')
                .eq('affected_by_event_id', event.id)
                .not('original_duration', 'is', null);

            if (adjustedParts) {
                for (const part of adjustedParts) {
                    await supabase
                        .from('workbook_parts')
                        .update({ duracao: part.original_duration, original_duration: null, affected_by_event_id: null })
                        .eq('id', part.id);
                    restored++;
                }
            }
        }

        // Marcar evento como não aplicado
        await supabase
            .from('special_events')
            .update({ is_applied: false, applied_at: null })
            .eq('id', event.id);

        return { restored };
    },
};
