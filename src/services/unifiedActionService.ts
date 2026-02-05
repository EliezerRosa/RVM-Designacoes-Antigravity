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
import { api } from './api';
import { checkEligibility } from './eligibilityService';
import { getModalidadeFromTipo } from '../constants/mappings';
import { EnumFuncao } from '../types';
import { supabase } from '../lib/supabase';

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
            // 1. Validação "Hard Compliance" para Agente (e outros se necessário)
            if (source === 'AGENT') {
                await this.validateEligibility(partId, publisherName);
            }

            // 2. Executar via WorkbookService (Camada de Dados)
            const updatedPart = await workbookService.proposePublisher(partId, publisherName);

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
    },

    // ========================================================================
    // HELPERS DE VALIDAÇÃO
    // ========================================================================

    async validateEligibility(partId: string, publisherName: string): Promise<void> {
        // 1. Buscar a parte (Raw DB fetch para performance e evitar dependências circulares complexas)
        const { data: partData, error } = await supabase
            .from('workbook_parts')
            .select('week_id, seq, tipo_parte, modalidade, date, section, funcao, titulo_parte')
            .eq('id', partId)
            .single();

        if (error || !partData) {
            throw new Error(`Parte não encontrada: ${partId}`);
        }

        // 2. Buscar Publicador
        const allPublishers = await api.loadPublishers();
        const publisher = allPublishers.find(p => p.name === publisherName);

        if (!publisher) {
            throw new Error(`Publicador não encontrado: "${publisherName}"`);
        }

        // 3. Preparar Contexto de Elegibilidade
        const tipoParte = partData.tipo_parte || '';
        const modalidade = partData.modalidade || getModalidadeFromTipo(tipoParte);
        const funcao = partData.funcao === 'Ajudante' ? EnumFuncao.AJUDANTE : EnumFuncao.TITULAR;
        const isOracaoInicial = tipoParte.toLowerCase().includes('inicial');
        const isPast = false; // Agente geralmente opera no presente/futuro

        // Lógica de Gênero do Titular (se for ajudante)
        let titularGender: 'brother' | 'sister' | undefined = undefined;

        if (funcao === EnumFuncao.AJUDANTE) {
            // FIX v9.0: Buscar titular usando fuzzy match no título (não confiar no SEQ)
            // 1. Buscar todas as partes titulares da semana
            const { data: weekTitulares } = await supabase
                .from('workbook_parts')
                .select('titulo_parte, resolved_publisher_name')
                .eq('week_id', partData.week_id)
                .eq('funcao', 'Titular');

            if (weekTitulares && weekTitulares.length > 0) {
                // 2. Normalizar título da parte Ajudante atual 
                // (Nota: partData pode não ter titulo_parte se não selecionamos acima, vamos garantir select)

                // Heurística de match
                // Precisamos do título da parte atual. Vamos garantir que o select inicial traga 'titulo_parte'
                const currentTitle = partData.titulo_parte || '';

                const baseTitle = currentTitle
                    .replace(/\s*-\s*Ajudante.*/i, '')
                    .replace(/\(Ajudante\)/i, '')
                    .trim()
                    .toLowerCase();

                // 3. Encontrar Titular correspondente (case insensitive contains)
                const titularMatch = weekTitulares.find(t =>
                    (t.titulo_parte || '').toLowerCase().includes(baseTitle)
                );

                if (titularMatch?.resolved_publisher_name) {
                    const titular = allPublishers.find(p => p.name.trim() === titularMatch.resolved_publisher_name.trim());
                    if (titular) titularGender = titular.gender;

                    console.log(`[UnifiedAction] Titular encontrado via fuzzy match: ${titularMatch.resolved_publisher_name} (${titularGender})`);
                } else {
                    console.warn(`[UnifiedAction] Titular NÃO encontrado para Ajudante: ${currentTitle} (Base: ${baseTitle})`);
                }
            }
        }

        // 4. Checar Regras da EligibilityService
        const result = checkEligibility(
            publisher,
            modalidade as any, // Cast seguro, validado pelo service
            funcao,
            {
                date: partData.date,
                isOracaoInicial,
                secao: partData.section,
                isPastWeek: isPast,
                titularGender
            }
        );

        if (!result.eligible) {
            throw new Error(`[Safety Block] Publicador Inelegível: ${result.reason}`);
        }
    }
};

