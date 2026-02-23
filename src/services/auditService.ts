
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface AuditRecord {
    id?: number;
    table_name: string;
    operation: string;
    record_id?: string;
    old_data?: any;
    new_data?: any;
    changed_at?: string;
    user_agent?: string;
    ip_address?: string;
}

export const auditService = {
    /**
     * Adiciona um rastro manual de auditoria (para intenções do Agente)
     */
    async logAction(action: {
        table_name: string;
        operation: 'AGENT_INTENT' | 'MANUAL_OVERRIDE' | 'SCRIPT_EXEC';
        record_id?: string;
        new_data: any;
        description?: string;
    }) {
        const { error } = await supabase.from('audit_log').insert({
            table_name: action.table_name,
            operation: action.operation,
            record_id: action.record_id,
            new_data: { ...action.new_data, description: action.description },
            user_agent: 'RVM_AGENT_v4'
        });

        if (error) {
            console.error('[auditService] Erro ao registrar log manual:', error);
        }
    },

    /**
     * Busca os logs de auditoria
     */
    async getLogs(params?: { table_name?: string; limit?: number }) {
        let query = supabase.from('audit_log').select('*').order('changed_at', { ascending: false });

        if (params?.table_name) {
            query = query.eq('table_name', params.table_name);
        }

        if (params?.limit) {
            query = query.limit(params.limit);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    }
};
