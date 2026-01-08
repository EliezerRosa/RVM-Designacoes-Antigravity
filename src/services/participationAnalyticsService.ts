/**
 * Participation Analytics Service
 * Serviço de consultas analíticas para histórico de participações
 * Apenas leitura - não altera funcionalidades existentes
 */

import { supabase } from '../lib/supabase';
import { fetchAllRows } from './supabasePagination';
import type { WorkbookPart } from '../types';

// ============================================================================
// TIPOS
// ============================================================================

export interface ParticipationFilters {
    publisherNames?: string[];
    startDate?: string;      // YYYY-MM-DD
    endDate?: string;        // YYYY-MM-DD
    modalidade?: string;
    tipoParte?: string;
    funcao?: 'Titular' | 'Ajudante' | 'Todos';
}

export interface PublisherStats {
    name: string;
    totalParticipations: number;
    asTitular: number;
    asAjudante: number;
    lastParticipation: string | null;
    byModalidade: Record<string, number>;
    byTipoParte: Record<string, number>;
    timeline: { date: string; count: number }[];
}

export interface ComparisonData {
    publishers: PublisherStats[];
    periodStart: string;
    periodEnd: string;
    chartData: { name: string;[key: string]: string | number }[];
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

function mapDbToWorkbookPart(row: Record<string, unknown>): WorkbookPart {
    return {
        id: row.id as string,
        batch_id: row.batch_id as string | undefined,
        year: row.year as number | undefined,
        weekId: row.week_id as string,
        weekDisplay: row.week_display as string,
        date: row.date as string,
        section: row.section as string,
        tipoParte: row.tipo_parte as string,
        modalidade: row.modalidade as string,
        tituloParte: row.titulo_parte as string,
        descricaoParte: row.descricao_parte as string,
        detalhesParte: row.detalhes_parte as string,
        seq: row.seq as number,
        funcao: row.funcao as 'Titular' | 'Ajudante',
        duracao: row.duracao as string,
        horaInicio: row.hora_inicio as string,
        horaFim: row.hora_fim as string,
        rawPublisherName: row.raw_publisher_name as string,
        resolvedPublisherName: row.resolved_publisher_name as string | undefined,
        status: row.status as any,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string | undefined,
        approvedById: row.approved_by_id as string | undefined,
        approvedAt: row.approved_at as string | undefined,
        rejectedReason: row.rejected_reason as string | undefined,
        completedAt: row.completed_at as string | undefined,
        cancelReason: row.cancel_reason as string | undefined,
    };
}

// ============================================================================
// SERVICE
// ============================================================================

export const participationAnalyticsService = {

    /**
     * Busca participações com filtros avançados
     */
    async getParticipations(filters: ParticipationFilters): Promise<WorkbookPart[]> {
        const rows = await fetchAllRows<Record<string, unknown>>('workbook_parts', (query) => {
            let q = query
                .not('resolved_publisher_name', 'is', null)
                .neq('resolved_publisher_name', '');

            // Filtro por publicadores
            if (filters.publisherNames && filters.publisherNames.length > 0) {
                q = q.in('resolved_publisher_name', filters.publisherNames);
            }

            // Filtro por período
            if (filters.startDate) {
                q = q.gte('date', filters.startDate);
            }
            if (filters.endDate) {
                q = q.lte('date', filters.endDate);
            }

            // Filtro por modalidade
            if (filters.modalidade && filters.modalidade !== 'Todas') {
                q = q.eq('modalidade', filters.modalidade);
            }

            // Filtro por tipo de parte
            if (filters.tipoParte && filters.tipoParte !== 'Todos') {
                q = q.ilike('tipo_parte', `%${filters.tipoParte}%`);
            }

            // Filtro por função
            if (filters.funcao && filters.funcao !== 'Todos') {
                q = q.eq('funcao', filters.funcao);
            }

            // Ordenar por data desc
            return q.order('date', { ascending: false });
        });

        return rows.map(mapDbToWorkbookPart);
    },

    /**
     * Gera estatísticas agregadas para um publicador
     */
    async getPublisherStats(publisherName: string, filters: ParticipationFilters = {}): Promise<PublisherStats> {
        const parts = await this.getParticipations({
            ...filters,
            publisherNames: [publisherName]
        });

        const byModalidade: Record<string, number> = {};
        const byTipoParte: Record<string, number> = {};
        const byDate: Record<string, number> = {};

        let asTitular = 0;
        let asAjudante = 0;

        parts.forEach(p => {
            // Contagem por função
            if (p.funcao === 'Titular') asTitular++;
            else if (p.funcao === 'Ajudante') asAjudante++;

            // Contagem por modalidade
            const mod = p.modalidade || 'Outros';
            byModalidade[mod] = (byModalidade[mod] || 0) + 1;

            // Contagem por tipo de parte
            const tipo = p.tipoParte || 'Outros';
            byTipoParte[tipo] = (byTipoParte[tipo] || 0) + 1;

            // Timeline (por mês/ano)
            const monthKey = p.date?.substring(0, 7) || 'unknown'; // YYYY-MM
            byDate[monthKey] = (byDate[monthKey] || 0) + 1;
        });

        // Ordenar timeline
        const timeline = Object.entries(byDate)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // Última participação
        const lastParticipation = parts.length > 0 ? parts[0].date : null;

        return {
            name: publisherName,
            totalParticipations: parts.length,
            asTitular,
            asAjudante,
            lastParticipation,
            byModalidade,
            byTipoParte,
            timeline
        };
    },

    /**
     * Compara estatísticas de múltiplos publicadores
     */
    async comparePublishers(names: string[], filters: ParticipationFilters = {}): Promise<ComparisonData> {
        const publishers: PublisherStats[] = [];

        for (const name of names) {
            const stats = await this.getPublisherStats(name, filters);
            publishers.push(stats);
        }

        // Gerar dados para gráfico comparativo
        const chartData: { name: string;[key: string]: string | number }[] = publishers.map(p => ({
            name: p.name.split(' ')[0], // Primeiro nome para legibilidade
            Total: p.totalParticipations,
            Titular: p.asTitular,
            Ajudante: p.asAjudante
        }));

        return {
            publishers,
            periodStart: filters.startDate || 'início',
            periodEnd: filters.endDate || 'hoje',
            chartData
        };
    },

    /**
     * Lista todos os publicadores que já participaram (para dropdown)
     */
    async getDistinctPublishers(): Promise<string[]> {
        const { data, error } = await supabase
            .from('workbook_parts')
            .select('resolved_publisher_name')
            .not('resolved_publisher_name', 'is', null)
            .neq('resolved_publisher_name', '');

        if (error) {
            console.error('[Analytics] Error fetching publishers:', error);
            return [];
        }

        const names = new Set<string>();
        data?.forEach(row => {
            if (row.resolved_publisher_name) {
                names.add(row.resolved_publisher_name);
            }
        });

        return Array.from(names).sort();
    },

    /**
     * Lista modalidades distintas (para dropdown)
     */
    async getDistinctModalidades(): Promise<string[]> {
        const { data, error } = await supabase
            .from('workbook_parts')
            .select('modalidade')
            .not('modalidade', 'is', null)
            .neq('modalidade', '');

        if (error) {
            console.error('[Analytics] Error fetching modalidades:', error);
            return [];
        }

        const mods = new Set<string>();
        data?.forEach(row => {
            if (row.modalidade) {
                mods.add(row.modalidade);
            }
        });

        return Array.from(mods).sort();
    },

    /**
     * Lista tipos de parte distintos (para dropdown)
     */
    async getDistinctTiposParte(): Promise<string[]> {
        const { data, error } = await supabase
            .from('workbook_parts')
            .select('tipo_parte')
            .not('tipo_parte', 'is', null)
            .neq('tipo_parte', '');

        if (error) {
            console.error('[Analytics] Error fetching tipos:', error);
            return [];
        }

        const tipos = new Set<string>();
        data?.forEach(row => {
            if (row.tipo_parte) {
                tipos.add(row.tipo_parte);
            }
        });

        return Array.from(tipos).sort();
    }
};
