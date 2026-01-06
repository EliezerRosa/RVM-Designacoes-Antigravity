/**
 * History Adapter - Camada de Adaptação para Histórico
 * 
 * Converte WorkbookPart (tabela Apostila) para HistoryRecord
 * Permite derivar histórico de participações diretamente da tabela workbook_parts
 * sem quebrar dependências existentes no cooldownService.
 */

import { supabase } from '../lib/supabase';
import type { WorkbookPart, HistoryRecord } from '../types';
import { WorkbookStatus, HistoryStatus } from '../types';

/**
 * Converte WorkbookPart para HistoryRecord
 * Formato esperado pelo cooldownService e motor de elegibilidade
 */
export function workbookPartToHistoryRecord(part: WorkbookPart): HistoryRecord {
    return {
        id: part.id,
        weekId: part.weekId,
        weekDisplay: part.weekDisplay,
        date: part.date,
        section: part.section,
        tipoParte: part.tipoParte,
        modalidade: part.modalidade,
        tituloParte: part.tituloParte,
        descricaoParte: part.descricaoParte,
        detalhesParte: part.detalhesParte,
        seq: part.seq,
        funcao: part.funcao as 'Titular' | 'Ajudante',
        duracao: parseInt(part.duracao) || 0,
        horaInicio: part.horaInicio,
        horaFim: part.horaFim,
        rawPublisherName: part.rawPublisherName,
        // SIMPLIFICADO: apenas nome
        resolvedPublisherName: part.resolvedPublisherName,
        status: HistoryStatus.APPROVED, // COMPLETED/PROMOTED = participação válida
        importSource: 'Excel',
        importBatchId: part.batch_id || '',
        createdAt: part.createdAt || new Date().toISOString(),
        updatedAt: part.updatedAt || new Date().toISOString(),
    };
}

/**
 * Carrega histórico de participações da tabela workbook_parts
 * ATUALIZADO: Carrega TODAS as partes que têm publicador atribuído, independente do status.
 * Isso garante que o motor considere designações recentes (PROPOSTA, APROVADA, etc.)
 * para calcular prioridade corretamente.
 */
export async function loadCompletedParticipations(): Promise<HistoryRecord[]> {
    console.log('[historyAdapter] Carregando participações (todas com publicador atribuído)...');

    const { data, error } = await supabase
        .from('workbook_parts')
        .select('*')
        // NÃO FILTRAR POR STATUS - carregar todas que têm publicador atribuído
        .not('resolved_publisher_name', 'is', null)
        .order('date', { ascending: false })
        .range(0, 9999);

    if (error) {
        console.error('[historyAdapter] Erro ao carregar participações:', error);
        return [];
    }

    const records = (data || []).map(row => workbookPartToHistoryRecord(mapDbToWorkbookPart(row)));
    console.log(`[historyAdapter] ${records.length} participações carregadas`);

    return records;
}

/**
 * Carrega histórico de participações para um publicador específico
 * ATUALIZADO: Não filtra por status (consistente com loadCompletedParticipations)
 */
export async function loadPublisherParticipations(publisherName: string): Promise<HistoryRecord[]> {
    const { data, error } = await supabase
        .from('workbook_parts')
        .select('*')
        .eq('resolved_publisher_name', publisherName)
        // NÃO FILTRAR POR STATUS
        .order('date', { ascending: false })
        .range(0, 9999);

    if (error) {
        console.error('[historyAdapter] Erro ao carregar participações do publicador:', error);
        return [];
    }

    return (data || []).map(row => workbookPartToHistoryRecord(mapDbToWorkbookPart(row)));
}

/**
 * Mapa interno para converter row do banco para WorkbookPart
 * Similar ao mapDbToWorkbookPart do workbookService
 */
function mapDbToWorkbookPart(row: Record<string, unknown>): WorkbookPart {
    return {
        id: (row.id as string) || '',
        year: (row.year as number) || new Date().getFullYear(),
        weekId: (row.week_id as string) || '',
        weekDisplay: (row.week_display as string) || '',
        date: (row.date as string) || '',
        section: (row.section as string) || '',
        tipoParte: (row.tipo_parte as string) || '',
        modalidade: (row.modalidade as string) || 'Demonstração',
        tituloParte: (row.part_title as string) || '',
        descricaoParte: (row.descricao as string) || '',
        detalhesParte: (row.detalhes_parte as string) || (row.detalhes as string) || '',
        seq: (row.seq as number) || 0,
        funcao: ((row.funcao as string) || 'Titular') as 'Titular' | 'Ajudante',
        duracao: (row.duracao as string) || '',
        horaInicio: (row.hora_inicio as string) || '',
        horaFim: (row.hora_fim as string) || '',
        rawPublisherName: (row.raw_publisher_name as string) || '',
        // SIMPLIFICADO: apenas nome
        resolvedPublisherName: (row.resolved_publisher_name as string) || undefined,
        status: (row.status as WorkbookStatus) || WorkbookStatus.PENDENTE,
        batch_id: (row.batch_id as string) || undefined,
        createdAt: (row.created_at as string) || '',
        updatedAt: (row.updated_at as string) || '',
    };
}

/**
 * Estatísticas de participações por status
 */
export async function getParticipationStats(): Promise<{
    total: number;
    completed: number;
    promoted: number;
    draft: number;
    refined: number;
}> {
    const { data, error } = await supabase
        .from('workbook_parts')
        .select('status')
        .range(0, 9999);

    if (error) {
        console.error('[historyAdapter] Erro ao carregar estatísticas:', error);
        return { total: 0, completed: 0, promoted: 0, draft: 0, refined: 0 };
    }

    const stats = {
        total: data?.length || 0,
        completed: data?.filter(r => r.status === WorkbookStatus.CONCLUIDA).length || 0,
        promoted: data?.filter(r => r.status === WorkbookStatus.DESIGNADA).length || 0,
        draft: data?.filter(r => r.status === WorkbookStatus.PENDENTE).length || 0,
        refined: data?.filter(r => r.status === WorkbookStatus.PROPOSTA).length || 0,
    };

    return stats;
}
