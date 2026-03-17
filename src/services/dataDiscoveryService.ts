
import { supabase } from '../lib/supabase';

export type DataContext = 'publishers' | 'workbook' | 'notifications' | 'territories' | 'audit';

export interface QueryParams {
    table: string;
    select?: string;
    filters?: Record<string, any>;
    limit?: number;
    order?: { column: string; ascending?: boolean };
}

export const dataDiscoveryService = {
    /**
     * Consulta genérica para o Agente ter Visão Total
     */
    async fetchData(params: QueryParams) {
        let query = supabase.from(params.table).select(params.select || '*');

        if (params.filters) {
            Object.entries(params.filters).forEach(([column, value]) => {
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
            case 'territories': return ['territories', 'blocks', 'addresses', 'visits'];
            case 'audit': return ['audit_log', 'backup_history'];
            default: return [];
        }
    }
};
