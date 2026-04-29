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

            // 2a. HARD RULES (block all sources, even MANUAL/AGENT) — regras estruturais inegociáveis.
            //     Hoje: Necessidades Locais é exclusivo para Anciãos.
            //     Estas regras NÃO podem ser bypassadas por warn fallthrough.
            try {
                await this.validateHardRules(partId, publisherName, resolvedPublisher || undefined);
            } catch (hardError) {
                throw hardError; // Bloqueio absoluto, qualquer fonte
            }

            // 2b. Eligibility check (all sources)
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

            // 4. Same-week duplicate check (all sources)
            try {
                const partCtx = await unifiedActionContextService.buildEligibilityContext(partId, publisherName, resolvedPublisher || undefined).catch(() => null);
                if (partCtx?.weekId) {
                    const weekAssigned = await unifiedActionContextService.getWeekAssignedNames(
                        partCtx.weekId,
                        partId
                    );
                    const alreadyInWeek = weekAssigned.some(
                        name => name.trim().toLowerCase() === publisherName.trim().toLowerCase()
                    );
                    if (alreadyInWeek) {
                        const msg = `⛔ ${publisherName} já tem outra designação nesta semana.`;
                        // Decisão 2026-04-29: same-week duplicate é HARD-BLOCK para
                        // AGENT/BATCH/AUTO_FILL. Só MANUAL (dropdown da Apostila pelo
                        // Admin) recebe warn e segue. Razão: agente não deve sobrecarregar
                        // o mesmo publicador na semana sem intervenção humana explícita.
                        if (source !== 'MANUAL') {
                            throw new Error(msg);
                        }
                        warnings.push(msg);
                        console.warn(`[UnifiedAction] ⚠️ Same-week duplicate (${source}, MANUAL pass-through): ${msg}`);
                    }
                }
            } catch (dupeError) {
                if (source !== 'MANUAL') throw dupeError;
                // Non-blocking only for MANUAL if check itself fails
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
     * Regras estruturais que NUNCA podem ser bypassadas (nem por MANUAL/AGENT).
     * Diferente de validateEligibility, qualquer violação aqui é bloqueio absoluto.
     *
     * Regras atuais:
     *  - Necessidades Locais: somente Anciãos podem ser designados.
     */
    async validateHardRules(partId: string, publisherName: string, publisherOverride?: Awaited<ReturnType<typeof unifiedActionContextService.resolvePublisherByName>>): Promise<void> {
        const { publisher, context } = await unifiedActionContextService.buildEligibilityContext(partId, publisherName, publisherOverride || undefined);

        const modalidade = (context.modalidade || '').toString();
        const isNecessidadesLocais = modalidade === 'Necessidades Locais';

        if (isNecessidadesLocais) {
            const cond = (publisher.condition || '').toString();
            const isAnciao = cond === 'Ancião' || cond === 'Anciao';
            if (!isAnciao) {
                throw new Error(
                    `[Hard Rule] "Necessidades Locais" é exclusivo para Anciãos. ${publisher.name} (${cond || 'sem condição'}) não pode ser designado.`
                );
            }
        }
    },

    /**
     * Verifica cooldown: publicador está bloqueado por participação recente?
     * Retorna string de aviso se em cooldown, null se ok.
     *
     * IMPORTANTE: usa a data da PARTE sendo designada como referenceDate (não `new Date()`).
     * Isso garante que designações futuras já gravadas (ex.: bimestre pré-gerado) sejam
     * avaliadas pela mesma fronteira temporal simétrica do motor (commit cd147a9).
     */
    async checkCooldown(partId: string, publisherName: string): Promise<string | null> {
        try {
            // Buscar histórico do publicador diretamente do DB
            const history = await loadPublisherParticipations(publisherName);
            if (history.length === 0) return null;

            // Resolver data da parte sendo designada (fallback: hoje)
            let referenceDate: Date = new Date();
            try {
                const partCtx = await unifiedActionContextService.buildEligibilityContext(partId, publisherName).catch(() => null);
                const partDate = (partCtx?.context as any)?.date;
                if (partDate) {
                    const parsed = new Date(`${partDate}T12:00:00`);
                    if (!isNaN(parsed.getTime())) referenceDate = parsed;
                }
            } catch {
                // mantém referenceDate = hoje
            }

            const blocked = isBlocked(publisherName, history, referenceDate);
            if (!blocked) return null;

            const info = getBlockInfo(publisherName, history, referenceDate);
            if (!info) return `⚠️ ${publisherName} está em cooldown (participação recente).`;

            return `⚠️ ${publisherName} está em cooldown: última parte "${info.lastPartType}" na semana ${info.weekDisplay}. Faltam ${info.cooldownRemaining} semana(s).`;
        } catch (err) {
            console.warn('[UnifiedAction] Cooldown check failed (non-blocking):', err);
            return null; // Don't block if cooldown check itself fails
        }
    }
};

