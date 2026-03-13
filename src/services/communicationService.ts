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

export interface ActivityLogEntry {
    id: string;
    created_at: string;
    type: 'CONFIRMATION' | 'REFUSAL' | 'NOTIFICATION_SENT';
    part_id?: string;
    publisher_name?: string;
    details?: string;
    status?: string;
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

        // Logar também no feed de atividades
        await this.logActivity({
            type: 'NOTIFICATION_SENT',
            publisher_name: record.recipient_name,
            details: record.title || record.type,
            status: record.status
        });

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
     * Registra um evento no log de atividades
     */
    async logActivity(entry: Omit<ActivityLogEntry, 'id' | 'created_at'>): Promise<void> {
        const { error } = await supabase
            .from('activity_logs')
            .insert(entry);

        if (error) {
            console.error('[communicationService] Erro ao logar atividade:', error);
        }
    },

    /**
     * Busca o log de atividades recente
     */
    async getActivityLog(limit = 40): Promise<ActivityLogEntry[]> {
        const { data, error } = await supabase
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[communicationService] Erro ao carregar log de atividades:', error);
            return [];
        }

        return data || [];
    },

    /**
     * Prepara a mensagem de S-140 para o Agente
     */
    async prepareS140Message(weekId: string, _parts: WorkbookPart[]): Promise<string> {
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

        // Add special events notes
        try {
            const { data: events } = await supabase
                .from('special_events')
                .select('*')
                .eq('week', weekId)
                .eq('is_applied', true);

            if (events && events.length > 0) {
                const { EVENT_TEMPLATES } = await import('./specialEventService');
                const eventNotes: string[] = [];

                let noteIndex = 1;
                const superscriptMap: Record<number, string> = {
                    1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹'
                };

                for (const evt of events) {
                    const template = EVENT_TEMPLATES.find((t: any) => t.id === evt.template_id);
                    let eventName = template?.name || evt.theme || 'Evento Especial';
                    if (evt.observation) {
                        eventName += ` (Obs: ${evt.observation})`;
                    }

                    const currentIndex = noteIndex++;
                    const noteChar = superscriptMap[currentIndex] || currentIndex.toString();
                    const notePrefix = `*[Nota *${noteChar}]*`;

                    if (evt.template_id === 'anuncio') {
                        eventNotes.push(`📢 ${notePrefix} *${eventName}*${evt.content ? `: ${evt.content}` : ''}`);
                    } else if (evt.template_id === 'notificacao') {
                        eventNotes.push(`🔔 ${notePrefix} *${eventName}*${evt.content ? `: ${evt.content}` : ''}`);
                    } else {
                        eventNotes.push(`🔸 ${notePrefix} *${eventName}*`);
                    }
                }

                if (eventNotes.length > 0) {
                    text += `⚠️ *Atenção — Alterações nesta semana:*\n`;
                    eventNotes.forEach(note => {
                        text += `${note}\n`;
                    });
                    text += `\n`;
                }
            }
        } catch (err) {
            console.error('[communicationService] Erro ao buscar eventos para S-140:', err);
        }

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

        // 4. Buscar parceiro (Titular/Ajudante) da mesma semana
        const { workbookService: ws } = await import('./workbookService');
        const weekParts = await ws.getPartsByWeekId(part.weekId);
        const partNumMatch = (part.tituloParte || part.tipoParte || '').match(/^(\d+)/);
        const partNum = partNumMatch ? partNumMatch[1] : null;

        const partnerPart = weekParts.find(p => {
            if (p.id === part.id) return false;
            if (!p.resolvedPublisherName && !p.rawPublisherName) return false;
            const otherNum = (p.tituloParte || p.tipoParte || '').match(/^(\d+)/)?.[1];
            if (partNum && otherNum && partNum === otherNum) return p.funcao !== part.funcao;
            return p.tipoParte === part.tipoParte && p.funcao !== part.funcao;
        });
        const partnerName = partnerPart ? (partnerPart.resolvedPublisherName || partnerPart.rawPublisherName) : null;
        const partnerPub = partnerName ? publishers.find(p => p.name.trim() === partnerName.trim()) : null;

        // 5. Calcular quinta-feira da reunião
        const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
            'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        let thursdayStr = part.weekDisplay || part.date;
        const dp = part.date?.split('-');
        if (dp && dp.length === 3) {
            const baseDate = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]));
            const daysToThu = (4 - baseDate.getDay() + 7) % 7;
            const thu = new Date(baseDate);
            thu.setDate(thu.getDate() + daysToThu);
            thursdayStr = `quinta-feira, ${thu.getDate()} de ${MESES[thu.getMonth()]} de ${thu.getFullYear()}`;
        }

        // 6. Montar mensagem de alerta
        let alertMsg = `📢 *ALERTA DE RECUSA - RVM*\n\n`;
        alertMsg += `O irmão *${publisherName}* informou que *NÃO PODERÁ* realizar a designação abaixo:\n\n`;
        alertMsg += `📖 *Parte:* ${part.tipoParte}\n`;
        if (part.tituloParte) alertMsg += `🎯 *Tema:* ${part.tituloParte}\n`;
        alertMsg += `📅 *Data:* ${thursdayStr}\n`;
        alertMsg += `📍 *Local:* ${part.modalidade?.toLowerCase().includes('b') ? 'SALA B' : 'SALÃO PRINCIPAL'}\n`;
        alertMsg += `❌ *Motivo:* ${reason || 'Não informado'}\n\n`;

        if (partnerName) {
            const partnerRole = partnerPart?.funcao === 'Ajudante' ? 'Ajudante' : 'Titular';
            alertMsg += `👥 *${partnerRole} da mesma parte:* ${partnerName}`;
            if (partnerPub?.phone) alertMsg += ` (${partnerPub.phone})`;
            alertMsg += `\n\n`;
        }

        alertMsg += `──────────────────\n`;
        alertMsg += `💡 *Sugestão de Substituto:* ${bestCandidate}\n`;
        alertMsg += `──────────────────\n\n`;

        const baseOrigin = window.location.origin;
        const basePath = import.meta.env.BASE_URL || '/';
        const normalizedPath = basePath.startsWith('/') ? basePath : `/${basePath}`;
        const baseUrl = `${baseOrigin}${normalizedPath}`.replace(/\/+$/, '');

        alertMsg += `👉 *Designar substituto:* ${baseUrl}/?admin=true&action=replace&partId=${part.id}\n\n`;
        alertMsg += `👤 *Responsável RVM:* Edmardo Queiroz (${srvmPhone})`;

        // 5. Abrir WhatsApp para o Ancião
        const url = this.generateWhatsAppUrl(srvmPhone, alertMsg);
        window.open(url, '_blank');
    },

    /**
     * Prepara a mensagem S-89 individual
     * Inclui contexto de excepcionalidades (eventos especiais) quando aplicável
     */
    async prepareS89Message(part: WorkbookPart, publishers: Publisher[], allWeekParts: WorkbookPart[] = []): Promise<{ content: string, phone?: string }> {
        const publisherName = (part.resolvedPublisherName || part.rawPublisherName || '').trim();
        const pub = publishers.find(p => p.name.trim() === publisherName);
        const recipientGender = pub?.gender || 'brother';

        // Verificar se a parte foi CANCELADA por evento
        if (part.status === 'CANCELADA' && (part as any).affectedByEventId) {
            const greeting = recipientGender === 'sister' ? 'Querida irmã' : 'Querido irmão';
            let cancelMsg = `${greeting} *${publisherName}*, paz! 🙏\n\n`;
            cancelMsg += `Informamos que a sua designação para a parte *"${part.tituloParte || part.tipoParte}"* `;
            cancelMsg += `foi *cancelada* devido a uma alteração na programação da semana.\n\n`;
            if ((part as any).cancelReason) {
                cancelMsg += `📌 *Motivo:* ${(part as any).cancelReason}\n\n`;
            }
            cancelMsg += `Agradecemos sua compreensão e disposição! 💛`;
            return { content: cancelMsg, phone: pub?.phone };
        }

        // Lógica de Parceiro (Titular/Ajudante)
        const isAjudante = part.funcao === 'Ajudante';

        let partner: WorkbookPart | undefined;
        if (allWeekParts.length > 0) {
            const partNumMatch = (part.tituloParte || part.tipoParte || '').match(/^(\d+)/);
            const partNum = partNumMatch ? partNumMatch[1] : null;

            partner = allWeekParts.find(p => {
                if (p.id === part.id) return false;
                if (!p.resolvedPublisherName && !p.rawPublisherName) return false;
                const otherNumMatch = (p.tituloParte || p.tipoParte || '').match(/^(\d+)/);
                const otherNum = otherNumMatch ? otherNumMatch[1] : null;
                if (partNum && otherNum && partNum === otherNum) {
                    return p.funcao !== part.funcao;
                }
                return p.tipoParte === part.tipoParte && p.funcao !== part.funcao;
            });
        }

        const partnerName = partner ? (partner.resolvedPublisherName || partner.rawPublisherName) : undefined;
        let partnerPhone: string | undefined;
        if (partnerName) {
            const partnerPub = publishers.find(p => p.name.trim() === partnerName.trim());
            partnerPhone = partnerPub?.phone;
        }

        const srvm = publishers.find(p => p.name === 'Edmardo Queiroz' || p.name.includes('Edmardo'));
        const srvmName = srvm?.name || 'Edmardo Queiroz';
        const srvmPhone = srvm?.phone || '';

        let content = generateWhatsAppMessage(
            part,
            recipientGender,
            partnerName,
            partnerPhone,
            isAjudante,
            srvmName,
            srvmPhone
        );

        // Buscar eventos especiais da semana para adicionar contexto
        try {
            const { data: events } = await supabase
                .from('special_events')
                .select('*')
                .eq('week', part.weekId)
                .eq('is_applied', true);

            if (events && events.length > 0) {
                const { EVENT_TEMPLATES } = await import('./specialEventService');
                let noteIndex = 1;
                for (const evt of events) {
                    const template = EVENT_TEMPLATES.find((t: any) => t.id === evt.template_id);
                    let eventName = template?.name || evt.theme || 'Evento Especial';
                    if (evt.observation) {
                        eventName += ` (Obs: ${evt.observation})`;
                    }

                    const resolvedImpacts = (evt.impacts && evt.impacts.length > 0)
                        ? evt.impacts
                        : [{ action: evt.override_action || template?.impact?.action || 'NO_IMPACT' }];

                    // Verificar se ESTA parte é afetada diretamente
                    const affectedIds = new Set<string>();
                    resolvedImpacts.forEach((imp: any) => {
                        if (imp.targetPartId) affectedIds.add(imp.targetPartId);
                        if (imp.targetPartIds) imp.targetPartIds.forEach((id: string) => affectedIds.add(id));
                        if (imp.affectedPartIds) imp.affectedPartIds.forEach((id: string) => affectedIds.add(id));
                    });

                    const isDirectlyAffected = (part as any).affectedByEventId === evt.id || (part as any).createdByEventId === evt.id || affectedIds.has(part.id);

                    const superscriptMap: Record<number, string> = {
                        1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹'
                    };
                    const currentIndex = noteIndex++;
                    const sup = superscriptMap[currentIndex] || currentIndex.toString();

                    if (isDirectlyAffected) {
                        const actions = resolvedImpacts.map((i: any) => i.action);

                        if (actions.includes('TIME_ADJUSTMENT') || actions.includes('REDUCE_VIDA_CRISTA_TIME')) {
                            relevantNotes.push(`⏱️ *[Nota *${sup}]* O tempo desta parte foi ajustado devido a: *${eventName}*`);
                        } else if (actions.includes('REPLACE_PART') || actions.includes('REPLACE_SECTION') || actions.includes('SC_VISIT_LOGIC')) {
                            relevantNotes.push(`🔄 *[Nota *${sup}]* Esta parte sofreu adaptações na programação devido a: *${eventName}*`);
                        } else if (actions.includes('ADD_PART')) {
                            relevantNotes.push(`✨ *[Nota *${sup}]* Esta é uma parte especial da programação de: *${eventName}*`);
                        } else if (actions.includes('NO_IMPACT')) {
                            relevantNotes.push(`📌 *[Nota *${sup}]* Esta parte tem uma observação importante: *${eventName}*`);
                        }
                    }

                    // Sempre incluir anúncios/notificações da semana na lista geral
                    if (evt.template_id === 'anuncio' || evt.template_id === 'notificacao') {
                        const icon = evt.template_id === 'anuncio' ? '📢' : '🔔';
                        const evtContent = evt.content ? `: ${evt.content}` : '';
                        relevantNotes.push(`${icon} *[Nota *${sup}] ${eventName}*${evtContent}`);
                    }
                }

                if (relevantNotes.length > 0) {
                    // Remover duplicatas
                    const uniqueNotes = Array.from(new Set(relevantNotes));

                    content += `\n\n──────────────────\n`;
                    content += `⚠️ *ATENÇÃO — Alterações nesta semana:*\n`;
                    uniqueNotes.forEach(note => {
                        content += `• ${note}\n`;
                    });
                }
            }
        } catch (err) {
            console.error('[communicationService] Erro ao buscar eventos para contexto:', err);
            // Não bloquear o envio da mensagem
        }

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
        return `https://api.whatsapp.com/send?${cleanedPhone ? 'phone=' + cleanedPhone + '&' : ''}text=${encoded}`;
    }
};
