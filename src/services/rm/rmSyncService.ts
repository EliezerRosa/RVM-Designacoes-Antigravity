/**
 * rmSyncService.ts — Matching entre rm.publishers (Glide) e public.publishers (RVM)
 * e gestão de rm.publisher_sync_map. Também sugere líderes de grupo (Portal Sync Fase B).
 */

import { supabase } from '../../lib/supabase';
import { api } from '../api';
import { rmService, type RmPublisher } from './rmService';

const rm = () => supabase.schema('rm');

export type MatchStatus = 'auto' | 'admin-confirmed' | 'conflict' | 'unmatched';

export interface RmSyncMapRow {
    id: string;
    rm_publisher_id: string;
    rvm_publisher_id: string | null;
    match_status: MatchStatus;
    matched_name: string | null;
    rvm_funcao: string | null;
    matched_at: string | null;
    confirmed_by: string | null;
}

export interface LeaderSuggestion {
    publisher: RmPublisher;
    role: 'leader' | 'assistant';
    reason: string;
}

/** unaccent + lowercase + colapsa espaços (equivalente client-side de unaccent(lower())). */
export function normalizeName(raw: string): string {
    return (raw || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

const LEADER_FUNCS = ['servo de grupo', 'superintendente de grupo'];
const ASSISTANT_FUNCS = ['ajudante', 'superintendente ajudante do grupo', 'ajudante do grupo'];

export const rmSyncService = {
    async listSyncMap(): Promise<RmSyncMapRow[]> {
        const { data, error } = await rm().from('publisher_sync_map').select('*');
        if (error) throw error;
        return data ?? [];
    },

    /**
     * Auto-match: para cada rm.publisher, procura o publicador RVM de nome equivalente.
     * Grava sync_map com auto (1 match), conflict (>1) ou unmatched (0), capturando rvm_funcao.
     * Não sobrescreve linhas já 'admin-confirmed'.
     */
    async autoMatchAll(): Promise<{ auto: number; conflict: number; unmatched: number }> {
        const [rmPubs, rvmPubs, existing] = await Promise.all([
            rmService.listPublishers(),
            api.loadPublishers(),
            this.listSyncMap(),
        ]);

        const confirmedIds = new Set(
            existing.filter(r => r.match_status === 'admin-confirmed').map(r => r.rm_publisher_id),
        );

        // Índice de RVM por nome normalizado
        const rvmByName = new Map<string, { id: string; name: string; funcao: string | null }[]>();
        for (const p of rvmPubs) {
            const key = normalizeName(p.name);
            if (!key) continue;
            const bucket = rvmByName.get(key) ?? [];
            bucket.push({ id: p.id, name: p.name, funcao: p.funcao ?? null });
            rvmByName.set(key, bucket);
        }

        const counts = { auto: 0, conflict: 0, unmatched: 0 };
        const rows: Partial<RmSyncMapRow>[] = [];

        for (const rp of rmPubs) {
            if (confirmedIds.has(rp.id)) continue;
            const matches = rvmByName.get(normalizeName(rp.name)) ?? [];
            let status: MatchStatus;
            let rvmId: string | null = null;
            let matchedName: string | null = null;
            let rvmFuncao: string | null = null;

            if (matches.length === 1) {
                status = 'auto';
                rvmId = matches[0].id;
                matchedName = matches[0].name;
                rvmFuncao = matches[0].funcao;
                counts.auto++;
            } else if (matches.length > 1) {
                status = 'conflict';
                counts.conflict++;
            } else {
                status = 'unmatched';
                counts.unmatched++;
            }

            rows.push({
                rm_publisher_id: rp.id,
                rvm_publisher_id: rvmId,
                match_status: status,
                matched_name: matchedName,
                rvm_funcao: rvmFuncao,
                matched_at: status === 'auto' ? new Date().toISOString() : null,
            });
        }

        if (rows.length > 0) {
            const { error } = await rm().from('publisher_sync_map')
                .upsert(rows, { onConflict: 'rm_publisher_id' });
            if (error) throw error;
        }
        return counts;
    },

    async confirmMatch(rmPublisherId: string, rvmPublisherId: string, matchedName: string): Promise<void> {
        const { error } = await rm().from('publisher_sync_map')
            .update({
                rvm_publisher_id: rvmPublisherId,
                matched_name: matchedName,
                match_status: 'admin-confirmed',
                matched_at: new Date().toISOString(),
            })
            .eq('rm_publisher_id', rmPublisherId);
        if (error) throw error;
    },

    async clearMatch(rmPublisherId: string): Promise<void> {
        const { error } = await rm().from('publisher_sync_map')
            .update({ rvm_publisher_id: null, matched_name: null, match_status: 'unmatched', matched_at: null })
            .eq('rm_publisher_id', rmPublisherId);
        if (error) throw error;
    },

    /**
     * Fase B: sugere líder/ajudante para um grupo a partir da funcao (Glide) dos
     * publicadores do próprio grupo.
     */
    async suggestLeaders(groupId: string): Promise<LeaderSuggestion[]> {
        const pubs = await rmService.listPublishers();
        const groupPubs = pubs.filter(p => p.current_group_id === groupId);
        const out: LeaderSuggestion[] = [];
        for (const p of groupPubs) {
            const f = normalizeName(p.funcao ?? '');
            if (LEADER_FUNCS.some(k => f.includes(k))) {
                out.push({ publisher: p, role: 'leader', reason: `funcao: ${p.funcao}` });
            } else if (ASSISTANT_FUNCS.some(k => f.includes(k))) {
                out.push({ publisher: p, role: 'assistant', reason: `funcao: ${p.funcao}` });
            }
        }
        return out;
    },
};
