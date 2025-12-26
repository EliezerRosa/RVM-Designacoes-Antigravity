/**
 * Workbook Service - RVM Designações
 * CRUD para gerenciamento de partes extraídas de apostilas
 * Zero acoplamento com HistoryService
 */

import { supabase } from '../lib/supabase';
import type { WorkbookPart, WorkbookBatch, Publisher } from '../types';
import { WorkbookStatus, ParticipationType } from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ============================================================================
// Tipos auxiliares
// ============================================================================

export interface WorkbookExcelRow {
    id?: string;
    weekId: string;
    weekDisplay: string;
    date: string;
    section: string;
    // Unified nomenclature (5 atributos)
    tipoParte: string;
    modalidade?: string;
    tituloParte?: string;
    descricaoParte?: string;
    detalhesParte?: string;
    // Legacy aliases
    partTitle?: string;
    descricao?: string;
    seq: number;
    funcao: 'Titular' | 'Ajudante';
    duracao: string;
    horaInicio: string;
    horaFim: string;
    rawPublisherName: string;
    status?: string;
}

// Converter snake_case do banco para camelCase do TS
function mapDbToWorkbookPart(row: Record<string, unknown>): WorkbookPart {
    return {
        id: row.id as string,
        batchId: row.batch_id as string,
        weekId: row.week_id as string,
        weekDisplay: row.week_display as string,
        date: row.date as string,
        section: row.section as string,
        // Unified nomenclature (5 atributos)
        tipoParte: row.tipo_parte as string,
        modalidade: (row.modalidade as string) || undefined,
        tituloParte: (row.titulo_parte as string) || (row.part_title as string) || undefined,
        descricaoParte: (row.descricao_parte as string) || (row.descricao as string) || undefined,
        detalhesParte: (row.detalhes_parte as string) || undefined,
        // Legacy aliases (for backward compatibility)
        partTitle: (row.part_title as string) || (row.titulo_parte as string) || '',
        descricao: (row.descricao as string) || (row.descricao_parte as string) || '',
        seq: row.seq as number,
        funcao: row.funcao as 'Titular' | 'Ajudante',
        duracao: (row.duracao as string) || '',
        horaInicio: (row.hora_inicio as string) || '',
        horaFim: (row.hora_fim as string) || '',
        rawPublisherName: (row.raw_publisher_name as string) || '',
        resolvedPublisherId: row.resolved_publisher_id as string | undefined,
        resolvedPublisherName: row.resolved_publisher_name as string | undefined,
        matchConfidence: row.match_confidence as number | undefined,
        status: row.status as WorkbookStatus,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string | undefined,
    };
}

function mapDbToWorkbookBatch(row: Record<string, unknown>): WorkbookBatch {
    return {
        id: row.id as string,
        fileName: row.file_name as string,
        uploadDate: row.upload_date as string,
        totalParts: row.total_parts as number,
        draftCount: row.draft_count as number,
        refinedCount: row.refined_count as number,
        promotedCount: row.promoted_count as number,
        weekRange: (row.week_range as string) || '',
        isActive: row.is_active as boolean,
        promotedAt: row.promoted_at as string | undefined,
        promotedToParticipationIds: row.promoted_to_participation_ids as string[] | undefined,
    };
}

// ============================================================================
// Service
// ============================================================================

export const workbookService = {
    // ========================================================================
    // BATCHES
    // ========================================================================

    /**
     * Cria um novo batch e insere as partes
     */
    async createBatch(fileName: string, parts: WorkbookExcelRow[]): Promise<WorkbookBatch> {
        // Calcular week range
        const weeks = [...new Set(parts.map(p => p.weekDisplay))].sort();
        const weekRange = weeks.length > 0
            ? `${weeks[0]} - ${weeks[weeks.length - 1]}`
            : 'Sem semanas';

        // Inserir batch
        const { data: batchData, error: batchError } = await supabase
            .from('workbook_batches')
            .insert({
                file_name: fileName,
                week_range: weekRange,
                total_parts: parts.length,
                draft_count: parts.length,
                refined_count: 0,
                promoted_count: 0,
                is_active: true,
            })
            .select()
            .single();

        if (batchError) throw new Error(`Erro ao criar batch: ${batchError.message}`);

        const batch = mapDbToWorkbookBatch(batchData);

        // Inserir partes
        const partsToInsert = parts.map(p => ({
            batch_id: batch.id,
            week_id: p.weekId,
            week_display: p.weekDisplay,
            date: p.date,
            section: p.section,
            tipo_parte: p.tipoParte,
            part_title: p.partTitle,
            descricao: p.descricao || '',
            seq: p.seq,
            funcao: p.funcao || 'Titular',
            duracao: p.duracao || '',
            hora_inicio: p.horaInicio || '',
            hora_fim: p.horaFim || '',
            raw_publisher_name: p.rawPublisherName || '',
            status: WorkbookStatus.DRAFT,
        }));

        const { error: partsError } = await supabase
            .from('workbook_parts')
            .insert(partsToInsert);

        if (partsError) throw new Error(`Erro ao inserir partes: ${partsError.message}`);

        return batch;
    },

    /**
     * Lista todos os batches ordenados por data
     */
    async getBatches(): Promise<WorkbookBatch[]> {
        const { data, error } = await supabase
            .from('workbook_batches')
            .select('*')
            .order('upload_date', { ascending: false });

        if (error) throw new Error(`Erro ao carregar batches: ${error.message}`);
        return (data || []).map(mapDbToWorkbookBatch);
    },

    /**
     * Obtém um batch por ID
     */
    async getBatchById(id: string): Promise<WorkbookBatch | null> {
        const { data, error } = await supabase
            .from('workbook_batches')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // Not found
            throw new Error(`Erro ao carregar batch: ${error.message}`);
        }
        return data ? mapDbToWorkbookBatch(data) : null;
    },

    /**
     * Deleta um batch e todas as suas partes (cascade)
     */
    async deleteBatch(id: string): Promise<void> {
        const { error } = await supabase
            .from('workbook_batches')
            .delete()
            .eq('id', id);

        if (error) throw new Error(`Erro ao deletar batch: ${error.message}`);
    },

    // ========================================================================
    // PARTS
    // ========================================================================

    /**
     * Lista todas as partes de um batch
     */
    async getPartsByBatch(batchId: string): Promise<WorkbookPart[]> {
        const { data, error } = await supabase
            .from('workbook_parts')
            .select('*')
            .eq('batch_id', batchId)
            .order('week_id', { ascending: true })
            .order('seq', { ascending: true });

        if (error) throw new Error(`Erro ao carregar partes: ${error.message}`);
        return (data || []).map(mapDbToWorkbookPart);
    },

    /**
     * Atualiza uma parte
     */
    async updatePart(id: string, updates: Partial<WorkbookPart>): Promise<WorkbookPart> {
        // Converter camelCase para snake_case
        const dbUpdates: Record<string, unknown> = {};

        if (updates.weekId !== undefined) dbUpdates.week_id = updates.weekId;
        if (updates.weekDisplay !== undefined) dbUpdates.week_display = updates.weekDisplay;
        if (updates.date !== undefined) dbUpdates.date = updates.date;
        if (updates.section !== undefined) dbUpdates.section = updates.section;
        if (updates.tipoParte !== undefined) dbUpdates.tipo_parte = updates.tipoParte;
        if (updates.partTitle !== undefined) dbUpdates.part_title = updates.partTitle;
        if (updates.descricao !== undefined) dbUpdates.descricao = updates.descricao;
        if (updates.seq !== undefined) dbUpdates.seq = updates.seq;
        if (updates.funcao !== undefined) dbUpdates.funcao = updates.funcao;
        if (updates.duracao !== undefined) dbUpdates.duracao = updates.duracao;
        if (updates.horaInicio !== undefined) dbUpdates.hora_inicio = updates.horaInicio;
        if (updates.horaFim !== undefined) dbUpdates.hora_fim = updates.horaFim;
        if (updates.rawPublisherName !== undefined) dbUpdates.raw_publisher_name = updates.rawPublisherName;
        if (updates.resolvedPublisherId !== undefined) dbUpdates.resolved_publisher_id = updates.resolvedPublisherId;
        if (updates.resolvedPublisherName !== undefined) dbUpdates.resolved_publisher_name = updates.resolvedPublisherName;
        if (updates.matchConfidence !== undefined) dbUpdates.match_confidence = updates.matchConfidence;
        if (updates.status !== undefined) dbUpdates.status = updates.status;

        // Se status não foi atualizado e há outras mudanças, mudar para REFINED
        if (updates.status === undefined && Object.keys(dbUpdates).length > 0) {
            dbUpdates.status = WorkbookStatus.REFINED;
        }

        const { data, error } = await supabase
            .from('workbook_parts')
            .update(dbUpdates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(`Erro ao atualizar parte: ${error.message}`);
        return mapDbToWorkbookPart(data);
    },

    /**
     * Deleta uma parte
     */
    async deletePart(id: string): Promise<void> {
        const { error } = await supabase
            .from('workbook_parts')
            .delete()
            .eq('id', id);

        if (error) throw new Error(`Erro ao deletar parte: ${error.message}`);
    },

    /**
     * Atualiza status de múltiplas partes
     */
    async bulkUpdateStatus(ids: string[], status: WorkbookStatus): Promise<void> {
        const { error } = await supabase
            .from('workbook_parts')
            .update({ status })
            .in('id', ids);

        if (error) throw new Error(`Erro ao atualizar status: ${error.message}`);
    },

    // ========================================================================
    // PROMOÇÃO E ROLLBACK
    // ========================================================================

    /**
     * Promove partes do batch para Participations
     */
    async promoteToParticipations(batchId: string): Promise<string[]> {
        // Buscar partes do batch (apenas DRAFT ou REFINED)
        const { data: parts, error: partsError } = await supabase
            .from('workbook_parts')
            .select('*')
            .eq('batch_id', batchId)
            .in('status', [WorkbookStatus.DRAFT, WorkbookStatus.REFINED]);

        if (partsError) throw new Error(`Erro ao buscar partes: ${partsError.message}`);
        if (!parts || parts.length === 0) {
            throw new Error('Nenhuma parte para promover');
        }

        // Converter para Participations
        const participations = parts.map(part => ({
            id: crypto.randomUUID(),
            publisher_name: part.resolved_publisher_name || part.raw_publisher_name || '',
            week: part.week_display,
            date: part.date,
            part_title: part.part_title,
            type: mapTipoParteToParticipationType(part.tipo_parte),
            duration: parseInt(part.duracao) || null,
            source: 'import',
            created_at: new Date().toISOString(),
        }));

        // Inserir Participations
        const { error: insertError } = await supabase
            .from('participations')
            .insert(participations);

        if (insertError) throw new Error(`Erro ao inserir participações: ${insertError.message}`);

        const participationIds = participations.map(p => p.id);

        // Atualizar status das partes para PROMOTED
        const { error: updateError } = await supabase
            .from('workbook_parts')
            .update({ status: WorkbookStatus.PROMOTED })
            .eq('batch_id', batchId)
            .in('status', [WorkbookStatus.DRAFT, WorkbookStatus.REFINED]);

        if (updateError) throw new Error(`Erro ao atualizar status: ${updateError.message}`);

        // Atualizar batch com IDs das participations geradas
        const { error: batchError } = await supabase
            .from('workbook_batches')
            .update({
                promoted_at: new Date().toISOString(),
                promoted_to_participation_ids: participationIds,
                is_active: false,
            })
            .eq('id', batchId);

        if (batchError) throw new Error(`Erro ao atualizar batch: ${batchError.message}`);

        return participationIds;
    },

    /**
     * Reverte uma promoção (deleta participations geradas)
     */
    async rollbackPromotion(batchId: string): Promise<void> {
        // Buscar batch
        const batch = await this.getBatchById(batchId);
        if (!batch) throw new Error('Batch não encontrado');
        if (!batch.promotedToParticipationIds || batch.promotedToParticipationIds.length === 0) {
            throw new Error('Este batch não possui participations para reverter');
        }

        // Deletar participations
        const { error: deleteError } = await supabase
            .from('participations')
            .delete()
            .in('id', batch.promotedToParticipationIds);

        if (deleteError) throw new Error(`Erro ao deletar participações: ${deleteError.message}`);

        // Reverter status das partes para REFINED
        const { error: updateError } = await supabase
            .from('workbook_parts')
            .update({ status: WorkbookStatus.REFINED })
            .eq('batch_id', batchId)
            .eq('status', WorkbookStatus.PROMOTED);

        if (updateError) throw new Error(`Erro ao reverter status: ${updateError.message}`);

        // Atualizar batch
        const { error: batchError } = await supabase
            .from('workbook_batches')
            .update({
                promoted_at: null,
                promoted_to_participation_ids: null,
                is_active: true,
            })
            .eq('id', batchId);

        if (batchError) throw new Error(`Erro ao atualizar batch: ${batchError.message}`);
    },

    // ========================================================================
    // REALTIME
    // ========================================================================

    /**
     * Inscreve-se para mudanças em tempo real nas partes de um batch
     */
    subscribeToChanges(
        batchId: string,
        callback: (payload: { eventType: string; new?: WorkbookPart; old?: WorkbookPart }) => void
    ): RealtimeChannel {
        const channel = supabase
            .channel(`workbook_parts:${batchId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'workbook_parts',
                    filter: `batch_id=eq.${batchId}`,
                },
                (payload) => {
                    callback({
                        eventType: payload.eventType,
                        new: payload.new ? mapDbToWorkbookPart(payload.new as Record<string, unknown>) : undefined,
                        old: payload.old ? mapDbToWorkbookPart(payload.old as Record<string, unknown>) : undefined,
                    });
                }
            )
            .subscribe();

        return channel;
    },

    /**
     * Cancela inscrição de realtime
     */
    unsubscribe(channel: RealtimeChannel): void {
        supabase.removeChannel(channel);
    },

    // ========================================================================
    // FUZZY MATCHING
    // ========================================================================

    /**
     * Aplica fuzzy matching para resolver nomes de publicadores
     */
    async applyFuzzyMatching(batchId: string, publishers: Publisher[]): Promise<number> {
        const parts = await this.getPartsByBatch(batchId);
        let matchedCount = 0;

        for (const part of parts) {
            if (!part.rawPublisherName || part.resolvedPublisherId) continue;

            const match = findBestMatch(part.rawPublisherName, publishers);
            if (match.publisher && match.confidence >= 70) {
                await this.updatePart(part.id, {
                    resolvedPublisherId: match.publisher.id,
                    resolvedPublisherName: match.publisher.name,
                    matchConfidence: match.confidence,
                });
                matchedCount++;
            }
        }

        return matchedCount;
    },
};

// ============================================================================
// Funções auxiliares
// ============================================================================

function mapTipoParteToParticipationType(tipoParte: string): string {
    const map: Record<string, string> = {
        'Presidente': ParticipationType.PRESIDENTE,
        'Oração Inicial': ParticipationType.ORACAO_INICIAL,
        'Oração Final': ParticipationType.ORACAO_FINAL,
        'Dirigente EBC': ParticipationType.DIRIGENTE,
        'Leitor EBC': ParticipationType.LEITOR,
        'Cântico': ParticipationType.CANTICO,
        'Comentários Finais': ParticipationType.COMENTARIOS_FINAIS,
    };

    // Verificar seções
    if (tipoParte.includes('Tesouros')) return ParticipationType.TESOUROS;
    if (tipoParte.includes('Ministério')) return ParticipationType.MINISTERIO;
    if (tipoParte.includes('Vida')) return ParticipationType.VIDA_CRISTA;

    return map[tipoParte] || ParticipationType.MINISTERIO;
}

/**
 * Fuzzy matching simples usando distância de Levenshtein
 */
function findBestMatch(
    rawName: string,
    publishers: Publisher[]
): { publisher: Publisher | null; confidence: number } {
    if (!rawName || publishers.length === 0) {
        return { publisher: null, confidence: 0 };
    }

    const normalizedInput = rawName.toLowerCase().trim();
    let bestMatch: Publisher | null = null;
    let bestScore = 0;

    for (const pub of publishers) {
        // Verificar nome principal
        let score = similarity(normalizedInput, pub.name.toLowerCase());

        // Verificar aliases
        for (const alias of pub.aliases || []) {
            const aliasScore = similarity(normalizedInput, alias.toLowerCase());
            if (aliasScore > score) score = aliasScore;
        }

        if (score > bestScore) {
            bestScore = score;
            bestMatch = pub;
        }
    }

    return {
        publisher: bestMatch,
        confidence: Math.round(bestScore * 100),
    };
}

/**
 * Calcula similaridade entre duas strings (0 a 1)
 */
function similarity(s1: string, s2: string): number {
    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    // Levenshtein distance
    const matrix: number[][] = [];
    for (let i = 0; i <= s1.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= s2.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= s1.length; i++) {
        for (let j = 1; j <= s2.length; j++) {
            if (s1[i - 1] === s2[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    const distance = matrix[s1.length][s2.length];
    const maxLen = Math.max(s1.length, s2.length);
    return 1 - distance / maxLen;
}
