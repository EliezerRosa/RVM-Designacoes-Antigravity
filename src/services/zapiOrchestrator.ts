import { supabase } from '../lib/supabase';
import { createWhatsAppAutoServiceFromEnv } from './whatsappAutoService';
import { communicationService } from './communicationService';
import { publisherDirectoryService } from './publisherDirectoryService';
import type { WorkbookPart } from '../types';

export type DispatchType = 'RECIBO_S89' | 'LEMBRETE_D7' | 'LEMBRETE_D2' | 'LEMBRETE_D1' | 'RECUSA_ALERTA' | 'PUBLICACAO_S89' | 'COBRANCA_D9';

class ZApiOrchestrator {
    private waService = createWhatsAppAutoServiceFromEnv();

    async isAutomationActive(): Promise<boolean> {
        try {
            const { data, error } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'zapi_automation_active')
                .single();
            if (error) return false;
            return data?.value === true || data?.value === 'true';
        } catch {
            return false;
        }
    }

    async getAdminGroupId(): Promise<string | null> {
        try {
            const { data, error } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'zapi_group_id')
                .single();
            if (error) return null;
            return data?.value || null;
        } catch {
            return null;
        }
    }

    async logDispatch(partId: string, dispatchType: DispatchType, phone: string, status: string, messageId?: string): Promise<void> {
        try {
            await supabase.from('zapi_dispatch_log').insert({
                part_id: partId,
                dispatch_type: dispatchType,
                recipient_phone: phone,
                status: status,
                message_id: messageId || null,
            });
        } catch (err) {
            console.error('[zapiOrchestrator] Falha ao logar dispatch:', err);
        }
    }

    async hasBeenDispatched(partId: string, dispatchType: DispatchType): Promise<boolean> {
        try {
            const { data, error } = await supabase
                .from('zapi_dispatch_log')
                .select('id')
                .eq('part_id', partId)
                .eq('dispatch_type', dispatchType)
                .eq('status', 'SUCCESS')
                .maybeSingle();
            
            if (error || !data) return false;
            return true;
        } catch {
            return false;
        }
    }

    async dispatchS89Receipt(partId: string, phone: string, caption: string, imageBase64?: string): Promise<boolean> {
        if (!(await this.isAutomationActive())) {
            console.log('[zapiOrchestrator] Automação desativada, skip dispatchS89Receipt');
            return false;
        }

        if (await this.hasBeenDispatched(partId, 'RECIBO_S89')) {
            console.log('[zapiOrchestrator] Recibo já enviado anteriormente para esta parte.');
            return true;
        }

        console.log(`[zapiOrchestrator] Enviando recibo para ${phone}`);
        let result;
        if (imageBase64) {
            result = await this.waService.sendImage(phone, imageBase64, caption);
        } else {
            result = await this.waService.sendText(phone, caption);
        }
        
        await this.logDispatch(partId, 'RECIBO_S89', phone, result.success ? 'SUCCESS' : 'ERROR: ' + result.error);
        return result.success;
    }

    async getAdminPhones(): Promise<string[]> {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('email')
                .eq('role', 'admin');
            if (error || !data) return [];
            const adminEmails = data.map(d => d.email).filter(Boolean);
            
            const { data: pubData, error: pubError } = await supabase
                .from('publishers')
                .select('phone')
                .in('email', adminEmails);
            
            if (pubError || !pubData) return [];
            return pubData.map(p => p.phone).filter(Boolean) as string[];
        } catch {
            return [];
        }
    }

    async dispatchRefusalAlert(part: WorkbookPart, reason: string): Promise<boolean> {
        if (!(await this.isAutomationActive())) {
            return false;
        }

        if (await this.hasBeenDispatched(part.id, 'RECUSA_ALERTA')) {
            console.log('[zapiOrchestrator] Alerta de recusa já disparado para esta parte.');
            return true;
        }

        const alertData = await communicationService.buildRefusalAlertMessage(part, reason);

        // Recusa: alertar SRVM, Ajudante SRVM, e todos os Admins do sistema.
        const [srvmPhone, ajdPhone, adminPhones] = await Promise.all([
            this.getSrvmPhone(),
            this.getAjdSrvmPhone(),
            this.getAdminPhones()
        ]);
        
        const recipients = Array.from(new Set(
            [srvmPhone, ajdPhone, alertData.srvmPhone, ...adminPhones].filter((x): x is string => !!x && x.trim().length > 0)
        ));

        if (recipients.length === 0) {
            console.error('[zapiOrchestrator] Nenhum destinatário para o alerta de recusa.');
            return false;
        }

        let anySuccess = false;
        for (const recipient of recipients) {
            console.log(`[zapiOrchestrator] Enviando alerta de recusa para ${recipient}`);
            const result = await this.sendTextDirect(recipient, alertData.alertMsg);
            await this.logDispatch(part.id, 'RECUSA_ALERTA', recipient, result.success ? 'SUCCESS' : 'ERROR: ' + result.error);
            if (result.success) anySuccess = true;
        }
        return anySuccess;
    }
    
    /**
     * Envia um alerta ao parceiro (Titular ou Ajudante) de que a sua dupla foi trocada
     * (geralmente usado na Substituição Rápida ou troca manual confirmada).
     */
    async dispatchPartnerReplacementAlert(
        partnerPhone: string,
        partnerName: string,
        partType: string,
        partDate: string,
        newSubstituteName: string,
        newSubstitutePhone: string,
        isNewSubstituteAjudante: boolean
    ): Promise<boolean> {
        if (!partnerPhone) return false;

        const roleText = isNewSubstituteAjudante ? 'Ajudante' : 'Titular';
        const phoneText = newSubstitutePhone ? `\n📞 Contato: ${newSubstitutePhone}` : '';

        const msg = `🔄 *Aviso de Mudança — RVM*\n\n` +
            `Olá, ${partnerName}! Tudo bem?\n` +
            `Informamos que houve uma substituição na sua parte de *${partType}* do dia *${partDate}*.\n\n` +
            `O seu novo ${roleText} será o(a) irmão(ã): *${newSubstituteName}*${phoneText}\n\n` +
            `Este é apenas um aviso automático para que você possa entrar em contato com sua nova dupla para os ensaios. Que Jeová abençoe! 🙏`;

        const result = await this.sendTextDirect(partnerPhone, msg);
        return result.success;
    }
    async dispatchManualReplacementAlert(
        oldPhone: string,
        oldName: string,
        partType: string,
        partDate: string
    ): Promise<boolean> {
        if (!oldPhone) return false;

        const msg = `🔄 *Aviso de Ajuste na Tabela — RVM*\n\n` +
            `Olá, ${oldName}! Tudo bem?\n` +
            `Informamos que, devido a um ajuste manual na tabela, houve uma alteração na sua designação:\n\n` +
            `📝 *Parte:* ${partType}\n` +
            `📅 *Data:* ${partDate}\n\n` +
            `Esta parte foi repassada para outro irmão. Portanto, você não precisará mais realizá-la. Agradecemos a sua compreensão e apoio! 🙏`;

        const result = await this.sendTextDirect(oldPhone, msg);
        return result.success;
    }

    async sendText(phone: string, text: string) {
        return this.waService.sendText(phone, text);
    }

    /**
     * Envia uma imagem (base64 ou data-URL) para o grupo configurado em
     * `settings.zapi_group_id`, usando a Edge Function `send-whatsapp`
     * (action `send-image`). Caminho 100% desacoplado do fluxo manual:
     * não passa pela validação de telefone BR dos providers client-side
     * (group ids não são telefones), nem usa `createWhatsAppAutoServiceFromEnv`.
     */
    async dispatchGroupImage(imageBase64: string, caption?: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
        const groupId = await this.getAdminGroupId();
        if (!groupId) {
            return { success: false, error: 'Grupo não configurado (settings.zapi_group_id).' };
        }
        return this.sendImageDirect(groupId, imageBase64, caption);
    }

    // ========================================================================
    // FASE 1 — Núcleo z-api desacoplado (Publicar + manuais-z-api)
    // Todos os envios abaixo usam EXCLUSIVAMENTE a Edge Function `send-whatsapp`
    // (caminho desacoplado), nunca o waService client-side. Não passam pela
    // validação de telefone BR (que rejeita group ids).
    // ========================================================================

    /**
     * Envia uma imagem (base64 ou data-URL) para um destino arbitrário (telefone
     * ou group id) via Edge Function `send-whatsapp` (action `send-image`).
     * Base de `dispatchGroupImage` e dos envios em lote.
     */
    async sendImageDirect(phone: string, imageBase64: string, caption?: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
        if (!phone) {
            return { success: false, error: 'Destinatário vazio.' };
        }

        const base64Data = imageBase64.includes('base64,')
            ? imageBase64.split('base64,')[1]
            : imageBase64;

        try {
            const { data, error } = await supabase.functions.invoke('send-whatsapp', {
                body: {
                    action: 'send-image',
                    phone,
                    image: base64Data,
                    caption: caption || '',
                },
            });

            if (error) {
                return { success: false, error: error.message };
            }
            return { success: data?.success ?? true, messageId: data?.messageId, error: data?.error };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Envia texto para um destino arbitrário via Edge Function `send-whatsapp`
     * (action `send-text`). Desacoplado (aceita group ids).
     */
    async sendTextDirect(phone: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
        if (!phone) {
            return { success: false, error: 'Destinatário vazio.' };
        }
        try {
            const { data, error } = await supabase.functions.invoke('send-whatsapp', {
                body: { action: 'send-text', phone, message: text },
            });
            if (error) {
                return { success: false, error: error.message };
            }
            return { success: data?.success ?? true, messageId: data?.messageId, error: data?.error };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Localiza o telefone do publicador com a função informada.
     * Robusto: busca por `funcao` (não por nome hardcoded).
     */
    private async getPhoneByFuncao(funcao: string): Promise<string | null> {
        try {
            const publishers = await publisherDirectoryService.loadAllPublishers();
            const match = publishers.find(p => p.funcao === funcao);
            return match?.phone?.trim() || null;
        } catch (err) {
            console.error('[zapiOrchestrator] Falha ao localizar telefone por função:', funcao, err);
            return null;
        }
    }

    /** Telefone do Superintendente da Reunião Vida e Ministério (SRVM). */
    async getSrvmPhone(): Promise<string | null> {
        return this.getPhoneByFuncao('Superintendente da Reunião Vida e Ministério');
    }

    /** Telefone do Ajudante do Superintendente da Reunião Vida e Ministério. */
    async getAjdSrvmPhone(): Promise<string | null> {
        return this.getPhoneByFuncao('Ajudante do Superintendente da Reunião Vida e Ministério');
    }

    /**
     * Destinos padrão para envio de S-140/Status via z-api:
     * Ajudante SRVM + SRVM + Grupo (sem duplicatas, sem vazios).
     */
    async getBroadcastRecipients(): Promise<string[]> {
        const [srvm, ajd, group] = await Promise.all([
            this.getSrvmPhone(),
            this.getAjdSrvmPhone(),
            this.getAdminGroupId(),
        ]);
        const list = [ajd, srvm, group].filter((x): x is string => !!x && x.trim().length > 0);
        return Array.from(new Set(list));
    }

    /**
     * Envia uma imagem (com caption) para uma lista de destinatários, via Edge
     * Function. Retorna o resultado por destinatário.
     */
    async dispatchImageToRecipients(imageBase64: string, caption: string, recipients: string[]): Promise<{ phone: string; success: boolean; error?: string }[]> {
        const results: { phone: string; success: boolean; error?: string }[] = [];
        for (const phone of recipients) {
            const r = await this.sendImageDirect(phone, imageBase64, caption);
            results.push({ phone, success: r.success, error: r.error });
        }
        return results;
    }

    /**
     * Envia mensagem com lista de botões de resposta rápida via Edge Function `send-whatsapp` (action `send-button-list`).
     */
    async sendButtonListDirect(
        phone: string,
        message: string,
        buttons: { id: string; label: string }[]
    ): Promise<{ success: boolean; messageId?: string; error?: string }> {
        if (!phone) {
            return { success: false, error: 'Destinatário vazio.' };
        }
        try {
            const { data, error } = await supabase.functions.invoke('send-whatsapp', {
                body: {
                    action: 'send-button-list',
                    phone,
                    message,
                    buttons,
                },
            });

            if (error) {
                return { success: false, error: error.message };
            }
            return { success: data?.success ?? true, messageId: data?.messageId, error: data?.error };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Envia mensagem com botões de ação (REPLY, URL, CALL) via Edge Function `send-whatsapp` (action `send-button-actions`).
     */
    async sendButtonActionsDirect(
        phone: string,
        message: string,
        buttonActions: Array<{ id: string; type: 'REPLY' | 'URL' | 'CALL'; label: string; url?: string; phone?: string }>
    ): Promise<{ success: boolean; messageId?: string; error?: string }> {
        if (!phone) {
            return { success: false, error: 'Destinatário vazio.' };
        }
        try {
            const { data, error } = await supabase.functions.invoke('send-whatsapp', {
                body: {
                    action: 'send-button-actions',
                    phone,
                    message,
                    buttonActions,
                },
            });

            if (error) {
                return { success: false, error: error.message };
            }
            return { success: data?.success ?? true, messageId: data?.messageId, error: data?.error };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Envio individual do cartão S-89 no formato interativo Opção B com Botões de Ação Direta:
     * 1. Imagem PNG do cartão S-89 (sem texto longo na legenda).
     * 2. Mensagem detalhada com 3 botões nativos Z-API via send-button-actions:
     *    - [ ✅ Confirmar ] (tipo REPLY)
     *    - [ ❌ Não Poderei ] (tipo REPLY)
     *    - [ 📅 Disponibilidade ] (tipo URL que abre diretamente o portal no navegador)
     * Idempotente por (partId, PUBLICACAO_S89) quando `idempotencyType` é informado.
     */
    async sendS89Direct(
        partId: string,
        phone: string,
        content: string,
        imageBase64: string,
        idempotencyType?: DispatchType,
        availabilityUrl?: string
    ): Promise<{ success: boolean; skipped?: boolean; messageId?: string; error?: string }> {
        if (idempotencyType && await this.hasBeenDispatched(partId, idempotencyType)) {
            return { success: true, skipped: true };
        }

        // 1. Envia a imagem do Cartão S-89 primeiro (sem texto longo na legenda)
        const imgRes = await this.sendImageDirect(phone, imageBase64, '');
        console.log('[zapiOrchestrator.sendS89Direct] Resultado do envio da imagem S-89:', imgRes);

        // 2. Monta os 3 botões de ação rápida nativos do WhatsApp (2 REPLY + 1 URL direta)
        const buttonActions: Array<{ id: string; type: 'REPLY' | 'URL'; label: string; url?: string }> = [
            { id: `CONFIRMAR:${partId}`, type: 'REPLY', label: '✅ Confirmar' },
            { id: `RECUSAR:${partId}`, type: 'REPLY', label: '❌ Não Poderei' },
        ];

        if (availabilityUrl) {
            buttonActions.push({
                id: `DISPONIBILIDADE:${partId}`,
                type: 'URL',
                url: availabilityUrl,
                label: '📅 Disponibilidade',
            });
        } else {
            // Fallback caso availabilityUrl não seja fornecida: botão REPLY escutado pelo webhook
            buttonActions.push({
                id: `DISPONIBILIDADE:${partId}`,
                type: 'REPLY',
                label: '📅 Disponibilidade',
            });
        }

        // 3. Envia o texto da designação acompanhado dos 3 botões nativos via send-button-actions
        let msgRes = await this.sendButtonActionsDirect(phone, content, buttonActions);

        // Fallback: se botões falharem por qualquer motivo, tenta send-button-list ou texto padrão
        if (!msgRes.success) {
            console.warn('[zapiOrchestrator] Falha em send-button-actions, tentando send-button-list:', msgRes.error);
            const fallbackButtons = [
                { id: `CONFIRMAR:${partId}`, label: '✅ Confirmar' },
                { id: `RECUSAR:${partId}`, label: '❌ Não Poderei' },
                { id: `DISPONIBILIDADE:${partId}`, label: '📅 Disponibilidade' },
            ];
            msgRes = await this.sendButtonListDirect(phone, content, fallbackButtons);
            if (!msgRes.success) {
                console.warn('[zapiOrchestrator] Falha em send-button-list, enviando texto puro:', msgRes.error);
                msgRes = await this.sendTextDirect(phone, content);
            }
        }

        const effectiveSuccess = imgRes.success || msgRes.success;
        const mainMessageId = msgRes.messageId || imgRes.messageId;

        // Registra o despacho para viabilizar causalidade e resolução de respostas no webhook
        const logType = idempotencyType || 'PUBLICACAO_S89';
        await this.logDispatch(
            partId,
            logType,
            phone,
            effectiveSuccess ? 'SUCCESS' : 'ERROR: ' + (msgRes.error || imgRes.error || 'unknown'),
            mainMessageId
        );
        return { success: effectiveSuccess, messageId: mainMessageId, error: msgRes.error || imgRes.error };
    }

    /**
     * Exclui uma mensagem enviada via Z-API ("Apagar para todos").
     * Deve ser chamada dentro da janela de até ~48h permitida pelo WhatsApp.
     */
    async deleteMessage(phone: string, messageId: string, deleteForMe: boolean = false): Promise<{ success: boolean; error?: string }> {
        if (!phone || !messageId) {
            return { success: false, error: 'Parâmetros phone e messageId são obrigatórios.' };
        }
        try {
            const { data, error } = await supabase.functions.invoke('send-whatsapp', {
                body: {
                    action: 'delete-message',
                    phone,
                    messageId,
                    deleteForMe,
                },
            });
            if (error) {
                return { success: false, error: error.message };
            }
            return { success: data?.success ?? true, error: data?.error };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Revoga/apaga mensagens de envio de uma parte específica que tenham message_id gravado.
     */
    async revokeDispatchesForPart(partId: string): Promise<{ revokedCount: number; errors: string[] }> {
        const errors: string[] = [];
        let revokedCount = 0;
        try {
            const { data: logs, error } = await supabase
                .from('zapi_dispatch_log')
                .select('id, recipient_phone, message_id')
                .eq('part_id', partId)
                .eq('status', 'SUCCESS')
                .not('message_id', 'is', null);

            if (error || !logs || logs.length === 0) {
                return { revokedCount: 0, errors: error ? [error.message] : [] };
            }

            for (const log of logs) {
                if (!log.message_id || !log.recipient_phone) continue;
                const delRes = await this.deleteMessage(log.recipient_phone, log.message_id);
                if (delRes.success) {
                    revokedCount++;
                    await supabase
                        .from('zapi_dispatch_log')
                        .update({ status: 'REVOKED' })
                        .eq('id', log.id);
                } else {
                    errors.push(`Falha ao apagar msg ${log.message_id}: ${delRes.error || 'erro desconhecido'}`);
                }
            }
        } catch (err: any) {
            errors.push(err.message || String(err));
        }
        return { revokedCount, errors };
    }

    /**
     * Revoga/apaga todas as mensagens de publicação enviadas para uma semana.
     */
    async revokeWeekPublicationDispatches(weekParts: WorkbookPart[]): Promise<{ totalFound: number; revokedCount: number; errors: string[] }> {
        const partIds = weekParts.map(p => p.id);
        const allIds = Array.from(new Set([
            ...partIds,
            ...partIds.map(id => `${id}-titular`),
            ...partIds.map(id => `${id}-ajudante`),
        ]));

        const errors: string[] = [];
        let revokedCount = 0;

        try {
            const { data: logs, error } = await supabase
                .from('zapi_dispatch_log')
                .select('id, part_id, recipient_phone, message_id')
                .in('part_id', allIds)
                .eq('status', 'SUCCESS')
                .not('message_id', 'is', null);

            if (error || !logs) {
                return { totalFound: 0, revokedCount: 0, errors: error ? [error.message] : [] };
            }

            for (const log of logs) {
                if (!log.message_id || !log.recipient_phone) continue;
                const delRes = await this.deleteMessage(log.recipient_phone, log.message_id);
                if (delRes.success) {
                    revokedCount++;
                    await supabase
                        .from('zapi_dispatch_log')
                        .update({ status: 'REVOKED' })
                        .eq('id', log.id);
                } else {
                    errors.push(`Parte ${log.part_id}: ${delRes.error || 'falha ao excluir'}`);
                }
            }

            return { totalFound: logs.length, revokedCount, errors };
        } catch (err: any) {
            errors.push(err.message || String(err));
            return { totalFound: 0, revokedCount, errors };
        }
    }
}

export const zapiOrchestrator = new ZApiOrchestrator();
