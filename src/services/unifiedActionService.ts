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
import { isBlocked, getBlockInfo } from './cooldownService';
import { workbookAssignmentService } from './workbookAssignmentService';
import { workbookLifecycleService } from './workbookLifecycleService';
import { unifiedActionContextService } from './unifiedActionContextService';
import { loadPublisherParticipations } from './historyAdapter';

export type ActionSource = 'MANUAL' | 'AGENT' | 'BATCH' | 'AUTO_FILL';

export interface ActionResult {
    success: boolean;
    part?: WorkbookPart;
    error?: string;
    warnings?: string[];
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

            const warnings: string[] = [];

            // 2. Eligibility check (all sources)
            try {
                await this.validateEligibility(partId, publisherName, resolvedPublisher || undefined);
            } catch (eligError) {
                if (source === 'BATCH') {
                    throw eligError; // Hard block for batch
                }
                // MANUAL/AGENT: warn but allow
                warnings.push(eligError instanceof Error ? eligError.message : String(eligError));
                console.warn(`[UnifiedAction] ⚠️ Eligibility warning (${source}):`, eligError);
            }

            // 3. Cooldown check (all sources)
            try {
                const cooldownWarning = await this.checkCooldown(partId, publisherName);
                if (cooldownWarning) {
                    if (source === 'BATCH') {
                        throw new Error(cooldownWarning);
                    }
                    warnings.push(cooldownWarning);
                    console.warn(`[UnifiedAction] ⚠️ Cooldown warning (${source}): ${cooldownWarning}`);
                }
            } catch (cooldownError) {
                if (source === 'BATCH') throw cooldownError;
                warnings.push(cooldownError instanceof Error ? cooldownError.message : String(cooldownError));
            }

            // 4. Executar via boundary de atribuição da apostila
            // source MANUAL ou AGENT = intervenção humana explícita
            const isManual = source === 'MANUAL' || source === 'AGENT';
            const updatedPart = await workbookAssignmentService.assignPublisher(partId, publisherName, resolvedId, isManual);

            // 5. Log de Auditoria
            const warnSuffix = warnings.length > 0 ? ` [${warnings.length} aviso(s)]` : '';
            console.log(`[UnifiedAction] ✅ Sucesso: ${publisherName} designado para ${updatedPart.tituloParte} (${source})${warnSuffix}`);

            return { success: true, part: updatedPart, warnings: warnings.length > 0 ? warnings : undefined };
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
    },

    /**
     * Verifica cooldown: publicador está bloqueado por participação recente?
     * Retorna string de aviso se em cooldown, null se ok.
     */
    async checkCooldown(_partId: string, publisherName: string): Promise<string | null> {
        try {
            // Buscar histórico do publicador diretamente do DB
            const history = await loadPublisherParticipations(publisherName);
            if (history.length === 0) return null;

            const blocked = isBlocked(publisherName, history);
            if (!blocked) return null;

            const info = getBlockInfo(publisherName, history);
            if (!info) return `⚠️ ${publisherName} está em cooldown (participação recente).`;

            return `⚠️ ${publisherName} está em cooldown: última parte "${info.lastPartType}" na semana ${info.weekDisplay}. Faltam ${info.cooldownRemaining} semana(s).`;
        } catch (err) {
            console.warn('[UnifiedAction] Cooldown check failed (non-blocking):', err);
            return null; // Don't block if cooldown check itself fails
        }
    }
};

