
import { supabase } from '../lib/supabase';

export type DataContext = 'publishers' | 'workbook' | 'notifications' | 'territories' | 'audit';

export interface QueryParams {
    table: string;
    select?: string;
    filters?: Record<string, any>;
    limit?: number;
    order?: { column: string; ascending?: boolean };
}

/**
 * Maps common LLM-hallucinated camelCase column names to real snake_case DB columns.
 * Prevents "column X does not exist" errors from agent FETCH_DATA actions.
 */
const COLUMN_ALIASES: Record<string, Record<string, string>> = {
    workbook_parts: {
        fromWeekId: 'week_id', toWeekId: 'week_id', weekId: 'week_id', week: 'week_id',
        batchId: 'batch_id', partNumber: 'part_number', participantName: 'participant_name',
        assistantName: 'assistant_name', resolvedPublisherName: 'resolved_publisher_name',
        resolvedPublisherId: 'resolved_publisher_id', isCancelled: 'is_cancelled',
        createdAt: 'created_at', updatedAt: 'updated_at',
    },
    workbook_batches: {
        fileName: 'file_name', weekRange: 'week_range', createdAt: 'created_at',
    },
    special_events: {
        weekId: 'week_id', eventType: 'event_type', participantName: 'participant_name',
        createdAt: 'created_at',
    },
};

function resolveColumnName(table: string, column: string): string {
    return COLUMN_ALIASES[table]?.[column] ?? column;
}

export const dataDiscoveryService = {
    /**
     * Consulta genérica para o Agente ter Visão Total
     */
    async fetchData(params: QueryParams) {
        let query = supabase.from(params.table).select(params.select || '*');

        if (params.filters) {
            Object.entries(params.filters).forEach(([rawColumn, value]) => {
                const column = resolveColumnName(params.table, rawColumn);
                // Publishers table stores all fields inside a JSONB 'data' column
                if (params.table === 'publishers' && column !== 'id') {
                    const jsonPath = `data->>${column}`;
                    if (value === null || value === undefined) {
                        query = query.is(jsonPath, null);
                    } else if (typeof value === 'string') {
                        query = query.ilike(jsonPath, `%${value}%`);
                    } else {
                        query = query.eq(jsonPath, String(value));
                    }
                } else if (value === null || value === undefined) {
                    query = query.is(column, null);
                } else {
                    query = query.eq(column, value);
                }
            });
        }

        if (params.order) {
            query = query.order(params.order.column, { ascending: params.order.ascending ?? true });
        }

        if (params.limit) {
            query = query.limit(params.limit);
        }

        const { data, error } = await query;

        if (error) {
            console.error(`[dataDiscoveryService] Erro ao buscar dados de ${params.table}:`, error);
            throw error;
        }

        return data;
    },

    /**
     * Mapeamento amigável de sub-contextos para tabelas reais
     */
    getTableFromContext(context: DataContext): string[] {
        switch (context) {
            case 'publishers': return ['publishers'];
            case 'workbook': return ['workbook_parts', 'special_events'];
            case 'notifications': return ['notifications'];
            case 'territories': return ['territories', 'neighborhoods'];
            case 'audit': return ['audit_log', 'backup_history'];
            default: return [];
        }
    }
};
