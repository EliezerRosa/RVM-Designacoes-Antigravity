/**
 * Assignment Service - RVM Designações
 * CRUD para designações agendadas (ScheduledAssignment)
 * Persiste no Supabase
 */

import { supabase } from '../lib/supabase';
import type { ScheduledAssignment, ApprovalStatus, HistoryRecord } from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ============================================================================
// Tipos auxiliares
// ============================================================================

interface DbScheduledAssignment {
    id: string;
    week_id: string;
    part_id: string;
    part_title: string;
    part_type: string;
    teaching_category: string;
    principal_publisher_id: string;
    principal_publisher_name: string;
    secondary_publisher_id: string | null;
    secondary_publisher_name: string | null;
    date: string;
    start_time: string | null;
    end_time: string | null;
    duration_min: number;
    room: string | null;
    status: string;
    approved_by_elder_id: string | null;
    approved_by_elder_name: string | null;
    approval_date: string | null;
    rejection_reason: string | null;
    selection_reason: string | null;
    score: number;
    pairing_reason: string | null;
    promoted_to_history_id: string | null;
    promoted_at: string | null;
    created_at: string;
    updated_at: string | null;
}

// ============================================================================
// Mappers
// ============================================================================

function mapDbToAssignment(row: DbScheduledAssignment): ScheduledAssignment {
    return {
        id: row.id,
        weekId: row.week_id,
        partId: row.part_id,
        partTitle: row.part_title,
        partType: row.part_type as ScheduledAssignment['partType'],
        teachingCategory: row.teaching_category as ScheduledAssignment['teachingCategory'],
        principalPublisherId: row.principal_publisher_id,
        principalPublisherName: row.principal_publisher_name,
        secondaryPublisherId: row.secondary_publisher_id || undefined,
        secondaryPublisherName: row.secondary_publisher_name || undefined,
        date: row.date,
        startTime: row.start_time || undefined,
        endTime: row.end_time || undefined,
        durationMin: row.duration_min,
        status: row.status as ApprovalStatus,
        approvedByElderId: row.approved_by_elder_id || undefined,
        approvalDate: row.approval_date || undefined,
        rejectionReason: row.rejection_reason || undefined,
        selectionReason: row.selection_reason || '',
        score: row.score,
        room: row.room || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at || undefined,
    };
}

function mapAssignmentToDb(assignment: Partial<ScheduledAssignment>): Record<string, unknown> {
    const dbRow: Record<string, unknown> = {};

    if (assignment.weekId !== undefined) dbRow.week_id = assignment.weekId;
    if (assignment.partId !== undefined) dbRow.part_id = assignment.partId;
    if (assignment.partTitle !== undefined) dbRow.part_title = assignment.partTitle;
    if (assignment.partType !== undefined) dbRow.part_type = assignment.partType;
    if (assignment.teachingCategory !== undefined) dbRow.teaching_category = assignment.teachingCategory;
    if (assignment.principalPublisherId !== undefined) dbRow.principal_publisher_id = assignment.principalPublisherId;
    if (assignment.principalPublisherName !== undefined) dbRow.principal_publisher_name = assignment.principalPublisherName;
    if (assignment.secondaryPublisherId !== undefined) dbRow.secondary_publisher_id = assignment.secondaryPublisherId;
    if (assignment.secondaryPublisherName !== undefined) dbRow.secondary_publisher_name = assignment.secondaryPublisherName;
    if (assignment.date !== undefined) dbRow.date = assignment.date;
    if (assignment.startTime !== undefined) dbRow.start_time = assignment.startTime;
    if (assignment.endTime !== undefined) dbRow.end_time = assignment.endTime;
    if (assignment.durationMin !== undefined) dbRow.duration_min = assignment.durationMin;
    if (assignment.room !== undefined) dbRow.room = assignment.room;
    if (assignment.status !== undefined) dbRow.status = assignment.status;
    if (assignment.approvedByElderId !== undefined) dbRow.approved_by_elder_id = assignment.approvedByElderId;
    if (assignment.approvalDate !== undefined) dbRow.approval_date = assignment.approvalDate;
    if (assignment.rejectionReason !== undefined) dbRow.rejection_reason = assignment.rejectionReason;
    if (assignment.selectionReason !== undefined) dbRow.selection_reason = assignment.selectionReason;
    if (assignment.score !== undefined) dbRow.score = assignment.score;

    return dbRow;
}

// ============================================================================
// Service
// ============================================================================

export const assignmentService = {
    // ========================================================================
    // CRUD
    // ========================================================================

    /**
     * Lista designações de uma semana
     */
    async getByWeek(weekId: string): Promise<ScheduledAssignment[]> {
        const { data, error } = await supabase
            .from('scheduled_assignments')
            .select('*')
            .eq('week_id', weekId)
            .order('date', { ascending: true });

        if (error) throw new Error(`Erro ao carregar designações: ${error.message}`);
        return (data || []).map(row => mapDbToAssignment(row as DbScheduledAssignment));
    },

    /**
     * Lista designações pendentes de aprovação
     */
    async getPending(): Promise<ScheduledAssignment[]> {
        const { data, error } = await supabase
            .from('scheduled_assignments')
            .select('*')
            .eq('status', 'PENDING_APPROVAL')
            .order('created_at', { ascending: false });

        if (error) throw new Error(`Erro ao carregar pendentes: ${error.message}`);
        return (data || []).map(row => mapDbToAssignment(row as DbScheduledAssignment));
    },

    /**
     * Lista designações aprovadas (prontas para reunião)
     */
    async getApproved(): Promise<ScheduledAssignment[]> {
        const { data, error } = await supabase
            .from('scheduled_assignments')
            .select('*')
            .eq('status', 'APPROVED')
            .order('date', { ascending: true });

        if (error) throw new Error(`Erro ao carregar aprovadas: ${error.message}`);
        return (data || []).map(row => mapDbToAssignment(row as DbScheduledAssignment));
    },

    /**
     * Lista designações concluídas
     */
    async getCompleted(): Promise<ScheduledAssignment[]> {
        const { data, error } = await supabase
            .from('scheduled_assignments')
            .select('*')
            .eq('status', 'COMPLETED')
            .order('date', { ascending: false });

        if (error) throw new Error(`Erro ao carregar concluídas: ${error.message}`);
        return (data || []).map(row => mapDbToAssignment(row as DbScheduledAssignment));
    },

    /**
     * Lista todas as designações (independente do status)
     */
    async getAll(): Promise<ScheduledAssignment[]> {
        const { data, error } = await supabase
            .from('scheduled_assignments')
            .select('*')
            .order('date', { ascending: true })
            .range(0, 999);

        if (error) throw new Error(`Erro ao carregar todas: ${error.message}`);
        return (data || []).map(row => mapDbToAssignment(row as DbScheduledAssignment));
    },

    /**
     * Cria uma nova designação
     */
    async create(assignment: Omit<ScheduledAssignment, 'id' | 'createdAt'>): Promise<ScheduledAssignment> {
        const dbRow = mapAssignmentToDb(assignment);

        const { data, error } = await supabase
            .from('scheduled_assignments')
            .insert(dbRow)
            .select()
            .single();

        if (error) throw new Error(`Erro ao criar designação: ${error.message}`);
        return mapDbToAssignment(data as DbScheduledAssignment);
    },

    /**
     * Cria múltiplas designações (batch)
     */
    async createBatch(assignments: Omit<ScheduledAssignment, 'id' | 'createdAt'>[]): Promise<ScheduledAssignment[]> {
        const dbRows = assignments.map(a => mapAssignmentToDb(a));

        const { data, error } = await supabase
            .from('scheduled_assignments')
            .insert(dbRows)
            .select();

        if (error) throw new Error(`Erro ao criar designações: ${error.message}`);
        return (data || []).map(row => mapDbToAssignment(row as DbScheduledAssignment));
    },

    /**
     * Atualiza uma designação
     */
    async update(id: string, updates: Partial<ScheduledAssignment>): Promise<ScheduledAssignment> {
        const dbUpdates = mapAssignmentToDb(updates);

        const { data, error } = await supabase
            .from('scheduled_assignments')
            .update(dbUpdates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(`Erro ao atualizar designação: ${error.message}`);
        return mapDbToAssignment(data as DbScheduledAssignment);
    },

    /**
     * Deleta uma designação
     */
    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('scheduled_assignments')
            .delete()
            .eq('id', id);

        if (error) throw new Error(`Erro ao deletar designação: ${error.message}`);
    },

    // ========================================================================
    // APROVAÇÃO
    // ========================================================================

    /**
     * Aprova uma designação
     */
    async approve(id: string, elderId: string, _elderName: string): Promise<ScheduledAssignment> {
        return this.update(id, {
            status: 'APPROVED' as ApprovalStatus,
            approvedByElderId: elderId,
            approvalDate: new Date().toISOString(),
        });
    },

    /**
     * Rejeita uma designação
     */
    async reject(id: string, elderId: string, reason: string): Promise<ScheduledAssignment> {
        return this.update(id, {
            status: 'REJECTED' as ApprovalStatus,
            approvedByElderId: elderId,
            rejectionReason: reason,
        });
    },

    // ========================================================================
    // CICLO DE VIDA
    // ========================================================================

    /**
     * Marca designações como COMPLETED (reunião aconteceu)
     * Também atualiza workbook_parts correspondentes para COMPLETED (histórico)
     */
    async markCompleted(ids: string[]): Promise<void> {
        // 1. Atualizar scheduled_assignments
        const { error } = await supabase
            .from('scheduled_assignments')
            .update({ status: 'COMPLETED' })
            .in('id', ids);

        if (error) throw new Error(`Erro ao marcar como completadas: ${error.message}`);

        // 2. Buscar part_ids associados para atualizar workbook_parts
        const { data: assignments, error: fetchError } = await supabase
            .from('scheduled_assignments')
            .select('part_id')
            .in('id', ids);

        if (fetchError) {
            console.error('[Assignment Service] Erro ao buscar part_ids:', fetchError);
            return;
        }

        // 3. Atualizar workbook_parts para COMPLETED (histórico)
        const partIds = assignments?.map(a => a.part_id).filter(Boolean) || [];
        if (partIds.length > 0) {
            const { error: wpError } = await supabase
                .from('workbook_parts')
                .update({
                    status: 'COMPLETED',
                    updated_at: new Date().toISOString()
                })
                .in('id', partIds);

            if (wpError) {
                console.error('[Assignment Service] Erro ao atualizar workbook_parts:', wpError);
            } else {
                console.log(`[Assignment Service] ${partIds.length} workbook_parts marcadas como COMPLETED (histórico)`);
            }
        }
    },

    /**
     * Promove designações COMPLETED para HistoryRecord
     * Retorna os IDs dos HistoryRecords criados
     */
    async promoteToHistory(ids: string[]): Promise<string[]> {
        // 1. Buscar designações
        const { data: assignments, error: fetchError } = await supabase
            .from('scheduled_assignments')
            .select('*')
            .in('id', ids)
            .eq('status', 'COMPLETED');

        if (fetchError) throw new Error(`Erro ao buscar designações: ${fetchError.message}`);
        if (!assignments || assignments.length === 0) {
            throw new Error('Nenhuma designação COMPLETED encontrada');
        }

        // 2. Converter para HistoryRecords
        const historyRecords: Partial<HistoryRecord>[] = assignments.map(a => ({
            id: crypto.randomUUID(),
            weekId: a.week_id,
            weekDisplay: a.week_id,
            date: a.date,
            semana: a.date,
            partTitle: a.part_title,
            tipoParte: a.part_type,
            rawPublisherName: a.principal_publisher_name,
            nomeOriginal: a.principal_publisher_name,
            resolvedPublisherId: a.principal_publisher_id,
            resolvedPublisherName: a.principal_publisher_name,
            publicadorId: a.principal_publisher_id,
            publicadorNome: a.principal_publisher_name,
            participationRole: 'Titular' as const,
            funcao: 'Titular',
            status: 'APPROVED',
            importSource: 'Manual' as const,
            importBatchId: `assignment-promotion-${new Date().toISOString().split('T')[0]}`,
            createdAt: new Date().toISOString(),
        }));

        // 3. Salvar no history_records
        const rows = historyRecords.map(r => ({
            id: r.id,
            week_id: r.weekId,
            semana: r.date,
            status: r.status,
            import_source: r.importSource,
            import_batch_id: r.importBatchId,
            data: r
        }));

        const { error: insertError } = await supabase
            .from('history_records')
            .insert(rows);

        if (insertError) throw new Error(`Erro ao criar histórico: ${insertError.message}`);

        // 4. Atualizar designações com referência ao histórico
        const historyIds = historyRecords.map(r => r.id!);
        for (let i = 0; i < ids.length; i++) {
            await supabase
                .from('scheduled_assignments')
                .update({
                    promoted_to_history_id: historyIds[i],
                    promoted_at: new Date().toISOString()
                })
                .eq('id', ids[i]);
        }

        console.log(`[Assignment Service] ${historyIds.length} designações promovidas para histórico`);
        return historyIds;
    },

    // ========================================================================
    // REALTIME
    // ========================================================================

    /**
     * Inscreve-se para mudanças em tempo real
     */
    subscribeToChanges(
        weekId: string,
        callback: (payload: { eventType: string; new?: ScheduledAssignment; old?: ScheduledAssignment }) => void
    ): RealtimeChannel {
        const channel = supabase
            .channel(`scheduled_assignments:${weekId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'scheduled_assignments',
                    filter: `week_id=eq.${weekId}`,
                },
                (payload) => {
                    callback({
                        eventType: payload.eventType,
                        new: payload.new ? mapDbToAssignment(payload.new as DbScheduledAssignment) : undefined,
                        old: payload.old ? mapDbToAssignment(payload.old as DbScheduledAssignment) : undefined,
                    });
                }
            )
            .subscribe();

        return channel;
    },

    /**
     * Cancela inscrição
     */
    unsubscribe(channel: RealtimeChannel): void {
        supabase.removeChannel(channel);
    },

    // ========================================================================
    // ESTATÍSTICAS
    // ========================================================================

    /**
     * Retorna estatísticas das designações
     */
    async getStats(): Promise<{
        total: number;
        byStatus: Record<string, number>;
    }> {
        const { data, error } = await supabase
            .from('scheduled_assignments')
            .select('status');

        if (error) throw new Error(`Erro ao carregar estatísticas: ${error.message}`);

        const byStatus: Record<string, number> = {};
        (data || []).forEach(row => {
            byStatus[row.status] = (byStatus[row.status] || 0) + 1;
        });

        return {
            total: data?.length || 0,
            byStatus
        };
    },
};
