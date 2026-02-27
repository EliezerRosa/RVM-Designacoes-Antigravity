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

        let text = `Olá, amados irmãos! Bom ${greeting}. 👋\n\n`;
        text += `Compartilhamos com alegria a *Programação da Reunião de Meio de Semana* para o dia *${displayDate}*:\n\n`;
        text += `📜 *Acesse o programa completo anexo.* ⬆️\n\n`;
        text += `_“E esteja sobre nós a benevolência de Jeová, nosso Deus; sim, torna próspero o trabalho de nossas mãos.”_ (Salmo 90:17) ✨`;

        return text;
    },

    /**
     * Notifica o superintendente da RVM sobre uma recusa e sugere substitutos
     */
    async notifyOverseerOfRefusal(part: WorkbookPart, reason: string): Promise<void> {
        console.log('[communicationService] Notificando superintendente da recusa...');

        const publisherName = part.resolvedPublisherName || part.rawPublisherName;

        // 1. Carregar dados necessários dinamicamente para evitar circular dependencies
        const { api } = await import('./api');
        const { loadCompletedParticipations } = await import('./historyAdapter');
        const { getRankedCandidates } = await import('./unifiedRotationService');
        const { checkEligibility } = await import('./eligibilityService');

        const publishers = await api.loadPublishers();
        const history = await loadCompletedParticipations();

        // 2. Encontrar o Ancião Edmardo Queiroz (Superintendente RVM)
        // Buscamos especificamente por Edmardo para evitar pegar outros parentes (Ex: Marilene, Larissa)
        const srvm = publishers.find(p => p.name === 'Edmardo Queiroz' || p.name.includes('Edmardo'));
        const srvmPhone = srvm?.phone || '';

        // 3. Buscar sugestão de substituto
        const eligible = publishers.filter(p => {
            // Não sugerir quem acabou de recusar
            if (p.name === publisherName) return false;

            const res = checkEligibility(p, part.modalidade as any, part.funcao as any, {
                date: part.date,
                secao: part.section
            });
            return res.eligible;
        });

        const ranked = getRankedCandidates(eligible, part.modalidade, history);
        const bestCandidate = ranked[0]?.publisher?.name || 'Não encontrado';

        // 4. Montar mensagem de alerta
        let alertMsg = `📢 *ALERTA DE RECUSA - RVM*\n\n`;
        alertMsg += `O irmão *${publisherName}* informou que *NÃO PODERÁ* realizar a designação abaixo:\n\n`;
        alertMsg += `📖 *Parte:* ${part.tipoParte}\n`;
        alertMsg += `📅 *Data:* ${part.weekDisplay}\n`;
        alertMsg += `📍 *Local:* ${part.modalidade?.toLowerCase().includes('b') ? 'SALA B' : 'SALÃO PRINCIPAL'}\n`;
        alertMsg += `❌ *Motivo:* ${reason || 'Não informado'}\n\n`;

        alertMsg += `──────────────────\n`;
        alertMsg += `💡 *Sugestão de Substituto:* ${bestCandidate}\n`;
        alertMsg += `──────────────────\n\n`;

        alertMsg += `👉 *Designar substituto:* ${window.location.origin}/?admin=true&action=replace&partId=${part.id}\n\n`;
        alertMsg += `👤 *Responsável RVM:* Edmardo Queiroz (${srvmPhone})`;

        // 5. Abrir WhatsApp para o Ancião
        const url = this.generateWhatsAppUrl(srvmPhone, alertMsg);
        window.open(url, '_blank');
    },

    /**
     * Prepara a mensagem S-89 individual
     */
    prepareS89Message(part: WorkbookPart, publishers: Publisher[], allWeekParts: WorkbookPart[] = []): { content: string, phone?: string } {
        const publisherName = (part.resolvedPublisherName || part.rawPublisherName || '').trim();
        const pub = publishers.find(p => p.name.trim() === publisherName);
        const recipientGender = pub?.gender || 'brother';

        // Lógica de Parceiro (Titular/Ajudante)
        const isAjudante = part.funcao === 'Ajudante';

        // Identificar número da parte ou contexto para achar o parceiro
        let partner: WorkbookPart | undefined;
        if (allWeekParts.length > 0) {
            // Regex simples para extrair número da parte (ex: "1. Leitura")
            const partNumMatch = (part.tituloParte || part.tipoParte || '').match(/^(\d+)/);
            const partNum = partNumMatch ? partNumMatch[1] : null;

            partner = allWeekParts.find(p => {
                if (p.id === part.id) return false;

                // Só considera parceiro se tiver um publicador escalado
                if (!p.resolvedPublisherName && !p.rawPublisherName) return false;

                const otherNumMatch = (p.tituloParte || p.tipoParte || '').match(/^(\d+)/);
                const otherNum = otherNumMatch ? otherNumMatch[1] : null;

                // Se tem número, bate pelo número E garante função oposta
                if (partNum && otherNum && partNum === otherNum) {
                    return p.funcao !== part.funcao;
                }

                // Fallback: mesmo tipo de parte, função necessária oposta
                return p.tipoParte === part.tipoParte && p.funcao !== part.funcao;
            });
        }

        const partnerName = partner ? (partner.resolvedPublisherName || partner.rawPublisherName) : undefined;
        let partnerPhone: string | undefined;
        if (partnerName) {
            const partnerPub = publishers.find(p => p.name.trim() === partnerName.trim());
            partnerPhone = partnerPub?.phone;
        }

        // 2. Encontrar o Ancião Edmardo Queiroz (Superintendente RVM)
        const srvm = publishers.find(p => p.name === 'Edmardo Queiroz' || p.name.includes('Edmardo'));
        const srvmName = srvm?.name || 'Edmardo Queiroz';
        const srvmPhone = srvm?.phone || '';

        const content = generateWhatsAppMessage(
            part,
            recipientGender,
            partnerName,
            partnerPhone,
            isAjudante,
            srvmName,
            srvmPhone
        );

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
