/**
 * Workbook Service - RVM Designações
 * CRUD para gerenciamento de partes extraídas de apostilas
 * Zero acoplamento com HistoryService
 */

import { supabase } from '../lib/supabase';
import { fetchAllRows } from './supabasePagination';
import type { WorkbookPart, WorkbookBatch, Publisher } from '../types';
import { WorkbookStatus } from '../types';
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
        // 5 CAMPOS CANÔNICOS
        tipoParte: (row.tipo_parte as string) || '',
        modalidade: (row.modalidade as string) || 'Demonstração',
        tituloParte: (row.part_title as string) || '',
        descricaoParte: (row.descricao as string) || '',
        detalhesParte: (row.detalhes_parte as string) || (row.detalhes as string) || '',
        // Sequência e função
        seq: row.seq as number,
        funcao: row.funcao as 'Titular' | 'Ajudante',
        duracao: (row.duracao as string) || '',
        horaInicio: (row.hora_inicio as string) || '',
        horaFim: (row.hora_fim as string) || '',
        rawPublisherName: (row.raw_publisher_name as string) || '',
        // Publicador designado (ÚNICO campo)
        resolvedPublisherName: (row.resolved_publisher_name as string) || undefined,
        // Status e metadados
        status: row.status as WorkbookStatus,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string | undefined,
        // Campos de aprovação
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

// Helpers de Tempo (Privados)
function parseTimeToMinutes(time: string): number {
    if (!time) return 0;
    const [hours, minutes] = time.split(':').map(Number);
    return (hours * 60) + (minutes || 0);
}

function minutesToTime(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    // Tratamento AM/PM simples se necessário, mas aqui usaremos 24h
    // Ajustar para formato brasileiro (HH:mm)
    let h = hours % 24;
    return `${h.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// Formatar para 12h com AM/PM para UI se necessário, mas o banco guarda string simples.
// Vamos manter o formato simples HH:mm para consistência com o input type="time"


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
                .maybeSingle();

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
            .maybeSingle();

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
     * Retorna estatísticas de designações futuras (semana atual em diante)
     * Contagem agrupada por status
     * Usa fetchAllRows para garantir que TODAS as partes sejam contabilizadas
     * IMPORTANTE: Usa o início da semana atual (segunda-feira) como referência,
     * pois as partes têm a data da segunda-feira no campo 'date'
     */
    async getFutureStats(): Promise<Record<string, number>> {
        // Calcular a segunda-feira da semana atual (Lógica idêntica ao Frontend)
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Dom, 1=Seg, ..., 6=Sab
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Ajustar para segunda
        const monday = new Date(now);
        monday.setDate(now.getDate() + diffToMonday);
        monday.setHours(0, 0, 0, 0);

        // Formato YYYY-MM-DD local para comparar com string do banco
        // O banco guarda YYYY-MM-DD. Precisamos garantir que mondayStr seja a data correta.
        // toISOString() converte para UTC, o que pode mudar o dia.
        // Melhor construir YYYY-MM-DD manualmente com valores locais.
        const year = monday.getFullYear();
        const month = String(monday.getMonth() + 1).padStart(2, '0');
        const day = String(monday.getDate()).padStart(2, '0');
        const mondayStr = `${year}-${month}-${day}`;

        // Usar fetchAllRows para superar o limite de 1000 rows
        const data = await fetchAllRows<{ status: string }>(
            'workbook_parts',
            (query) => query
                .select('status')
                .gte('date', mondayStr)
        );

        const stats: Record<string, number> = {};

        data.forEach(p => {
            const s = p.status || 'UNKNOWN';
            stats[s] = (stats[s] || 0) + 1;
        });

        return stats;
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
                .order('seq', { ascending: true })   // Sequência correta dentro da reunião
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
        if (updates.tituloParte !== undefined) dbUpdates.part_title = updates.tituloParte;
        if (updates.descricaoParte !== undefined) dbUpdates.descricao = updates.descricaoParte;
        if (updates.detalhesParte !== undefined) dbUpdates.detalhes = updates.detalhesParte;
        if (updates.seq !== undefined) dbUpdates.seq = updates.seq;
        if (updates.funcao !== undefined) dbUpdates.funcao = updates.funcao;
        if (updates.duracao !== undefined) dbUpdates.duracao = updates.duracao;
        if (updates.horaInicio !== undefined) dbUpdates.hora_inicio = updates.horaInicio;
        if (updates.horaFim !== undefined) dbUpdates.hora_fim = updates.horaFim;
        if (updates.rawPublisherName !== undefined) dbUpdates.raw_publisher_name = updates.rawPublisherName;
        // SIMPLIFICADO: Apenas resolved_publisher_name
        if (updates.resolvedPublisherName !== undefined) dbUpdates.resolved_publisher_name = updates.resolvedPublisherName;
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
            .maybeSingle();

        if (error) throw new Error(`Erro ao atualizar parte: ${error.message}`);

        const updatedPart = mapDbToWorkbookPart(data);

        // TRIGGER DE SINCRONIZAÇÃO DO PRESIDENTE
        if (updatedPart.tipoParte === 'Presidente' && updates.resolvedPublisherName) {
            const pubName = updates.resolvedPublisherName || '';
            if (pubName) {
                // Executar em background (sem await para não travar a UI)
                this.syncChairmanAssignments(updatedPart.weekId, '', pubName, updatedPart.status);
            }
        }

        // TRIGGER DE RECÁLCULO DE HORÁRIOS
        // Se mudou a duração, ou horaInicio (manual), ou ordem (seq), devemos recalcular a semana toda
        // Para simplificar, recalculamos SEMPRE que houver update (exceto se for apenas status)
        // Mas cuidado com loops infinitos. O recalculate vai fazer updates.
        // Vamos checar se updates contém campos de tempo/ordem.
        const timeFields = ['duracao', 'horaInicio', 'seq', 'tituloParte', 'tipoParte'];
        const shouldRecalculate = Object.keys(updates).some(k => timeFields.includes(k));

        if (shouldRecalculate) {
            // Executar async para não bloquear o retorno da UI
            console.log('[workbookService] ⏱️ Iniciando recálculo de horários para semana:', updatedPart.weekId);
            this.recalculateWeekTimings(updatedPart.weekId).catch(err =>
                console.error('[workbookService] ❌ Erro no recálculo de horários:', err)
            );
        }

        return updatedPart;
    },

    /**
     * Recalcula os horários de todas as partes de uma semana
     * Base: 19:30 (Reunião de Meio de Semana)
     */
    async recalculateWeekTimings(weekId: string): Promise<void> {
        // 1. Buscar todas as partes da semana
        // Precisamos buscar por week_id. Não temos método direto público, vamos fazer query aqui.

        const { data: weekParts, error } = await supabase
            .from('workbook_parts')
            .select('*')
            .eq('week_id', weekId)
            .order('seq', { ascending: true }); // Importante: ordem sequencial

        if (error || !weekParts) {
            console.error('[workbookService] Erro ao buscar partes para recálculo:', error);
            return;
        }

        // 2. Definir início
        let currentMinutes = parseTimeToMinutes('19:30');

        // 3. Iterar e atualizar
        // Filtrar apenas Titulares para não contar tempo duplicado de ajudantes (mesmo seq)
        // Se seq for igual, é mesma parte.
        // Agrupar por seq.
        const uniqueParts = new Map<number, any>();
        weekParts.forEach(p => {
            // Se já tem essa seq, mantemos o primeiro (geralmente Titular) para pegar duração
            if (!uniqueParts.has(p.seq)) {
                uniqueParts.set(p.seq, p);
            }
        });

        // Ordenar chaves
        const sortedSeqs = Array.from(uniqueParts.keys()).sort((a, b) => a - b);

        for (const seq of sortedSeqs) {
            const part = uniqueParts.get(seq);

            // Duração: Tentar numérico, ou extrair de string "10 min"
            let duration = 0;
            if (part /* part existe */) {
                // Parse duração
                let dStr = String(part.duracao || '').toLowerCase();
                // Remover ' min', 's', etc
                dStr = dStr.replace(/[^0-9]/g, '');
                duration = parseInt(dStr, 10) || 0;
            }

            // Calcular horários
            const startStr = minutesToTime(currentMinutes);
            currentMinutes += duration;
            const endStr = minutesToTime(currentMinutes);

            // Atualizar no banco TODAS as partes com esse seq e weekId
            // Precisamos atualizar hora_inicio e hora_fim
            // Evitar update se não mudou para economizar recursos? 
            // O trigger no DB pode ser pesado? Não temos triggers pesados.

            // Otimização: Update com IN (lista de ids do seq)
            const idsToUpdate = weekParts.filter(p => p.seq === seq).map(p => p.id);

            if (idsToUpdate.length > 0) {
                await supabase
                    .from('workbook_parts')
                    .update({
                        hora_inicio: startStr,
                        hora_fim: endStr,
                        updated_at: new Date().toISOString()
                    })
                    .in('id', idsToUpdate);
            }
        }
        console.log('[workbookService] ✅ Horários recalculados com sucesso.');
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

    /**
     * Atualiza o status de TODAS as partes de uma semana específica
     */
    async updateWeekStatus(weekId: string, status: WorkbookStatus): Promise<void> {
        const { error } = await supabase
            .from('workbook_parts')
            .update({ status })
            .eq('week_id', weekId);

        if (error) throw new Error(`Erro ao atualizar status da semana ${weekId}: ${error.message}`);
    },

    // ========================================================================
    // CICLO DE VIDA DE DESIGNAÇÃO
    // ========================================================================

    /**
     * Propõe um publicador para uma parte (atualiza status e publicador)
     * Usa apenas resolved_publisher_name (resolved_publisher_id é UUID e publishers usam IDs numéricos)
     */
    async proposePublisher(partId: string, publisherName: string): Promise<WorkbookPart> {
        // Se remover o publicador, status volta para PENDENTE
        const status = publisherName ? WorkbookStatus.PROPOSTA : WorkbookStatus.PENDENTE;

        const { data, error } = await supabase
            .from('workbook_parts')
            .update({
                status: status,
                resolved_publisher_name: publisherName || null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', partId)
            .select()
            .maybeSingle();

        if (error) throw new Error(`Erro ao propor publicador: ${error.message}`);
        if (!data) throw new Error(`Parte não encontrada ou já foi atualizada por outro usuário`);

        const updatedPart = mapDbToWorkbookPart(data);

        // TRIGGER DE SINCRONIZAÇÃO DO PRESIDENTE
        if (updatedPart.tipoParte === 'Presidente') {
            this.syncChairmanAssignments(updatedPart.weekId, '', publisherName, status);
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
            .maybeSingle();

        if (error) throw new Error(`Erro ao aprovar proposta: ${error.message}`);
        return mapDbToWorkbookPart(data);
    },

    /**
     * Rejeita uma proposta (PROPOSTA -> PENDENTE)
     */
    /**
     * Rejeita uma proposta ou Cancela uma designação (STATUS -> PENDENTE)
     * Funciona para: PROPOSTA, APROVADA, DESIGNADA, CONCLUIDA (em caso de erro)
     */
    async rejectProposal(partId: string, reason: string): Promise<WorkbookPart> {
        // Primeiro, buscar a parte para saber quem estava designado (para log)
        const { data: currentPart } = await supabase
            .from('workbook_parts')
            .select('resolved_publisher_name')
            .eq('id', partId)
            .single();

        let enhancedReason = reason;
        if (currentPart?.resolved_publisher_name) {
            enhancedReason = `[${new Date().toLocaleDateString()}] Removido ${currentPart.resolved_publisher_name}: ${reason}`;
        }

        const { data, error } = await supabase
            .from('workbook_parts')
            .update({
                status: WorkbookStatus.PENDENTE,
                rejected_reason: enhancedReason,
                // Limpar a designação ao rejeitar
                resolved_publisher_name: null,
                updated_at: new Date().toISOString(),
                // Limpar metadados de aprovação/conclusão para resetar ciclo
                approved_by_id: null,
                approved_at: null,
                completed_at: null
            })
            .eq('id', partId)
            // Aceita rejeitar de qualquer status avançado
            .in('status', [
                WorkbookStatus.PROPOSTA,
                WorkbookStatus.APROVADA,
                WorkbookStatus.DESIGNADA,
                WorkbookStatus.CONCLUIDA
            ])
            .select()
            .maybeSingle();

        if (error) throw new Error(`Erro ao rejeitar/cancelar: ${error.message}`);
        if (!data) throw new Error('Parte não encontrada ou status inválido para cancelamento');

        const updatedPart = mapDbToWorkbookPart(data);

        // TRIGGER: Se for Presidente, limpar as partes filhas também
        if (updatedPart.tipoParte === 'Presidente') {
            this.syncChairmanAssignments(updatedPart.weekId, '', '', WorkbookStatus.PENDENTE);
        }

        return updatedPart;
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
            // Pular se já tem nome resolvido
            if (!part.rawPublisherName || part.resolvedPublisherName) continue;

            const match = findBestMatch(part.rawPublisherName, publishers);
            if (match.publisher && match.confidence >= 70) {
                await this.updatePart(part.id, {
                    // SIMPLIFICADO: Apenas nome
                    resolvedPublisherName: match.publisher.name,
                });
                matchedCount++;
            }
        }

        return matchedCount;
    },

    /**
     * Reverte a conclusão (CONCLUIDA -> APROVADA) mantendo a designação
     */
    async undoCompletion(partId: string): Promise<WorkbookPart> {
        const { data, error } = await supabase
            .from('workbook_parts')
            .update({
                status: WorkbookStatus.APROVADA,
                completed_at: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', partId)
            .eq('status', WorkbookStatus.CONCLUIDA)
            .select()
            .maybeSingle();

        if (error) throw new Error(`Erro ao desfazer conclusão: ${error.message}`);
        if (!data) throw new Error('Parte não encontrada ou não está concluída');

        return mapDbToWorkbookPart(data);
    },

    /**
     * Sincroniza partes do Presidente (Comentários Iniciais/Finais)
     * Deve ser chamado após atualizar a parte principal 'Presidente'
     */
    async syncChairmanAssignments(weekId: string, _publisherId: string, publisherName: string, status: WorkbookStatus): Promise<void> {
        // Tipos de parte que devem ser sincronizados com o Presidente
        const TARGET_TYPES = [
            'Comentários Iniciais', 'Comentarios Iniciais',
            'Comentários Finais', 'Comentarios Finais',
            'Cântico Inicial', 'Cântico do Meio', 'Cântico Final', 'Cântico', 'Cantico',
            'Oração Inicial', 'Oracao Inicial',
            'Elogios e Conselhos', 'Elogios e conselhos'
        ];

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
        // resolved_publisher_id é UUID no banco, publishers usam IDs numéricos - incompatível
        // Guardamos apenas o nome
        updates.resolved_publisher_name = publisherName || null;
        updates.status = status;

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

// ============================================================================
// FUNÇÃO TEMPORÁRIA: Atualizar status em massa por data
// Executar no console: window.updateStatusByDate()
// ============================================================================
async function updateStatusByDate(): Promise<void> {
    console.log('🔄 Iniciando atualização de status...\n');

    // 1. Semanas PASSADAS (antes de 29/12/2025) COM publicador → CONCLUIDA
    console.log('1️⃣ Atualizando semanas passadas para CONCLUIDA...');

    const { data: pastData, error: pastError } = await supabase
        .from('workbook_parts')
        .update({ status: 'CONCLUIDA' })
        .lt('date', '2025-12-29')
        .not('raw_publisher_name', 'is', null)
        .neq('raw_publisher_name', '')
        .select('id');

    if (pastError) {
        console.error('❌ Erro ao atualizar semanas passadas:', pastError.message);
    } else {
        console.log(`   ✅ ${pastData?.length || 0} partes atualizadas para CONCLUIDA`);
    }

    // 2. Esta semana até 18/01/2026 COM publicador → APROVADA
    console.log('\n2️⃣ Atualizando semanas atuais até 12/01/2026 para APROVADA...');

    const { data: currentData, error: currentError } = await supabase
        .from('workbook_parts')
        .update({ status: 'APROVADA' })
        .gte('date', '2025-12-29')
        .lte('date', '2026-01-18')
        .not('raw_publisher_name', 'is', null)
        .neq('raw_publisher_name', '')
        .select('id');

    if (currentError) {
        console.error('❌ Erro ao atualizar semanas atuais:', currentError.message);
    } else {
        console.log(`   ✅ ${currentData?.length || 0} partes atualizadas para APROVADA`);
    }

    // 3. Resumo
    console.log('\n📊 Verificando distribuição de status...');

    const { data: summary } = await supabase
        .from('workbook_parts')
        .select('status')
        .range(0, 9999);

    if (summary) {
        const counts: Record<string, number> = {};
        summary.forEach((p: { status: string }) => {
            counts[p.status] = (counts[p.status] || 0) + 1;
        });
        console.log('   Status atual:', counts);
    }

    console.log('\n✅ Atualização concluída! Recarregue a página para ver as mudanças.');
}

// Expor globalmente para execução via console
if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).updateStatusByDate = updateStatusByDate;
}

