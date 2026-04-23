/**
 * permissionPolicyService — CRUD para tabelas permission_policies e user_permission_overrides
 *
 * Usado pelo agentActionService (action MANAGE_PERMISSIONS) e pelo PermissionManager.
 * Acesso restrito a Admin (validado upstream pelo permission gate).
 */

import { supabase } from '../lib/supabase';

// ===== Types =====

export interface PolicyRow {
    id: string;
    target_condition: string | null;
    target_funcao: string | null;
    allowed_tabs: string[];
    allowed_agent_actions: string[];
    blocked_agent_actions: string[];
    data_access_level: string;
    can_see_sensitive_data: boolean;
    publisher_filter_conditions: string[] | null;
    publisher_filter_statuses: string[] | null;
    publisher_filter_exclude_names: string[] | null;
    priority: number;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface OverrideRow {
    id: string;
    profile_id: string;
    allowed_tabs: string[] | null;
    allowed_agent_actions: string[] | null;
    blocked_agent_actions: string[] | null;
    data_access_level: string | null;
    can_see_sensitive_data: boolean | null;
    publisher_filter_conditions: string[] | null;
    publisher_filter_statuses: string[] | null;
    publisher_filter_exclude_names: string[] | null;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export type PolicyInput = Partial<Omit<PolicyRow, 'id' | 'created_at' | 'updated_at'>>;
export type OverrideInput = Partial<Omit<OverrideRow, 'id' | 'created_at' | 'updated_at'>> & { profile_id: string };

// ===== Policies CRUD =====

export const permissionPolicyService = {
    async listPolicies(): Promise<PolicyRow[]> {
        const { data, error } = await supabase
            .from('permission_policies')
            .select('*')
            .order('priority', { ascending: false });
        if (error) throw new Error(error.message);
        return (data || []) as PolicyRow[];
    },

    async getPolicy(id: string): Promise<PolicyRow | null> {
        const { data, error } = await supabase
            .from('permission_policies')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) throw new Error(error.message);
        return (data as PolicyRow) || null;
    },

    async createPolicy(input: PolicyInput): Promise<PolicyRow> {
        const payload = {
            target_condition: input.target_condition ?? null,
            target_funcao: input.target_funcao ?? null,
            allowed_tabs: input.allowed_tabs ?? ['agent'],
            allowed_agent_actions: input.allowed_agent_actions ?? [],
            blocked_agent_actions: input.blocked_agent_actions ?? [],
            data_access_level: input.data_access_level ?? 'self',
            can_see_sensitive_data: input.can_see_sensitive_data ?? false,
            publisher_filter_conditions: input.publisher_filter_conditions ?? null,
            publisher_filter_statuses: input.publisher_filter_statuses ?? null,
            publisher_filter_exclude_names: input.publisher_filter_exclude_names ?? null,
            priority: input.priority ?? 0,
            is_active: input.is_active ?? true,
        };
        const { data, error } = await supabase
            .from('permission_policies')
            .insert(payload)
            .select('*')
            .single();
        if (error) throw new Error(error.message);
        return data as PolicyRow;
    },

    async updatePolicy(id: string, patch: PolicyInput): Promise<PolicyRow> {
        const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const k of Object.keys(patch) as (keyof PolicyInput)[]) {
            if (patch[k] !== undefined) payload[k] = patch[k] as unknown;
        }
        const { data, error } = await supabase
            .from('permission_policies')
            .update(payload)
            .eq('id', id)
            .select('*')
            .single();
        if (error) throw new Error(error.message);
        return data as PolicyRow;
    },

    async deletePolicy(id: string): Promise<void> {
        const { error } = await supabase
            .from('permission_policies')
            .delete()
            .eq('id', id);
        if (error) throw new Error(error.message);
    },

    async togglePolicy(id: string): Promise<PolicyRow> {
        const current = await this.getPolicy(id);
        if (!current) throw new Error(`Política ${id} não encontrada`);
        return this.updatePolicy(id, { is_active: !current.is_active });
    },

    // ===== Overrides CRUD =====

    async listOverrides(): Promise<OverrideRow[]> {
        const { data, error } = await supabase
            .from('user_permission_overrides')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return (data || []) as OverrideRow[];
    },

    async getOverride(id: string): Promise<OverrideRow | null> {
        const { data, error } = await supabase
            .from('user_permission_overrides')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) throw new Error(error.message);
        return (data as OverrideRow) || null;
    },

    async createOverride(input: OverrideInput): Promise<OverrideRow> {
        if (!input.profile_id) throw new Error('profile_id é obrigatório');
        const payload = {
            profile_id: input.profile_id,
            allowed_tabs: input.allowed_tabs ?? null,
            allowed_agent_actions: input.allowed_agent_actions ?? null,
            blocked_agent_actions: input.blocked_agent_actions ?? null,
            data_access_level: input.data_access_level ?? null,
            can_see_sensitive_data: input.can_see_sensitive_data ?? null,
            publisher_filter_conditions: input.publisher_filter_conditions ?? null,
            publisher_filter_statuses: input.publisher_filter_statuses ?? null,
            publisher_filter_exclude_names: input.publisher_filter_exclude_names ?? null,
            is_active: input.is_active ?? true,
        };
        const { data, error } = await supabase
            .from('user_permission_overrides')
            .insert(payload)
            .select('*')
            .single();
        if (error) throw new Error(error.message);
        return data as OverrideRow;
    },

    async updateOverride(id: string, patch: Partial<OverrideInput>): Promise<OverrideRow> {
        const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const k of Object.keys(patch) as (keyof OverrideInput)[]) {
            if (patch[k] !== undefined) payload[k] = patch[k] as unknown;
        }
        const { data, error } = await supabase
            .from('user_permission_overrides')
            .update(payload)
            .eq('id', id)
            .select('*')
            .single();
        if (error) throw new Error(error.message);
        return data as OverrideRow;
    },

    async deleteOverride(id: string): Promise<void> {
        const { error } = await supabase
            .from('user_permission_overrides')
            .delete()
            .eq('id', id);
        if (error) throw new Error(error.message);
    },

    async findProfileByEmail(email: string): Promise<{ id: string; email: string; full_name: string | null } | null> {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .ilike('email', email)
            .maybeSingle();
        if (error) throw new Error(error.message);
        return data || null;
    },
};
