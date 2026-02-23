
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// No frontend usamos a anon key, mas para "Visão Total" o agente 
// pode precisar de mais privilégios se o RLS bloquear.
// Por enquanto, usaremos o cliente padrão.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
                query = query.eq(column, value);
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
