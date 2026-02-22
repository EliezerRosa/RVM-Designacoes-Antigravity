import { supabase } from '../lib/supabase';
import type { WorkbookPart, Publisher } from '../types';
import { generateWhatsAppMessage } from './s89Generator';

export type NotificationType = 'S140' | 'S89' | 'ANNOUNCEMENT' | 'INDIVIDUAL';
export type NotificationStatus = 'PREPARED' | 'SENT' | 'FAILED';

export interface NotificationRecord {
    id?: string;
    created_at?: string;
    type: NotificationType;
    recipient_name: string;
    recipient_phone?: string;
    title?: string;
    content: string;
    status: NotificationStatus;
    metadata: any;
    action_url?: string;
}

export const communicationService = {
    /**
     * Registra uma nova mensagem no banco
     */
    async logNotification(record: NotificationRecord): Promise<NotificationRecord> {
        const { data, error } = await supabase
            .from('notifications')
            .insert(record)
            .select()
            .single();

        if (error) {
            console.error('[communicationService] Erro ao logar notificação:', error);
            throw error;
        }

        return data;
    },

    /**
     * Atualiza um registro existente
     */
    async updateNotification(id: string, updates: Partial<NotificationRecord>): Promise<NotificationRecord> {
        const { data, error } = await supabase
            .from('notifications')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[communicationService] Erro ao atualizar notificação:', error);
            throw error;
        }

        return data;
    },

    /**
     * Lista o histórico de notificações
     */
    async getHistory(limit = 50): Promise<NotificationRecord[]> {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[communicationService] Erro ao carregar histórico:', error);
            return [];
        }

        return data || [];
    },

    /**
     * Prepara a mensagem de S-140 para o Agente
     */
    prepareS140Message(weekId: string, _parts: WorkbookPart[]): string {
        // Encontrar a data da reunião (Quinta-feira)
        const dateParts = weekId.split('-');
        let displayDate = weekId;
        if (dateParts.length === 3) {
            const baseDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
            const thursday = new Date(baseDate);
            thursday.setDate(baseDate.getDate() + 3);
            displayDate = thursday.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
        }

        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'dia' : hour < 18 ? 'tarde' : 'noite';

        let text = `Olá irmãos! Bom ${greeting}!\n\nSegue programação da reunião de meio de semana, para quinta-feira, dia ${displayDate}.\n\n(Salmo 90:17)`;
        return text;
    },

    /**
     * Prepara a mensagem S-89 individual
     */
    prepareS89Message(part: WorkbookPart, publishers: Publisher[]): { content: string, phone?: string } {
        const publisherName = part.resolvedPublisherName || part.rawPublisherName;
        const pub = publishers.find(p => p.name === publisherName);

        const content = generateWhatsAppMessage(part);

        return {
            content,
            phone: pub?.phone
        };
    },

    /**
     * Gera URL do WhatsApp
     */
    generateWhatsAppUrl(phone: string, message: string): string {
        const encoded = encodeURIComponent(message);
        let cleanedPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
        if (cleanedPhone && cleanedPhone.length <= 11 && !cleanedPhone.startsWith('55')) {
            cleanedPhone = '55' + cleanedPhone;
        }
        return `https://web.whatsapp.com/send?${cleanedPhone ? 'phone=' + cleanedPhone + '&' : ''}text=${encoded}`;
    }
};
