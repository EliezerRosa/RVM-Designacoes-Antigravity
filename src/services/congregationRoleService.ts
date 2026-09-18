/**
 * Congregation Role Service — RVM Designações
 * 
 * Gerenciamento centralizado de funções congregacionais armazenadas em `app_settings.congregation_roles`.
 * Suporta funções canônicas do sistema e funções personalizadas criadas pela liderança.
 */

import { supabase } from '../lib/supabase';
import type { Publisher } from '../types';

export interface CongregationRole {
    id: string;
    name: string;
    description?: string;
    allowedConditions: ('Ancião' | 'Servo Ministerial' | 'Publicador')[];
    isSystemDefault?: boolean;
    order: number;
}

export const SYSTEM_DEFAULT_ROLES: CongregationRole[] = [
    {
        id: 'cca',
        name: 'Coordenador do Corpo de Anciãos',
        description: 'Coordena o corpo de anciãos da congregação.',
        allowedConditions: ['Ancião'],
        isSystemDefault: true,
        order: 10,
    },
    {
        id: 'sec',
        name: 'Secretário',
        description: 'Responsável pelos registros e correspondência da congregação.',
        allowedConditions: ['Ancião'],
        isSystemDefault: true,
        order: 20,
    },
    {
        id: 'ss',
        name: 'Superintendente de Serviço',
        description: 'Supervisiona as atividades de pregação e territórios.',
        allowedConditions: ['Ancião'],
        isSystemDefault: true,
        order: 30,
    },
    {
        id: 'srvm',
        name: 'Superintendente da Reunião Vida e Ministério',
        description: 'Supervisiona a programação e execução da Reunião Vida e Ministério.',
        allowedConditions: ['Ancião'],
        isSystemDefault: true,
        order: 40,
    },
    {
        id: 'ajd_srvm',
        name: 'Ajudante do Superintendente da Reunião Vida e Ministério',
        description: 'Auxilia o SRVM na elaboração das escalas e acompanhamento das designações.',
        allowedConditions: ['Ancião', 'Servo Ministerial'],
        isSystemDefault: true,
        order: 50,
    },
    {
        id: 'quadro_anuncios',
        name: 'Responsável pelo Quadro de Anúncios',
        description: 'Responsável por imprimir e afixar no mural do Salão do Reino as folhas oficiais do S-140.',
        allowedConditions: ['Ancião', 'Servo Ministerial', 'Publicador'],
        isSystemDefault: true,
        order: 60,
    },
];

let cachedRoles: CongregationRole[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minuto

export const congregationRoleService = {
    /**
     * Lista todas as funções congregacionais ativas.
     * Se ainda não existirem em `app_settings`, inicializa com as funções padrão.
     */
    async listRoles(): Promise<CongregationRole[]> {
        const now = Date.now();
        if (cachedRoles && now - lastFetchTime < CACHE_TTL_MS) {
            return cachedRoles;
        }

        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'congregation_roles')
                .maybeSingle();

            if (error) {
                console.warn('[congregationRoleService] Erro ao buscar funções:', error.message);
                return SYSTEM_DEFAULT_ROLES;
            }

            let roles: CongregationRole[] = [];
            if (data?.value && Array.isArray(data.value)) {
                roles = data.value;
                // Garante que todas as funções padrão estejam presentes
                let needsUpdate = false;
                for (const def of SYSTEM_DEFAULT_ROLES) {
                    if (!roles.some(r => r.id === def.id || r.name.toLowerCase() === def.name.toLowerCase())) {
                        roles.push(def);
                        needsUpdate = true;
                    }
                }
                if (needsUpdate) {
                    roles.sort((a, b) => (a.order || 99) - (b.order || 99));
                    await this.saveRoles(roles);
                }
            } else {
                // Primeira inicialização no banco
                roles = [...SYSTEM_DEFAULT_ROLES];
                await this.saveRoles(roles);
            }

            roles.sort((a, b) => (a.order || 99) - (b.order || 99));
            cachedRoles = roles;
            lastFetchTime = now;
            return roles;
        } catch (err) {
            console.error('[congregationRoleService] Falha inesperada ao listar funções:', err);
            return SYSTEM_DEFAULT_ROLES;
        }
    },

    /**
     * Salva a lista de funções em app_settings.
     */
    async saveRoles(roles: CongregationRole[]): Promise<void> {
        cachedRoles = roles;
        lastFetchTime = Date.now();
        const { error } = await supabase
            .from('app_settings')
            .upsert({
                key: 'congregation_roles',
                value: roles as any,
            }, { onConflict: 'key' });

        if (error) {
            console.error('[congregationRoleService] Erro ao persistir funções:', error);
            throw error;
        }
    },

    /**
     * Adiciona uma nova função congregacional.
     */
    async createRole(newRole: Omit<CongregationRole, 'id' | 'order'>): Promise<CongregationRole> {
        const roles = await this.listRoles();
        const cleanName = newRole.name.trim();

        if (!cleanName) {
            throw new Error('O nome da função não pode estar vazio.');
        }

        const exists = roles.some(r => r.name.toLowerCase() === cleanName.toLowerCase());
        if (exists) {
            throw new Error(`Já existe uma função chamada "${cleanName}".`);
        }

        const id = cleanName
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '') || `role_${Date.now()}`;

        const maxOrder = roles.reduce((acc, r) => Math.max(acc, r.order || 0), 0);
        const role: CongregationRole = {
            id,
            name: cleanName,
            description: newRole.description?.trim() || '',
            allowedConditions: newRole.allowedConditions.length > 0 ? newRole.allowedConditions : ['Ancião'],
            isSystemDefault: false,
            order: maxOrder + 10,
        };

        const updated = [...roles, role];
        await this.saveRoles(updated);
        return role;
    },

    /**
     * Atualiza uma função existente.
     */
    async updateRole(id: string, updates: Partial<Omit<CongregationRole, 'id' | 'isSystemDefault'>>): Promise<void> {
        const roles = await this.listRoles();
        const idx = roles.findIndex(r => r.id === id);
        if (idx === -1) throw new Error('Função não encontrada.');

        const existing = roles[idx];
        const newName = updates.name !== undefined ? updates.name.trim() : existing.name;

        if (!newName) throw new Error('O nome da função não pode estar vazio.');

        // Verifica duplicação de nome
        const duplicate = roles.some(r => r.id !== id && r.name.toLowerCase() === newName.toLowerCase());
        if (duplicate) throw new Error(`Já existe outra função chamada "${newName}".`);

        roles[idx] = {
            ...existing,
            name: newName,
            description: updates.description !== undefined ? updates.description.trim() : existing.description,
            allowedConditions: updates.allowedConditions !== undefined ? updates.allowedConditions : existing.allowedConditions,
            order: updates.order !== undefined ? updates.order : existing.order,
        };

        await this.saveRoles(roles);
    },

    /**
     * Exclui uma função (funções padrão do sistema não podem ser excluídas).
     */
    async deleteRole(id: string): Promise<void> {
        const roles = await this.listRoles();
        const target = roles.find(r => r.id === id);
        if (!target) return;

        if (target.isSystemDefault) {
            throw new Error('Funções padrão do sistema não podem ser excluídas.');
        }

        const filtered = roles.filter(r => r.id !== id);
        await this.saveRoles(filtered);
    },

    /**
     * Retorna as funções elegíveis para a condição e gênero informados.
     * Regra: Funções congregacionais são designadas para irmãos homens.
     */
    async getEligibleRoles(condition: string | null | undefined, gender: string | null | undefined): Promise<CongregationRole[]> {
        if (gender === 'sister') return [];
        const allRoles = await this.listRoles();

        const normalizedCondition = condition === 'Anciao' ? 'Ancião' : condition;
        if (!normalizedCondition) return [];

        return allRoles.filter(role => role.allowedConditions.includes(normalizedCondition as any));
    },

    /**
     * Localiza os telefones dos irmãos designados como "Responsável pelo Quadro de Anúncios".
     */
    getQuadroAnunciosPhones(publishers: Publisher[]): string[] {
        const roleName = 'Responsável pelo Quadro de Anúncios';
        const matches = (publishers || []).filter(p => {
            if (p.isServing === false || (p as any).active === false) return false;
            const pFuncao = p.funcao || (p as any).data?.funcao;
            return pFuncao === roleName || pFuncao === 'Responsável pelo Quadro de Anúncios';
        });

        const phones = matches
            .map(p => p.phone || (p as any).data?.phone || (p as any).data?.contact_phone)
            .filter((ph): ph is string => typeof ph === 'string' && ph.trim().length > 0);

        return Array.from(new Set(phones));
    },

    /**
     * Sincroniza e garante o ID do grupo Z-API entre settings e app_settings.
     */
    async ensureGroupSettingsSynced(): Promise<string | null> {
        try {
            const [settRes, appSettRes] = await Promise.all([
                supabase.from('settings').select('value').eq('key', 'zapi_group_id').maybeSingle(),
                supabase.from('app_settings').select('value').eq('key', 'zapi_group_id').maybeSingle(),
            ]);

            const sVal = typeof settRes.data?.value === 'string' ? settRes.data.value.trim() : '';
            const asVal = typeof appSettRes.data?.value === 'string' ? appSettRes.data.value.trim() : '';

            const canonicalGroup = sVal || asVal || null;

            if (canonicalGroup) {
                if (sVal !== canonicalGroup) {
                    await supabase.from('settings').upsert({ key: 'zapi_group_id', value: canonicalGroup as any }, { onConflict: 'key' });
                }
                if (asVal !== canonicalGroup) {
                    await supabase.from('app_settings').upsert({ key: 'zapi_group_id', value: canonicalGroup as any }, { onConflict: 'key' });
                }
            }

            return canonicalGroup;
        } catch (err) {
            console.warn('[congregationRoleService] Falha ao sincronizar zapi_group_id:', err);
            return null;
        }
    }
};
