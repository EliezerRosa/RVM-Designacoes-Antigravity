/**
 * History Service - RVM Designações
 * CRUD operations for history_records in Supabase
 */

import { supabase } from '../lib/supabase';
import type { HistoryRecord } from '../types';

export interface HistoryServiceResult {
    success: boolean;
    error?: string;
    count?: number;
}

/**
 * Salva registros de histórico no Supabase
 * Usa upsert para evitar duplicatas (baseado no id)
 */
export async function saveHistoryRecords(records: HistoryRecord[]): Promise<HistoryServiceResult> {
    if (records.length === 0) {
        return { success: true, count: 0 };
    }

    try {
        // Converter para formato de storage (JSON em coluna 'data')
        const rows = records.map(r => ({
            id: r.id,
            week_id: r.weekId,
            semana: r.semana || r.date,
            status: r.status,
            import_source: r.importSource,
            import_batch_id: r.importBatchId,
            data: r // Armazena o objeto completo
        }));

        // Upsert em batches de 100
        const batchSize = 100;
        let totalInserted = 0;

        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            const { error } = await supabase
                .from('history_records')
                .upsert(batch, { onConflict: 'id' });

            if (error) {
                console.error('[History Service] Erro ao salvar batch:', error);
                return { success: false, error: error.message };
            }
            totalInserted += batch.length;
        }

        console.log(`[History Service] ${totalInserted} registros salvos`);
        return { success: true, count: totalInserted };

    } catch (error) {
        console.error('[History Service] Erro:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        };
    }
}

/**
 * Carrega todos os registros de histórico do Supabase
 */
export async function loadHistoryRecords(): Promise<HistoryRecord[]> {
    try {
        const { data, error } = await supabase
            .from('history_records')
            .select('*')
            .order('semana', { ascending: false })
            .order('id', { ascending: true });

        if (error) {
            console.error('[History Service] Erro ao carregar:', error);
            return [];
        }

        // Extrair objetos HistoryRecord da coluna 'data'
        const records = (data || []).map(row => row.data as HistoryRecord);
        console.log(`[History Service] ${records.length} registros carregados`);
        return records;

    } catch (error) {
        console.error('[History Service] Erro:', error);
        return [];
    }
}

/**
 * Remove registros por IDs
 */
export async function deleteHistoryRecords(ids: string[]): Promise<HistoryServiceResult> {
    if (ids.length === 0) {
        return { success: true, count: 0 };
    }

    try {
        const { error } = await supabase
            .from('history_records')
            .delete()
            .in('id', ids);

        if (error) {
            console.error('[History Service] Erro ao deletar:', error);
            return { success: false, error: error.message };
        }

        console.log(`[History Service] ${ids.length} registros deletados`);
        return { success: true, count: ids.length };

    } catch (error) {
        console.error('[History Service] Erro:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        };
    }
}

/**
 * Remove todos os registros de um batch de importação
 */
export async function deleteHistoryBatch(batchId: string): Promise<HistoryServiceResult> {
    try {
        const { error, count } = await supabase
            .from('history_records')
            .delete()
            .eq('import_batch_id', batchId);

        if (error) {
            console.error('[History Service] Erro ao deletar batch:', error);
            return { success: false, error: error.message };
        }

        console.log(`[History Service] Batch ${batchId} deletado (${count} registros)`);
        return { success: true, count: count || 0 };

    } catch (error) {
        console.error('[History Service] Erro:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        };
    }
}

/**
 * Atualiza status de registros
 */
export async function updateHistoryStatus(
    ids: string[],
    status: string
): Promise<HistoryServiceResult> {
    if (ids.length === 0) {
        return { success: true, count: 0 };
    }

    try {
        // Primeiro, buscar os registros atuais
        const { data: existingRecords, error: fetchError } = await supabase
            .from('history_records')
            .select('*')
            .in('id', ids);

        if (fetchError) {
            return { success: false, error: fetchError.message };
        }

        // Atualizar o status no objeto data e na coluna status
        const updates = (existingRecords || []).map(row => ({
            ...row,
            status: status,
            data: { ...row.data, status: status, updatedAt: new Date().toISOString() }
        }));

        const { error: updateError } = await supabase
            .from('history_records')
            .upsert(updates, { onConflict: 'id' });

        if (updateError) {
            return { success: false, error: updateError.message };
        }

        console.log(`[History Service] ${ids.length} registros atualizados para ${status}`);
        return { success: true, count: ids.length };

    } catch (error) {
        console.error('[History Service] Erro:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        };
    }
}
