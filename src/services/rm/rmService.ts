/**
 * rmService.ts — Camada de acesso ao schema `rm.*` (Relatório Mensal)
 *
 * Desacoplado de public.*. Todo acesso via supabase.schema('rm').
 * RLS Fase 1: somente Admin. RPCs de mês vivem em public.rm_open_month/rm_close_month.
 */

import { supabase } from '../../lib/supabase';

const rm = () => supabase.schema('rm');

// ===== Types =====

export type FieldServiceStatus = 'ATIVO' | 'IRREGULAR' | 'INATIVO' | 'RECÉM-CONGREGADO';
export type Gender = 'M' | 'F';

export interface RmCongregation {
    id: string;
    glide_id: string | null;
    name: string;
    number: string | null;
    access_pin: string | null;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface RmFieldGroup {
    id: string;
    glide_id: string | null;
    congregation_id: string;
    group_number: number;
    name: string | null;
    leader_id: string | null;
    assistant_leader_id: string | null;
    glide_leader_id: string | null;
    glide_assistant_id: string | null;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface RmPublisher {
    id: string;
    glide_id: string | null;
    congregation_id: string | null;
    current_group_id: string | null;
    name: string;
    funcao: string | null;
    gender: Gender | null;
    birth_date: string | null;
    publisher_date: string | null;
    baptism_date: string | null;
    hope_class: string | null;
    privilege: string | null;
    privilege_date: string | null;
    is_regular_pioneer: boolean;
    pioneer_start_date: string | null;
    is_special_pioneer: boolean;
    field_service_status: FieldServiceStatus | null;
    /** true = membro ativo da congregação; false = "Não Congregado" (saiu/desativado) */
    is_congregated: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface RmMonthlyReport {
    id: string;
    publisher_id: string;
    congregation_id: string | null;
    congregation_at_time: string | null;
    group_id: string | null;
    group_at_time: string | null;
    reference_year: number;
    reference_month: number;
    service_year: number | null;
    has_preached: boolean;
    hours: number | null;
    bible_studies: number;
    modalities: string[];
    notes: string | null;
    submitted_at: string;
    is_late_report: boolean;
    late_consolidation_period: string | null;
    /** Snapshot da modalidade de serviço no momento do relatório (dado histórico) */
    is_auxiliary_pioneer: boolean;
    is_regular_pioneer: boolean;
    is_special_pioneer: boolean;
    glide_row_id: string | null;
    glide_congregation_id: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface RmMonthControl {
    id: string;
    congregation_id: string;
    reference_year: number;
    reference_month: number;
    is_open: boolean;
    opened_at: string | null;
    opened_by: string | null;
    closed_at: string | null;
    closed_by: string | null;
}

export interface S1ConsolidationRow {
    reference_year: number;
    reference_month: number;
    congregation_id: string;
    total_reports: number;
    total_preached: number;
    /** Contagens exclusivas por modalidade de serviço */
    publisher_count: number;
    auxiliary_pioneer_count: number;
    regular_pioneer_count: number;
    special_pioneer_count: number;
    total_studies: number;
    pioneer_hours: number;
    auxiliary_hours: number;
    late_count: number;
}

export interface ReportFilter {
    reference_year?: number;
    reference_month?: number;
    publisher_id?: string;
    congregation_id?: string;
}

// ===== Congregations =====

export const rmService = {
    async listCongregations(): Promise<RmCongregation[]> {
        const { data, error } = await rm().from('congregations').select('*').order('name');
        if (error) throw error;
        return data ?? [];
    },

    async upsertCongregation(input: Partial<RmCongregation>): Promise<RmCongregation> {
        const { data, error } = await rm().from('congregations').upsert(input).select().single();
        if (error) throw error;
        return data as RmCongregation;
    },

    async deleteCongregation(id: string): Promise<void> {
        const { error } = await rm().from('congregations').delete().eq('id', id);
        if (error) throw error;
    },

    // ===== Field Groups =====

    async listFieldGroups(congregationId?: string): Promise<RmFieldGroup[]> {
        let q = rm().from('field_groups').select('*').order('group_number');
        if (congregationId) q = q.eq('congregation_id', congregationId);
        const { data, error } = await q;
        if (error) throw error;
        return data ?? [];
    },

    async upsertFieldGroup(input: Partial<RmFieldGroup>): Promise<RmFieldGroup> {
        const { data, error } = await rm().from('field_groups').upsert(input).select().single();
        if (error) throw error;
        return data as RmFieldGroup;
    },

    async deleteFieldGroup(id: string): Promise<void> {
        const { error } = await rm().from('field_groups').delete().eq('id', id);
        if (error) throw error;
    },

    // ===== Publishers =====

    async listPublishers(congregationId?: string): Promise<RmPublisher[]> {
        let q = rm().from('publishers').select('*').order('name');
        if (congregationId) q = q.eq('congregation_id', congregationId);
        const { data, error } = await q;
        if (error) throw error;
        return data ?? [];
    },

    async upsertPublisher(input: Partial<RmPublisher>): Promise<RmPublisher> {
        const { data, error } = await rm().from('publishers').upsert(input).select().single();
        if (error) throw error;
        return data as RmPublisher;
    },

    async deletePublisher(id: string): Promise<void> {
        const { error } = await rm().from('publishers').delete().eq('id', id);
        if (error) throw error;
    },

    // ===== Monthly Reports =====

    async listReports(filter: ReportFilter = {}): Promise<RmMonthlyReport[]> {
        let q = rm().from('monthly_reports').select('*')
            .order('reference_year', { ascending: false })
            .order('reference_month', { ascending: false });
        if (filter.reference_year != null) q = q.eq('reference_year', filter.reference_year);
        if (filter.reference_month != null) q = q.eq('reference_month', filter.reference_month);
        if (filter.publisher_id) q = q.eq('publisher_id', filter.publisher_id);
        if (filter.congregation_id) q = q.eq('congregation_id', filter.congregation_id);
        const { data, error } = await q;
        if (error) throw error;
        return data ?? [];
    },

    async upsertReport(input: Partial<RmMonthlyReport>): Promise<RmMonthlyReport> {
        const { data, error } = await rm().from('monthly_reports')
            .upsert(input, { onConflict: 'publisher_id,reference_year,reference_month' })
            .select().single();
        if (error) throw error;
        return data as RmMonthlyReport;
    },

    async deleteReport(id: string): Promise<void> {
        const { error } = await rm().from('monthly_reports').delete().eq('id', id);
        if (error) throw error;
    },

    // ===== Consolidation (S-1) =====

    async getConsolidation(year: number, month: number): Promise<S1ConsolidationRow[]> {
        const { data, error } = await rm().from('v_s1_consolidation').select('*')
            .eq('reference_year', year)
            .eq('reference_month', month);
        if (error) throw error;
        return data ?? [];
    },

    /** Série anual: todos os meses de um ano (para gráficos de tendência). */
    async getConsolidationSeries(year: number, congregationId?: string): Promise<S1ConsolidationRow[]> {
        let q = rm().from('v_s1_consolidation').select('*')
            .eq('reference_year', year)
            .order('reference_month', { ascending: true });
        if (congregationId) q = q.eq('congregation_id', congregationId);
        const { data, error } = await q;
        if (error) throw error;
        return data ?? [];
    },

    // ===== Month control (RPCs em public) =====

    async listMonthControl(congregationId?: string): Promise<RmMonthControl[]> {
        let q = rm().from('month_control').select('*')
            .order('reference_year', { ascending: false })
            .order('reference_month', { ascending: false });
        if (congregationId) q = q.eq('congregation_id', congregationId);
        const { data, error } = await q;
        if (error) throw error;
        return data ?? [];
    },

    async openMonth(congregationId: string, year: number, month: number): Promise<void> {
        const { error } = await supabase.rpc('rm_open_month', {
            p_congregation_id: congregationId, p_year: year, p_month: month,
        });
        if (error) throw error;
    },

    async closeMonth(congregationId: string, year: number, month: number): Promise<void> {
        const { error } = await supabase.rpc('rm_close_month', {
            p_congregation_id: congregationId, p_year: year, p_month: month,
        });
        if (error) throw error;
    },
};
