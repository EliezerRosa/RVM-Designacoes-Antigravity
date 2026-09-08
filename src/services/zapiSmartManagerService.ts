/**
 * zapiSmartManagerService.ts — Serviço de Gestão e Monitoramento da Inteligência Nativa do WhatsApp (Z-API).
 * Permite que a liderança visualize em tempo real as respostas, confirmações, recusas e justificativas dos publicadores.
 */

import { supabase } from '../lib/supabase';

export interface SmartInteraction {
    id: string;
    created_at: string;
    phone: string | null;
    publisher_id: string | null;
    publisher_name: string | null;
    workbook_part_id: string | null;
    inbound_message_id: string | null;
    inbound_text: string | null;
    raw_payload: any;
    matched_by: 'BUTTON' | 'REACTION' | 'QUOTED_MSG' | 'TEMPORAL_WINDOW' | 'UNMATCHED';
    detected_intent: 'CONFIRMAR' | 'RECUSAR' | 'DISPONIBILIDADE' | 'PERMUTA' | 'DUVIDA' | 'OUTRO';
    confidence: number;
    action_taken: string;
    reason_extracted: string | null;
    outbound_reply_text: string | null;
    outbound_message_id: string | null;
    processing_time_ms: number | null;
}

export interface SmartInteractionStats {
    total: number;
    confirmed: number;
    refused: number;
    availabilityRequests: number;
    swaps: number;
    others: number;
    avgProcessingMs: number;
}

export const zapiSmartManagerService = {
    /**
     * Busca as últimas interações capturadas via WhatsApp Z-API
     */
    async getRecentInteractions(limit: number = 50): Promise<SmartInteraction[]> {
        try {
            const { data, error } = await supabase
                .from('zapi_smart_interactions')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.error('[zapiSmartManagerService] Erro ao buscar interações:', error);
                return [];
            }

            return (data || []) as SmartInteraction[];
        } catch (err) {
            console.error('[zapiSmartManagerService] Falha ao listar interações:', err);
            return [];
        }
    },

    /**
     * Calcula métricas e estatísticas agregadas das interações
     */
    async getStats(): Promise<SmartInteractionStats> {
        try {
            const { data, error } = await supabase
                .from('zapi_smart_interactions')
                .select('detected_intent, processing_time_ms');

            if (error || !data) {
                return { total: 0, confirmed: 0, refused: 0, availabilityRequests: 0, swaps: 0, others: 0, avgProcessingMs: 0 };
            }

            let confirmed = 0;
            let refused = 0;
            let availabilityRequests = 0;
            let swaps = 0;
            let others = 0;
            let totalMs = 0;

            for (const row of data) {
                if (row.detected_intent === 'CONFIRMAR') confirmed++;
                else if (row.detected_intent === 'RECUSAR') refused++;
                else if (row.detected_intent === 'DISPONIBILIDADE') availabilityRequests++;
                else if (row.detected_intent === 'PERMUTA') swaps++;
                else others++;

                if (row.processing_time_ms) totalMs += row.processing_time_ms;
            }

            const total = data.length;
            const avgProcessingMs = total > 0 ? Math.round(totalMs / total) : 0;

            return {
                total,
                confirmed,
                refused,
                availabilityRequests,
                swaps,
                others,
                avgProcessingMs,
            };
        } catch (err) {
            console.error('[zapiSmartManagerService] Falha ao calcular estatísticas:', err);
            return { total: 0, confirmed: 0, refused: 0, availabilityRequests: 0, swaps: 0, others: 0, avgProcessingMs: 0 };
        }
    },

    /**
     * Simula o envio de um webhook para testes locais ou de validação
     */
    async simulateWebhookPayload(payload: any): Promise<{ success: boolean; data?: any; error?: string }> {
        try {
            const { data, error } = await supabase.functions.invoke('zapi-smart-webhook', {
                body: payload,
            });

            if (error) return { success: false, error: error.message };
            return { success: true, data };
        } catch (err: any) {
            return { success: false, error: err.message || String(err) };
        }
    }
};
