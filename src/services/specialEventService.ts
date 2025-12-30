/**
 * Special Event Service
 * Gerencia eventos especiais que impactam semanas da apostila
 */

import { supabase } from '../lib/supabase';
import type { EventTemplate, SpecialEvent, EventImpactAction, ParticipationType } from '../types';

// ============================================================================
// TEMPLATES PRÉ-DEFINIDOS (Pode ser movido para BD futuramente)
// ============================================================================

export const EVENT_TEMPLATES: EventTemplate[] = [
    {
        id: 'discurso-visitante',
        name: 'Discurso de Visitante',
        description: 'Orador visitante de outra congregação substitui parte na Vida Cristã.',
        impact: { action: 'REPLACE_PART', targetType: 'Nossa Vida Crista' as ParticipationType },
        defaults: { duration: 15, requiresTheme: true, requiresAssignee: true },
    },
    {
        id: 'discurso-co',
        name: 'Visita do Superintendente de Circuito',
        description: 'Discurso do CO substitui toda a seção Vida Cristã.',
        impact: { action: 'REPLACE_SECTION', targetType: 'Nossa Vida Crista' as ParticipationType },
        defaults: { duration: 30, requiresTheme: false, requiresAssignee: false },
    },
    {
        id: 'assembleia',
        name: 'Semana de Assembleia',
        description: 'Não há reunião nesta semana devido à Assembleia.',
        impact: { action: 'REPLACE_SECTION' }, // Cancela tudo
        defaults: { duration: 0, requiresTheme: false, requiresAssignee: false },
    },
    {
        id: 'video-cg',
        name: 'Vídeo do Corpo Governante',
        description: 'Adiciona exibição de vídeo especial à reunião.',
        impact: { action: 'ADD_PART' },
        defaults: { duration: 10, theme: 'Atualização Mensal', requiresTheme: true, requiresAssignee: false },
    },
    {
        id: 'reuniao-abreviada',
        name: 'Reunião Abreviada',
        description: 'Reunião com tempo reduzido (ex: antes de evento).',
        impact: { action: 'REASSIGN_PART' },
        defaults: { duration: 0, requiresTheme: false, requiresAssignee: false },
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
                        .update({ status: 'CANCELADA', cancelReason: `Evento: ${template.name}` })
                        .in('id', weekParts)
                        .eq('section', template.impact.targetType);
                    if (error) throw error;
                    affected = count || 0;
                }
                break;

            case 'REPLACE_SECTION':
                // Marcar todas as partes da seção como CANCELADA
                // Se não tem targetType, cancela TUDO (assembleia)
                if (template.impact.targetType) {
                    const { error, count } = await supabase
                        .from('workbook_parts')
                        .update({ status: 'CANCELADA', cancelReason: `Evento: ${template.name}` })
                        .in('id', weekParts)
                        .eq('section', template.impact.targetType);
                    if (error) throw error;
                    affected = count || 0;
                } else {
                    // Cancela TODAS as partes da semana
                    const { error, count } = await supabase
                        .from('workbook_parts')
                        .update({ status: 'CANCELADA', cancelReason: `Evento: ${template.name}` })
                        .in('id', weekParts);
                    if (error) throw error;
                    affected = count || 0;
                }
                break;

            case 'ADD_PART':
                // Não afeta partes existentes, apenas adiciona nova parte
                // (A criação da nova parte seria feita separadamente)
                affected = 0;
                break;

            case 'REASSIGN_PART':
                // Lógica para reduzir tempo (não muda status, apenas configuração)
                // Pode ser implementada futuramente
                affected = 0;
                break;
        }

        return { affected };
    },

    /**
     * Reverte o impacto de um evento (ao deletar).
     * Restaura partes canceladas para PENDENTE.
     */
    async revertEventImpact(event: SpecialEvent): Promise<{ restored: number }> {
        const template = this.getTemplateById(event.templateId);
        if (!template) return { restored: 0 };

        const { error, count } = await supabase
            .from('workbook_parts')
            .update({ status: 'PENDENTE', cancelReason: null })
            .eq('weekId', event.week)
            .eq('cancelReason', `Evento: ${template.name}`);

        if (error) throw error;
        return { restored: count || 0 };
    },
};
