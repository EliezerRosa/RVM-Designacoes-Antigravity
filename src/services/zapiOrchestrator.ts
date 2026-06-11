import { supabase } from '../lib/supabase';
import { createWhatsAppAutoServiceFromEnv } from './whatsappAutoService';
import { communicationService } from './communicationService';
import { WorkbookPart } from '../types';

export type DispatchType = 'RECIBO_S89' | 'LEMBRETE_D7' | 'LEMBRETE_D2' | 'LEMBRETE_D1' | 'RECUSA_ALERTA';

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
}

export const zapiOrchestrator = new ZApiOrchestrator();
