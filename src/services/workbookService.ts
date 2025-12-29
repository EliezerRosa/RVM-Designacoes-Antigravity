/**
 * Workbook Service - RVM Designações
 * CRUD para gerenciamento de partes extraídas de apostilas
 * Zero acoplamento com HistoryService
 */

import { supabase } from '../lib/supabase';
import { fetchAllRows } from './supabasePagination';
import type { WorkbookPart, WorkbookBatch, Publisher } from '../types';
import { WorkbookStatus, ParticipationType } from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ============================================================================
// Tipos auxiliares
// ============================================================================

export interface WorkbookExcelRow {
    id?: string;
    year?: number;
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
        batch_id: row.batch_id as string,
        year: row.year as number,
        weekId: row.week_id as string,
        weekDisplay: row.week_display as string,
        date: row.date as string,
        section: row.section as string,
        // 5 CAMPOS CANÔNICOS (obrigatórios)
        tipoParte: (row.tipo_parte as string) || '',
        modalidade: (row.modalidade as string) || 'Demonstração',
        tituloParte: (row.part_title as string) || '',
        descricaoParte: (row.descricao as string) || '',
        detalhesParte: (row.detalhes_parte as string) || (row.detalhes as string) || '',    // Sequência e função
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
        // Campos do ciclo de vida
        proposedPublisherId: row.proposed_publisher_id as string | undefined,
        proposedPublisherName: row.proposed_publisher_name as string | undefined,
        proposedAt: row.proposed_at as string | undefined,
        approvedById: row.approved_by_id as string | undefined,
        approvedAt: row.approved_at as string | undefined,
        rejectedReason: row.rejected_reason as string | undefined,
        completedAt: row.completed_at as string | undefined,
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
     * Cria ou reutiliza um batch e insere/atualiza as partes
     * Se já existir um batch com o mesmo week_range, reutiliza-o
     */
    async createBatch(fileName: string, parts: WorkbookExcelRow[]): Promise<WorkbookBatch> {
        // Calcular week range
        const weeks = [...new Set(parts.map(p => p.weekDisplay))].sort();
        const weekRange = weeks.length > 0
            ? `${weeks[0]} - ${weeks[weeks.length - 1]}`
            : 'Sem semanas';

        console.log('[workbookService] 🔍 Verificando batch existente para:', weekRange);

        // BUSCAR batch existente com mesmo week_range
        const { data: existingBatches } = await supabase
            .from('workbook_batches')
            .select('*')
            .eq('week_range', weekRange)
            .order('upload_date', { ascending: false })
            .limit(1);

        let batch: WorkbookBatch;

        if (existingBatches && existingBatches.length > 0) {
            // REUTILIZAR batch existente
            console.log('[workbookService] ♻️ Reutilizando batch existente:', existingBatches[0].id);
            batch = mapDbToWorkbookBatch(existingBatches[0]);

            // Atualizar metadados do batch
            await supabase
                .from('workbook_batches')
                .update({
                    file_name: fileName,
                    total_parts: parts.length,
                    is_active: true,
                })
                .eq('id', batch.id);

        } else {
            // CRIAR novo batch
            console.log('[workbookService] 🆕 Criando novo batch');
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
            batch = mapDbToWorkbookBatch(batchData);
        }

        // Preparar partes com batch_id correto
        const partsToInsert = parts.map(p => ({
            batch_id: batch.id,  // SEMPRE usa o batch correto
            year: p.year,
            week_id: p.weekId,
            week_display: p.weekDisplay,
            date: p.date,
            section: p.section,
            tipo_parte: p.tipoParte,
            part_title: p.tituloParte,
            descricao: p.descricaoParte,
            detalhes_parte: p.detalhesParte,
            modalidade: p.modalidade,
            seq: p.seq,
            funcao: p.funcao,
            duracao: p.duracao,
            hora_inicio: p.horaInicio,
            hora_fim: p.horaFim,
            raw_publisher_name: p.rawPublisherName,
            status: p.status || WorkbookStatus.PENDENTE,
        }));

        console.log('[workbookService] 📤 Enviando upsert para workbook_parts:', {
            batchId: batch.id,
            totalParts: partsToInsert.length,
            samplePart: {
                year: partsToInsert[0]?.year,
                week_id: partsToInsert[0]?.week_id,
                seq: partsToInsert[0]?.seq,
                modalidade: partsToInsert[0]?.modalidade,
                part_title: partsToInsert[0]?.part_title?.substring(0, 30),
                descricao: partsToInsert[0]?.descricao?.substring(0, 30),
            },
            onConflict: 'year,week_id,seq,funcao'
        });

        // UPSERT com diagnóstico usando o serviço de diagnóstico
        const { upsertWithDiagnostics } = await import('./supabaseDiagnostics');

        const uploadResult = await upsertWithDiagnostics(
            'workbook_parts',
            partsToInsert,
            {
                onConflict: 'year,week_id,seq,funcao',
                chunkSize: 500,
                onProgress: (progress) => {
                    console.log(`[workbookService] Progresso: ${progress.insertedRows}/${progress.totalRows} (${progress.completedChunks}/${progress.totalChunks} chunks)`);
                },
            }
        );

        if (!uploadResult.success) {
            const errorMessages = uploadResult.errors.map(e => `[${e.code}] ${e.message}`).join('; ');
            console.error('[workbookService] ❌ Upload parcialmente falhou:', {
                inserted: uploadResult.totalInserted,
                failed: uploadResult.totalFailed,
                errors: uploadResult.errors,
            });
            throw new Error(`Erro ao salvar partes: ${uploadResult.totalFailed} de ${partsToInsert.length} falharam. Erros: ${errorMessages}`);
        }

        console.log(`[workbookService] ✅ Upload concluído: ${uploadResult.totalInserted} partes em ${uploadResult.durationMs}ms`);

        // Atualizar contagens do batch
        await this.updateBatchCounts(batch.id);

        return batch;
    },

    /**
     * Atualiza as contagens de status de um batch
     */
    async updateBatchCounts(batchId: string): Promise<void> {
        const { data: parts } = await supabase
            .from('workbook_parts')
            .select('status')
            .eq('batch_id', batchId)
            .range(0, 9999);

        if (!parts) return;

        const pendenteCount = parts.filter(p => p.status === WorkbookStatus.PENDENTE).length;
        const propostaCount = parts.filter(p => p.status === WorkbookStatus.PROPOSTA).length;
        const designadaCount = parts.filter(p => p.status === WorkbookStatus.DESIGNADA).length;

        await supabase
            .from('workbook_batches')
            .update({
                total_parts: parts.length,
                draft_count: pendenteCount,
                refined_count: propostaCount,
                promoted_count: designadaCount,
            })
            .eq('id', batchId);
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
     * Usa paginação automática para superar o limite de 1000 rows do Supabase
     */
    async getPartsByBatch(batchId: string): Promise<WorkbookPart[]> {
        console.log('[workbookService] 🔍 getPartsByBatch chamado com batchId:', batchId);

        const rawData = await fetchAllRows<Record<string, unknown>>(
            'workbook_parts',
            (query) => query
                .eq('batch_id', batchId)
                .order('week_id', { ascending: true })
                .order('seq', { ascending: true })
        );

        console.log(`[workbookService] ✅ getPartsByBatch retornou ${rawData.length} partes (com paginação automática)`);
        return rawData.map(mapDbToWorkbookPart);
    },

    /**
 * Busca partes por status (para o ApprovalPanel)
 * Pode receber um status único ou array de status
 * @param status Status único ou array de status
 * @param minDate (Opcional) Data mínima para filtro (YYYY-MM-DD)
 */
    async getByStatus(status: WorkbookStatus | WorkbookStatus[], minDate?: string): Promise<WorkbookPart[]> {
        const statuses = Array.isArray(status) ? status : [status];

        const rawData = await fetchAllRows<Record<string, unknown>>(
            'workbook_parts',
            (query) => {
                let q = query
                    .in('status', statuses)
                    .order('date', { ascending: true })
                    .order('seq', { ascending: true });

                if (minDate) {
                    q = q.gte('date', minDate);
                }
                return q;
            }
        );

        return rawData.map(mapDbToWorkbookPart);
    },

    /**
     * Busca TODAS as partes (para filtro 'all' ou 'completed' histórico)
     * Útil para o ApprovalPanel listar histórico completo
     */
    async getAll(): Promise<WorkbookPart[]> {
        // Limitando para não trazer o banco todo de uma vez se crescer muito, 
        // mas por enquanto fetchAllRows resolve a paginação.
        // Se precisar de otimização futura, filtrar por intervalo de datas.
        const rawData = await fetchAllRows<Record<string, unknown>>(
            'workbook_parts',
            (query) => query
                .order('date', { ascending: false }) // Mais recentes primeiro para histórico
        );

        return rawData.map(mapDbToWorkbookPart);
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
        if (updates.modalidade !== undefined) dbUpdates.modalidade = updates.modalidade;
        if (updates.tituloParte !== undefined) dbUpdates.titulo_parte = updates.tituloParte;
        if (updates.descricaoParte !== undefined) dbUpdates.descricao_parte = updates.descricaoParte;
        if (updates.detalhesParte !== undefined) dbUpdates.detalhes_parte = updates.detalhesParte;
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

        // Se status não foi atualizado e há outras mudanças, manter PENDENTE
        if (updates.status === undefined && Object.keys(dbUpdates).length > 0) {
            // Não alterar status automaticamente na edição
        }

        const { data, error } = await supabase
            .from('workbook_parts')
            .update(dbUpdates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(`Erro ao atualizar parte: ${error.message}`);

        const updatedPart = mapDbToWorkbookPart(data);

        // TRIGGER DE SINCRONIZAÇÃO DO PRESIDENTE
        if (updatedPart.tipoParte === 'Presidente' && (updates.resolvedPublisherId || updates.proposedPublisherId)) {
            const pubId = updates.resolvedPublisherId || updates.proposedPublisherId || '';
            const pubName = updates.resolvedPublisherName || updates.proposedPublisherName || '';
            if (pubId) {
                // Executar em background (sem await para não travar a UI)
                this.syncChairmanAssignments(updatedPart.weekId, pubId, pubName, updatedPart.status);
            }
        }

        return updatedPart;
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
    // CICLO DE VIDA DE DESIGNAÇÃO
    // ========================================================================

    /**
     * Propõe um publicador para uma parte (PENDENTE -> PROPOSTA)
     */
    async proposePublisher(partId: string, publisherId: string, publisherName: string): Promise<WorkbookPart> {
        const { data, error } = await supabase
            .from('workbook_parts')
            .update({
                status: WorkbookStatus.PROPOSTA,
                proposed_publisher_id: publisherId,
                proposed_publisher_name: publisherName,
                proposed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', partId)
            .eq('status', WorkbookStatus.PENDENTE)
            .select()
            .single();

        if (error) throw new Error(`Erro ao propor publicador: ${error.message}`);
        const updatedPart = mapDbToWorkbookPart(data);

        // TRIGGER DE SINCRONIZAÇÃO DO PRESIDENTE
        if (updatedPart.tipoParte === 'Presidente') {
            this.syncChairmanAssignments(updatedPart.weekId, publisherId, publisherName, WorkbookStatus.PROPOSTA);
        }

        return updatedPart;
    },

    /**
     * Aprova uma proposta de designação (PROPOSTA -> APROVADA)
     */
    async approveProposal(partId: string, elderId: string): Promise<WorkbookPart> {
        const { data, error } = await supabase
            .from('workbook_parts')
            .update({
                status: WorkbookStatus.APROVADA,
                approved_by_id: elderId,
                approved_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', partId)
            .eq('status', WorkbookStatus.PROPOSTA)
            .select()
            .single();

        if (error) throw new Error(`Erro ao aprovar proposta: ${error.message}`);
        return mapDbToWorkbookPart(data);
    },

    /**
     * Rejeita uma proposta (PROPOSTA -> PENDENTE)
     */
    async rejectProposal(partId: string, reason: string): Promise<WorkbookPart> {
        const { data, error } = await supabase
            .from('workbook_parts')
            .update({
                status: WorkbookStatus.PENDENTE,
                rejected_reason: reason,
                proposed_publisher_id: null,
                proposed_publisher_name: null,
                proposed_at: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', partId)
            .eq('status', WorkbookStatus.PROPOSTA)
            .select()
            .single();

        if (error) throw new Error(`Erro ao rejeitar proposta: ${error.message}`);
        return mapDbToWorkbookPart(data);
    },

    /**
     * Confirma uma designação (APROVADA -> DESIGNADA)
     * Também atualiza o resolved_publisher_id/name com os valores propostos
     */
    async confirmDesignation(partId: string): Promise<WorkbookPart> {
        // Primeiro, buscar a parte para pegar os dados propostos
        const { data: partData } = await supabase
            .from('workbook_parts')
            .select('proposed_publisher_id, proposed_publisher_name')
            .eq('id', partId)
            .single();

        const { data, error } = await supabase
            .from('workbook_parts')
            .update({
                status: WorkbookStatus.DESIGNADA,
                resolved_publisher_id: partData?.proposed_publisher_id,
                resolved_publisher_name: partData?.proposed_publisher_name,
                updated_at: new Date().toISOString(),
            })
            .eq('id', partId)
            .eq('status', WorkbookStatus.APROVADA)
            .select()
            .single();

        if (error) throw new Error(`Erro ao confirmar designação: ${error.message}`);
        return mapDbToWorkbookPart(data);
    },

    // ========================================================================
    // PROMOÇÃO E ROLLBACK (LEGADO)
    // ========================================================================

    /**
     * Promove partes do batch para Participations
     */
    async promoteToParticipations(batchId: string): Promise<string[]> {
        // Buscar partes do batch (apenas PENDENTE ou PROPOSTA)
        const { data: parts, error: partsError } = await supabase
            .from('workbook_parts')
            .select('*')
            .eq('batch_id', batchId)
            .in('status', [WorkbookStatus.PENDENTE, WorkbookStatus.PROPOSTA])
            .range(0, 9999);

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
            titulo_parte: part.titulo_parte,
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

        // Atualizar status das partes para DESIGNADA
        const { error: updateError } = await supabase
            .from('workbook_parts')
            .update({ status: WorkbookStatus.DESIGNADA })
            .eq('batch_id', batchId)
            .in('status', [WorkbookStatus.PENDENTE, WorkbookStatus.PROPOSTA]);

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

        // Reverter status das partes para PENDENTE
        const { error: updateError } = await supabase
            .from('workbook_parts')
            .update({ status: WorkbookStatus.PENDENTE })
            .eq('batch_id', batchId)
            .eq('status', WorkbookStatus.DESIGNADA);

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
    // HISTÓRIA DE PARTICIPAÇÕES (COMPLETED)
    // ========================================================================

    /**
     * Marca partes como CONCLUIDA (executadas na reunião)
     * Essas partes serão usadas como histórico para o motor de elegibilidade
     */
    async markAsCompleted(partIds: string[]): Promise<void> {
        if (partIds.length === 0) return;

        const { error } = await supabase
            .from('workbook_parts')
            .update({
                status: WorkbookStatus.CONCLUIDA,
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .in('id', partIds);

        if (error) {
            throw new Error(`Erro ao marcar como concluído: ${error.message}`);
        }

        console.log(`[workbookService] ${partIds.length} partes marcadas como CONCLUIDA`);
    },

    /**
     * Marca todas as partes de semanas passadas como CONCLUIDA automaticamente
     * Útil para processamento em lote
     */
    async markPastWeeksAsCompleted(): Promise<number> {
        const today = new Date().toISOString().split('T')[0];

        // Buscar partes de semanas passadas que ainda não estão CONCLUIDA
        const { data: pastParts, error: fetchError } = await supabase
            .from('workbook_parts')
            .select('id')
            .lt('date', today)
            .in('status', [WorkbookStatus.DESIGNADA, WorkbookStatus.APROVADA])
            .not('resolved_publisher_id', 'is', null); // Só marcar partes com publicador atribuído

        if (fetchError) {
            throw new Error(`Erro ao buscar partes passadas: ${fetchError.message}`);
        }

        if (!pastParts || pastParts.length === 0) {
            console.log('[workbookService] Nenhuma parte pendente para marcar como CONCLUIDA');
            return 0;
        }

        const partIds = pastParts.map(p => p.id);
        await this.markAsCompleted(partIds);

        console.log(`[workbookService] ${partIds.length} partes de semanas passadas marcadas como CONCLUIDA`);
        return partIds.length;
    },

    /**
     * Carrega partes CONCLUIDA para uso como histórico
     */
    async getCompletedParts(): Promise<WorkbookPart[]> {
        const { data, error } = await supabase
            .from('workbook_parts')
            .select('*')
            .in('status', [WorkbookStatus.CONCLUIDA, WorkbookStatus.DESIGNADA])
            .not('resolved_publisher_id', 'is', null)
            .order('date', { ascending: false })
            .range(0, 9999);

        if (error) {
            console.error('[workbookService] Erro ao carregar partes concluídas:', error);
            return [];
        }

        return (data || []).map(mapDbToWorkbookPart);
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

    /**
     * Sincroniza partes do Presidente (Comentários Iniciais/Finais)
     * Deve ser chamado após atualizar a parte principal 'Presidente'
     */
    async syncChairmanAssignments(weekId: string, publisherId: string, publisherName: string, status: WorkbookStatus): Promise<void> {
        // Tipos de parte que devem ser sincronizados
        const TARGET_TYPES = ['Comentários Iniciais', 'Comentários Finais', 'Comentarios Iniciais', 'Comentarios Finais'];

        // Buscar partes alvo na mesma semana
        const { data: partsToUpdate, error: fetchError } = await supabase
            .from('workbook_parts')
            .select('id, tipo_parte')
            .eq('week_id', weekId)
            .in('tipo_parte', TARGET_TYPES);

        if (fetchError || !partsToUpdate || partsToUpdate.length === 0) return;

        // Preparar update
        const updates: any = {
            updated_at: new Date().toISOString()
        };

        // Se o status da parte principal for PROPOSTA ou acima, propagamos.
        // Se for DESIGNADA/CONCLUIDA, setamos o resolved. Se PROPOSTA, o proposed.
        if (status === WorkbookStatus.DESIGNADA || status === WorkbookStatus.CONCLUIDA || status === WorkbookStatus.APROVADA) {
            updates.resolved_publisher_id = publisherId;
            updates.resolved_publisher_name = publisherName;
            // Também setamos proposed pra manter consistência visual se necessário, ou limpamos?
            // Melhor setar proposed também pra garantir "fallbacks" de UI
            updates.proposed_publisher_id = publisherId;
            updates.proposed_publisher_name = publisherName;
            updates.status = status;
        } else if (status === WorkbookStatus.PROPOSTA) {
            updates.proposed_publisher_id = publisherId;
            updates.proposed_publisher_name = publisherName;
            updates.status = WorkbookStatus.PROPOSTA;
        }

        const ids = partsToUpdate.map(p => p.id);

        console.log(`[workbookService] 🔄 Sincronizando Presidente para ${ids.length} partes derivadas (${weekId})`);

        const { error: updateError } = await supabase
            .from('workbook_parts')
            .update(updates)
            .in('id', ids);

        if (updateError) {
            console.error('[workbookService] Erro ao sincronizar presidente:', updateError);
        }
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
