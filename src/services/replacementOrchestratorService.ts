import type { WorkbookPart, Publisher } from '../types';
import { reassignParts } from './reassignmentService';
import { zapiOrchestrator } from './zapiOrchestrator';
import { communicationService } from './communicationService';
import { supabase } from '../lib/supabase';

export interface ReplacementOptions {
    notifyOld: boolean;
    notifyNew: boolean;
    notifyPartner: boolean;
}

export type S89Provider = (
    part: WorkbookPart,
    publishers: Publisher[],
    isStudent: boolean,
    titularPartForPdf: WorkbookPart,
    assistantNameForPdf?: string
) => Promise<string | null>;

export const replacementOrchestratorService = {
    async executeAutoReassignment(
        partId: string,
        publishers: Publisher[],
        parts: WorkbookPart[],
        s89Provider: S89Provider
    ) {
        console.log(`[ReplacementOrchestrator] Iniciando troca automática para partId: ${partId}`);
        
        // Sempre usa applyEngineRules: true (Conservadorismo absoluto - cadeado fechado)
        const result = await reassignParts([partId], publishers, parts, { applyEngineRules: true });
        
        if (!result.success || result.partsGenerated === 0) {
            console.log(`[ReplacementOrchestrator] Falha no motor estrito para a parte ${partId}. Escalando para fallback humano.`);
            await this.executeHumanFallbackAlert(partId, parts, publishers);
            return { success: false, reason: 'Nenhum candidato elegível encontrado pelo motor estrito.' };
        }

        const part = parts.find(p => p.id === partId);
        if (!part) return { success: false, reason: 'Parte não encontrada' };
        
        // reassignParts já salvou a parte com o novo publicador.
        // Vamos recarregar a parte do DB ou apenas usar a que temos alterada.
        const { data: updatedPartRaw } = await supabase.from('workbook_parts').select('*').eq('id', partId).single();
        if (!updatedPartRaw) return { success: false, reason: 'Parte atualizada não encontrada no DB' };
        
        const newPubId = updatedPartRaw.resolved_publisher_id;
        if (!newPubId) return { success: false, reason: 'Novo publicador não resolvido após reassignParts' };
        
        // Marcamos os metadados de substituição
        await supabase.from('workbook_parts').update({
            is_substitution: true,
            substituted_publisher_name: part.resolvedPublisherName || part.rawPublisherName
        }).eq('id', partId);
        
        const updatedPart: WorkbookPart = { ...part, resolvedPublisherId: newPubId, resolvedPublisherName: publishers.find(p => p.id === newPubId)?.name || '' };

        // Agora executa o pipeline universal
        await this.executeNotificationPipeline(
            updatedPart,
            part.resolvedPublisherName || part.rawPublisherName || '',
            publishers,
            parts,
            { notifyOld: false, notifyNew: true, notifyPartner: true },
            s89Provider
        );

        return { success: true };
    },

    async executeManualReplacement(
        partId: string,
        newPublisherId: string | undefined,
        newPublisherName: string,
        oldPublisherName: string,
        part: WorkbookPart,
        publishers: Publisher[],
        parts: WorkbookPart[],
        options: ReplacementOptions,
        s89Provider: S89Provider
    ) {
        console.log(`[ReplacementOrchestrator] Iniciando troca manual para partId: ${partId}, novo pub: ${newPublisherName}`);
        
        // 1. Gravar atualização e metadados de substituição em um único UPDATE atômico no banco
        await this.directExecutePublisherUpdate(partId, newPublisherId, newPublisherName, part, oldPublisherName);

        const updatedPart = { ...part, resolvedPublisherId: newPublisherId, resolvedPublisherName: newPublisherName, isSubstitution: true, substitutedPublisherName: oldPublisherName };

        // Executar o pipeline universal
        await this.executeNotificationPipeline(
            updatedPart,
            oldPublisherName,
            publishers,
            parts,
            options,
            s89Provider
        );

        // Gancho Aditivo S-140: se o ajuste for na semana em curso, aciona o Modo 2
        try {
            const weekParts = parts.filter(p => p.weekId === part.weekId);
            const { s140PackageService } = await import('./s140PackageService');
            s140PackageService.handlePartAdjustment({
                part: updatedPart,
                oldPublisherName,
                newPublisherName,
                weekParts,
                publishers
            }).catch(err => {
                console.error('[ReplacementOrchestrator] Falha não bloqueante ao despachar S-140 Modo 2:', err);
            });
        } catch (s140Err) {
            console.warn('[ReplacementOrchestrator] Falha ao importar s140PackageService:', s140Err);
        }

        return { success: true };
    },
    
    async directExecutePublisherUpdate(
        partId: string, 
        newId: string | undefined, 
        newName: string, 
        part: WorkbookPart,
        oldPublisherName?: string
    ) {
        const payload: any = {
            resolved_publisher_name: newName,
            status: 'PRONTO',
            is_substitution: true,
            substituted_publisher_name: oldPublisherName || null
        };
        if (newId) payload.resolved_publisher_id = newId;
        else payload.resolved_publisher_id = null;
        
        if (!part.resolvedPublisherName && !part.rawPublisherName) {
            payload.raw_publisher_name = newName;
        }

        const { error } = await supabase.from('workbook_parts').update(payload).eq('id', partId);
        if (error) throw error;
    },

    async executeHumanFallbackAlert(partId: string, parts: WorkbookPart[], publishers: Publisher[]) {
        const part = parts.find(p => p.id === partId);
        if (!part) return;

        // Notificar Admin e ARVM (Exemplo usando números hardcoded ou settings)
        // Para simplificar, vou delegar para o Z-API Orchestrator disparar alertas genéricos ou buscar nas configurações
        const { data: appSettings } = await supabase.from('app_settings').select('admin_phones').single();
        const adminPhones: string[] = appSettings?.admin_phones || [];
        
        const fallbackMsg = `🚨 *FALHA NA AUTOMATIZAÇÃO (MÁQUINA PARADA)* 🚨\n\nA designação de *${part.tituloParte || part.tipoParte}* na data *${part.date}* necessita de substituição, mas o robô de reatribuição **não encontrou nenhum candidato elegível** sob as regras estritas.\n\nPor favor, acesse o painel RVM e realize uma *substituição manual* (abrindo o cadeado se necessário).`;

        for (const phone of adminPhones) {
            if (phone) {
                await zapiOrchestrator.sendTextDirect(phone, fallbackMsg);
                await zapiOrchestrator.logDispatch(null, 'FALLBACK_ADMIN', phone, 'SUCCESS');
            }
        }
        
        // Avisar o parceiro também
        const partnerPub = this.findPartner(part, parts, publishers);
        if (partnerPub && partnerPub.phone) {
            const partnerMsg = `⚠️ *AVISO AUTOMÁTICO - RVM*\n\nOlá, ${partnerPub.name}. O publicador que faria a parte de *${part.tituloParte || part.tipoParte}* com você no dia *${part.date}* precisou cancelar.\n\nO sistema tentou achar um substituto automático, mas não conseguiu. A liderança já foi notificada para realizar uma substituição manual. Em breve você receberá o aviso do seu novo parceiro.`;
            await zapiOrchestrator.sendTextDirect(partnerPub.phone, partnerMsg);
            await zapiOrchestrator.logDispatch(null, 'FALLBACK_PARCEIRO', partnerPub.phone, 'SUCCESS');
        }
    },

    findPartner(part: WorkbookPart, parts: WorkbookPart[], publishers: Publisher[]) {
        const partNumMatch = (part.tituloParte || part.tipoParte || '').match(/^(\d+)/);
        const partNum = partNumMatch ? partNumMatch[1] : null;
        const partIsSalaB = part.modalidade?.toLowerCase().includes('b') || false;
        
        const isLeitorEBC = part.tipoParte?.toLowerCase().includes('leitor') && part.tipoParte?.toLowerCase().includes('ebc');
        const isDirigenteEBC = part.tipoParte?.toLowerCase().includes('dirigente') && part.tipoParte?.toLowerCase().includes('ebc');

        const partnerPart = parts.find(p => {
            if (p.weekId !== part.weekId || p.id === part.id) return false;
            if (!p.resolvedPublisherName && !p.rawPublisherName && !p.resolvedPublisherId) return false;

            const otherNumMatch = (p.tituloParte || p.tipoParte || '').match(/^(\d+)/);
            const otherNum = otherNumMatch ? otherNumMatch[1] : null;
            const pIsSalaB = p.modalidade?.toLowerCase().includes('b') || false;

            if (partNum && otherNum) {
                if (partNum === otherNum) {
                    return p.funcao !== part.funcao && pIsSalaB === partIsSalaB;
                }
                return false;
            }

            const pIsLeitorEBC = p.tipoParte?.toLowerCase().includes('leitor') && p.tipoParte?.toLowerCase().includes('ebc');
            const pIsDirigenteEBC = p.tipoParte?.toLowerCase().includes('dirigente') && p.tipoParte?.toLowerCase().includes('ebc');
            if (isLeitorEBC && pIsDirigenteEBC) return true;
            if (isDirigenteEBC && pIsLeitorEBC) return true;

            return p.tipoParte === part.tipoParte && p.funcao !== part.funcao && pIsSalaB === partIsSalaB;
        });

        if (!partnerPart) return null;
        const partnerPubName = partnerPart.resolvedPublisherName || partnerPart.rawPublisherName;
        return publishers.find(p => p.name === partnerPubName);
    },

    async executeNotificationPipeline(
        part: WorkbookPart,
        oldPublisherName: string,
        publishers: Publisher[],
        parts: WorkbookPart[],
        options: ReplacementOptions,
        s89Provider: S89Provider
    ) {
        if (!options.notifyOld && !options.notifyNew && !options.notifyPartner) {
            console.log('[ReplacementOrchestrator] Todas as opções de notificação são falsas. Abortando.');
            return;
        }

        const oldPub = publishers.find(p => p.name === oldPublisherName || (part.substitutedPublisherName === p.name));
        const newPub = publishers.find(p => (part.resolvedPublisherId && p.id === part.resolvedPublisherId) || p.name === part.resolvedPublisherName);
        
        const isAjudante = part.funcao === 'Ajudante';
        const partnerPart = parts.find(p => p.weekId === part.weekId && p.id !== part.id && this.findPartner(part, parts, publishers)?.name === (p.resolvedPublisherName || p.rawPublisherName));
        const partnerPub = this.findPartner(part, parts, publishers);

        console.log(`[ReplacementOrchestrator] oldPub: ${oldPub?.name}, newPub: ${newPub?.name}, partner: ${partnerPub?.name}`);

        const weekParts = parts.filter(p => p.weekId === part.weekId);

        // A. Notificar o Antigo
        if (options.notifyOld && oldPub?.phone) {
            try {
                console.log(`[ReplacementOrchestrator] Avisando antigo publicador: ${oldPub.phone}`);
                await zapiOrchestrator.dispatchManualReplacementAlert(
                    oldPub.phone,
                    oldPub.name,
                    part.tituloParte || part.tipoParte,
                    part.date || part.weekId
                );
            } catch (errOld) {
                console.error('[ReplacementOrchestrator] Erro antigo pub:', errOld);
            }
        }

        // B & C. Preparar renderização do PDF
        const partnerPubName = partnerPub?.name;
        let titularPartForPdf: WorkbookPart;
        let assistantNameForPdf: string | undefined;

        if (isAjudante) {
            titularPartForPdf = partnerPart 
                ? { ...partnerPart, resolvedPublisherName: partnerPubName }
                : { ...part, resolvedPublisherName: partnerPubName };
            assistantNameForPdf = newPub?.name;
        } else {
            titularPartForPdf = { ...part, resolvedPublisherName: newPub?.name };
            assistantNameForPdf = partnerPubName;
        }

        const pType = (part.tipoParte || '').toLowerCase();
        const pSection = (part.section || '').toLowerCase();
        const isStudent = pSection.includes('ministério') || pSection.includes('ministerio') ||
            pType.includes('leitura') || pType.includes('conversa') ||
            pType.includes('revisita') || pType.includes('estudo');

        // B. Notificar o Novo (S-89 de Substituição)
        if (options.notifyNew && newPub?.phone) {
            try {
                console.log(`[ReplacementOrchestrator] Avisando novo publicador ${newPub.name}`);
                const pdfBase64 = await s89Provider(part, publishers, isStudent, titularPartForPdf, assistantNameForPdf);
                if (pdfBase64) {
                    const { content: baseMsg, availabilityUrl } = await communicationService.prepareS89Message(
                        { ...part, resolvedPublisherName: newPub.name },
                        publishers,
                        weekParts,
                        { isSubstitution: true }
                    );

                    const finalMsg = `⚠️ *AVISO IMPORTANTE: SUBSTITUIÇÃO DE DESIGNAÇÃO!*\n_Você foi designado(a) para cobrir a parte de outro publicador._\n\n` + baseMsg;

                    await zapiOrchestrator.sendS89Direct(
                        part.id,
                        newPub.phone,
                        finalMsg,
                        pdfBase64,
                        undefined,
                        availabilityUrl,
                        newPub.id
                    );
                }
            } catch (errNew) {
                console.error('[ReplacementOrchestrator] Erro novo pub:', errNew);
            }
        }

        // C. Notificar o Parceiro
        if (options.notifyPartner && partnerPub?.phone && newPub) {
            try {
                console.log(`[ReplacementOrchestrator] Avisando parceiro ${partnerPub.name}`);
                const pdfBase64Partner = await s89Provider(part, publishers, isStudent, titularPartForPdf, assistantNameForPdf);
                if (pdfBase64Partner) {
                    const partnerPartObjForMsg = partnerPart || part;
                    const { content: baseMsgPartner, availabilityUrl: partnerAvailabilityUrl } = await communicationService.prepareS89Message(
                        { ...partnerPartObjForMsg, resolvedPublisherName: partnerPub.name },
                        publishers,
                        weekParts,
                        { isSubstitution: false }
                    );

                    const rolePartnerChanged = isAjudante ? 'Ajudante' : 'Titular';
                    const finalMsgPartner = `⚠️ *AVISO IMPORTANTE: MUDANÇA DE PARCEIRO(A)!*\n_Houve uma substituição e o seu ${rolePartnerChanged} para esta parte mudou._\n\n` + baseMsgPartner;

                    await zapiOrchestrator.sendS89Direct(
                        partnerPart?.id || part.id,
                        partnerPub.phone,
                        finalMsgPartner,
                        pdfBase64Partner,
                        undefined,
                        partnerAvailabilityUrl,
                        partnerPub.id
                    );
                }
            } catch (errPart) {
                console.error('[ReplacementOrchestrator] Erro parceiro:', errPart);
            }
        }
    }
};
