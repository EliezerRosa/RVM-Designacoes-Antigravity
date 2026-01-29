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

import { workbookService } from './workbookService';
import type { WorkbookPart } from '../types';

export type ActionSource = 'MANUAL' | 'AGENT' | 'BATCH' | 'AUTO_FILL';

export interface ActionResult {
    success: boolean;
    part?: WorkbookPart;
    error?: string;
}

export const unifiedActionService = {
    /**
     * Tenta designar um publicador para uma parte.
     * Wrapper central sobre workbookService.proposePublisher.
     */
    async executeDesignation(
        partId: string,
        publisherName: string,
        source: ActionSource,
        reason?: string
    ): Promise<ActionResult> {
        console.log(`[UnifiedAction] 📝 Solicitação de Designação:`, { partId, publisherName, source, reason });

        try {
            // 1. Validações futuras podem entrar aqui (ex: checar se está bloqueado por outro user)

            // 2. Executar via WorkbookService (Camada de Dados)
            const updatedPart = await workbookService.proposePublisher(partId, publisherName);

            // 3. Log de Auditoria (Pode ser expandido para tabela 'action_logs' no futuro)
            // Por enquanto, log de console rico para debug
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
            const updatedPart = await workbookService.rejectProposal(partId, reason);
            console.log(`[UnifiedAction] ✅ Revertido com sucesso: ${updatedPart.tituloParte}`);
            return { success: true, part: updatedPart };
        } catch (error) {
            console.error(`[UnifiedAction] ❌ Falha na reversão:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Erro desconhecido na reversão'
            };
        }
    }
};
