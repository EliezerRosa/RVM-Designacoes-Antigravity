/**
 * Unified Action Service - RVM Designações
 * 
 * "The Hand" - Fonte única de verdade para ESCRITA de designações.
 * Centraliza a execução de ações vindas de:
 * 1. UI Manual (Dropdown)
 * 2. Agente IA (Chat)
 * 3. Batch (Autofill)
 * 
 * Garante:
 * - Logs consistentes
 * - Validações centrais
 * - Notificação de mudanças (via retorno ou events)
 */

import type { WorkbookPart } from '../types';
import { checkEligibility } from './eligibilityService';
import { workbookAssignmentService } from './workbookAssignmentService';
import { workbookLifecycleService } from './workbookLifecycleService';
import { unifiedActionContextService } from './unifiedActionContextService';

export type ActionSource = 'MANUAL' | 'AGENT' | 'BATCH' | 'AUTO_FILL';

export interface ActionResult {
    success: boolean;
    part?: WorkbookPart;
    error?: string;
}

export const unifiedActionService = {
    /**
     * Tenta designar um publicador para uma parte.
    * Wrapper central sobre o boundary de atribuição da apostila.
     */
    async executeDesignation(
        partId: string,
        publisherName: string,
        source: ActionSource,
        reason?: string,
        publisherId?: string
    ): Promise<ActionResult> {
        console.log(`[UnifiedAction] 📝 Solicitação de Designação:`, { partId, publisherName, source, reason });

        try {
            // 1. Resolver ID e Validação
            let resolvedId = publisherId;
            let resolvedPublisher = null;
            if (!resolvedId && publisherName) {
                resolvedPublisher = await unifiedActionContextService.resolvePublisherByName(publisherName);
                if (resolvedPublisher) {
                    resolvedId = resolvedPublisher.id;
                }
            }

            if (source === 'AGENT') {
                await this.validateEligibility(partId, publisherName, resolvedPublisher || undefined);
            }

            // 2. Executar via boundary de atribuição da apostila
            const updatedPart = await workbookAssignmentService.assignPublisher(partId, publisherName, resolvedId);

            // 3. Log de Auditoria
            console.log(`[UnifiedAction] ✅ Sucesso: ${publisherName} designado para ${updatedPart.tituloParte} (${source})`);

            return { success: true, part: updatedPart };
        } catch (error) {
            console.error(`[UnifiedAction] ❌ Falha:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Erro desconhecido na designação'
            };
        }
    },

    /**
     * Remove uma designação (Reverter/Limpar/Rejeitar).
     */
    async revertDesignation(
        partId: string,
        source: ActionSource,
        reason: string = 'Revertido pelo usuário'
    ): Promise<ActionResult> {
        console.log(`[UnifiedAction] ↩️ Solicitação de Reversão:`, { partId, source, reason });

        try {
            const updatedPart = await workbookLifecycleService.rejectProposal(partId, reason);
            console.log(`[UnifiedAction] ✅ Revertido com sucesso: ${updatedPart.tituloParte}`);
            return { success: true, part: updatedPart };
        } catch (error) {
            console.error(`[UnifiedAction] ❌ Falha na reversão:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Erro desconhecido na reversão'
            };
        }
    },

    // ========================================================================
    // HELPERS DE VALIDAÇÃO
    // ========================================================================

    async validateEligibility(partId: string, publisherName: string, publisherOverride?: Awaited<ReturnType<typeof unifiedActionContextService.resolvePublisherByName>>): Promise<void> {
        const { publisher, context } = await unifiedActionContextService.buildEligibilityContext(partId, publisherName, publisherOverride || undefined);

        const result = checkEligibility(
            publisher,
            context.modalidade as any,
            context.funcao,
            context
        );

        if (!result.eligible) {
            throw new Error(`[Safety Block] Publicador Inelegível: ${result.reason}`);
        }
    }
};

