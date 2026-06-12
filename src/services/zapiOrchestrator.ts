import { supabase } from '../lib/supabase';
import { createWhatsAppAutoServiceFromEnv } from './whatsappAutoService';
import { communicationService } from './communicationService';
import { publisherDirectoryService } from './publisherDirectoryService';
import { WorkbookPart } from '../types';

export type DispatchType = 'RECIBO_S89' | 'LEMBRETE_D7' | 'LEMBRETE_D2' | 'LEMBRETE_D1' | 'RECUSA_ALERTA' | 'PUBLICACAO_S89';

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

    async logDispatch(partId: string, dispatchType: DispatchType, phone: string, status: string): Promise<void> {
        try {
            await supabase.from('zapi_dispatch_log').insert({
                part_id: partId,
                dispatch_type: dispatchType,
                recipient_phone: phone,
                status: status
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

    async dispatchRefusalAlert(part: WorkbookPart, reason: string): Promise<boolean> {
        if (!(await this.isAutomationActive())) {
            return false;
        }

        if (await this.hasBeenDispatched(part.id, 'RECUSA_ALERTA')) {
            console.log('[zapiOrchestrator] Alerta de recusa já disparado para esta parte.');
            return true;
        }

        const alertData = await communicationService.buildRefusalAlertMessage(part, reason);
        const adminGroupId = await this.getAdminGroupId();
        
        // Se houver um grupo configurado, enviar para o grupo, senão enviar direto para o superintendente
        const recipient = adminGroupId || alertData.srvmPhone;
        
        if (!recipient) {
            console.error('[zapiOrchestrator] Nenhum destinatário para o alerta de recusa.');
            return false;
        }

        console.log(`[zapiOrchestrator] Enviando alerta de recusa para ${recipient}`);
        const result = await this.waService.sendText(recipient, alertData.alertMsg);
        
        await this.logDispatch(part.id, 'RECUSA_ALERTA', recipient, result.success ? 'SUCCESS' : 'ERROR: ' + result.error);
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
     * Envio individual do cartão S-89 (imagem + texto-com-link como caption) para
     * um publicador, via Edge Function. Idempotente por (partId, PUBLICACAO_S89)
     * quando `idempotencyType` é informado. Usado tanto pelo botão manual-z-api
     * do modal quanto pelo Publicar em lote.
     */
    async sendS89Direct(
        partId: string,
        phone: string,
        content: string,
        imageBase64: string,
        idempotencyType?: DispatchType
    ): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
        if (idempotencyType && await this.hasBeenDispatched(partId, idempotencyType)) {
            return { success: true, skipped: true };
        }
        const r = await this.sendImageDirect(phone, imageBase64, content);
        if (idempotencyType) {
            await this.logDispatch(partId, idempotencyType, phone, r.success ? 'SUCCESS' : 'ERROR: ' + (r.error || 'unknown'));
        }
        return { success: r.success, error: r.error };
    }
}

export const zapiOrchestrator = new ZApiOrchestrator();
