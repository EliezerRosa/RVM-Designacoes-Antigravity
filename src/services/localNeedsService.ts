/**
 * Local Needs Pre-Assignment Service
 * Gerencia fila de pré-designações para partes de "Necessidades Locais"
 */

import { supabase } from '../lib/supabase';

// ============================================================================
// Tipos
// ============================================================================

export interface LocalNeedsPreassignment {
    id: string;
    theme: string;
    assigneeName: string;
    orderPosition: number;
    assignedToPartId: string | null;
    assignedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

interface DbRow {
    id: string;
    theme: string;
    assignee_name: string;
    order_position: number;
    assigned_to_part_id: string | null;
    assigned_at: string | null;
    created_at: string;
    updated_at: string;
}

// ============================================================================
// Helpers
// ============================================================================

function mapDbToPreassignment(row: DbRow): LocalNeedsPreassignment {
    return {
        id: row.id,
        theme: row.theme,
        assigneeName: row.assignee_name,
        orderPosition: row.order_position,
        assignedToPartId: row.assigned_to_part_id,
        assignedAt: row.assigned_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// ============================================================================
// Service
// ============================================================================

export const localNeedsService = {
    /**
     * Lista todas as pré-designações pendentes (não atribuídas)
     * Ordenadas por order_position
     */
    async getPendingQueue(): Promise<LocalNeedsPreassignment[]> {
        const { data, error } = await supabase
            .from('local_needs_preassignments')
            .select('*')
            .is('assigned_to_part_id', null)
            .order('order_position', { ascending: true });

        if (error) throw new Error(`Erro ao buscar fila: ${error.message}`);
        return (data || []).map(mapDbToPreassignment);
    },

    /**
     * Lista histórico de pré-designações já atribuídas
     */
    async getAssignedHistory(): Promise<LocalNeedsPreassignment[]> {
        const { data, error } = await supabase
            .from('local_needs_preassignments')
            .select('*')
            .not('assigned_to_part_id', 'is', null)
            .order('assigned_at', { ascending: false })
            .limit(50);

        if (error) throw new Error(`Erro ao buscar histórico: ${error.message}`);
        return (data || []).map(mapDbToPreassignment);
    },

    /**
     * Adiciona nova pré-designação à fila
     * Posição padrão: final da fila
     */
    async addToQueue(theme: string, assigneeName: string): Promise<LocalNeedsPreassignment> {
        // Buscar próxima posição
        const { data: lastItem } = await supabase
            .from('local_needs_preassignments')
            .select('order_position')
            .is('assigned_to_part_id', null)
            .order('order_position', { ascending: false })
            .limit(1)
            .maybeSingle();

        const nextPosition = (lastItem?.order_position || 0) + 1;

        const { data, error } = await supabase
            .from('local_needs_preassignments')
            .insert({
                theme,
                assignee_name: assigneeName,
                order_position: nextPosition,
            })
            .select()
            .single();

        if (error) throw new Error(`Erro ao adicionar à fila: ${error.message}`);
        return mapDbToPreassignment(data);
    },

    /**
     * Atualiza uma pré-designação
     */
    async update(id: string, updates: Partial<{ theme: string; assigneeName: string }>): Promise<void> {
        const dbUpdates: Record<string, unknown> = {};
        if (updates.theme !== undefined) dbUpdates.theme = updates.theme;
        if (updates.assigneeName !== undefined) dbUpdates.assignee_name = updates.assigneeName;

        const { error } = await supabase
            .from('local_needs_preassignments')
            .update(dbUpdates)
            .eq('id', id);

        if (error) throw new Error(`Erro ao atualizar: ${error.message}`);
    },

    /**
     * Remove uma pré-designação da fila
     */
    async remove(id: string): Promise<void> {
        const { error } = await supabase
            .from('local_needs_preassignments')
            .delete()
            .eq('id', id);

        if (error) throw new Error(`Erro ao remover: ${error.message}`);
    },

    /**
     * Reordena a fila (move item para nova posição)
     */
    async reorder(id: string, newPosition: number): Promise<void> {
        // Buscar posição atual
        const { data: current } = await supabase
            .from('local_needs_preassignments')
            .select('order_position')
            .eq('id', id)
            .single();

        if (!current) return;

        const oldPosition = current.order_position;

        if (oldPosition === newPosition) return;

        // Atualizar posições intermediárias
        if (newPosition < oldPosition) {
            // Movendo para cima: incrementar os que estão entre newPosition e oldPosition
            await supabase
                .from('local_needs_preassignments')
                .update({ order_position: supabase.rpc('increment_position', { amount: 1 }) })
                .gte('order_position', newPosition)
                .lt('order_position', oldPosition)
                .is('assigned_to_part_id', null);
        } else {
            // Movendo para baixo: decrementar os que estão entre oldPosition e newPosition
            await supabase
                .from('local_needs_preassignments')
                .update({ order_position: supabase.rpc('decrement_position', { amount: 1 }) })
                .gt('order_position', oldPosition)
                .lte('order_position', newPosition)
                .is('assigned_to_part_id', null);
        }

        // Atualizar o item movido
        await supabase
            .from('local_needs_preassignments')
            .update({ order_position: newPosition })
            .eq('id', id);
    },

    /**
     * Obtém a próxima pré-designação da fila
     * Retorna null se a fila estiver vazia
     */
    async getNext(): Promise<LocalNeedsPreassignment | null> {
        const { data, error } = await supabase
            .from('local_needs_preassignments')
            .select('*')
            .is('assigned_to_part_id', null)
            .order('order_position', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (error) throw new Error(`Erro ao buscar próxima: ${error.message}`);
        return data ? mapDbToPreassignment(data) : null;
    },

    /**
     * Marca uma pré-designação como atribuída a uma parte
     */
    async assignToPart(preassignmentId: string, partId: string): Promise<void> {
        const { error } = await supabase
            .from('local_needs_preassignments')
            .update({
                assigned_to_part_id: partId,
                assigned_at: new Date().toISOString(),
            })
            .eq('id', preassignmentId);

        if (error) throw new Error(`Erro ao atribuir: ${error.message}`);
    },

    /**
     * Desfaz atribuição (volta para a fila)
     */
    async unassign(preassignmentId: string): Promise<void> {
        // Buscar próxima posição disponível
        const { data: lastItem } = await supabase
            .from('local_needs_preassignments')
            .select('order_position')
            .is('assigned_to_part_id', null)
            .order('order_position', { ascending: false })
            .limit(1)
            .maybeSingle();

        const nextPosition = (lastItem?.order_position || 0) + 1;

        const { error } = await supabase
            .from('local_needs_preassignments')
            .update({
                assigned_to_part_id: null,
                assigned_at: null,
                order_position: nextPosition,
            })
            .eq('id', preassignmentId);

        if (error) throw new Error(`Erro ao desfazer atribuição: ${error.message}`);
    },

    /**
     * Conta quantas pré-designações estão pendentes na fila
     */
    async getQueueCount(): Promise<number> {
        const { count, error } = await supabase
            .from('local_needs_preassignments')
            .select('*', { count: 'exact', head: true })
            .is('assigned_to_part_id', null);

        if (error) throw new Error(`Erro ao contar fila: ${error.message}`);
        return count || 0;
    },
};
