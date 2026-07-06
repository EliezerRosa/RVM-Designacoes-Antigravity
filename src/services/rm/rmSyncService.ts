/**
 * rmSyncService.ts — Matching entre rm.publishers (Glide) e public.publishers (RVM)
 * e gestão de rm.publisher_sync_map. Também sugere líderes de grupo (Portal Sync Fase B).
 */

import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { api } from '../api';
import { rmService, type RmPublisher } from './rmService';

const rm = () => supabase.schema('rm');

// ===== Import MER-aware (ACL Glide -> rm.*) =====

export interface ImportSummary {
    congregations: number;
    groups: number;
    publishers: number;
    reports: number;
    leaders: number;
    skipped: number;
    sheetsFound: string[];
}

/** casefold + remove acentos + só alfanumérico (casa headers/abas do Glide robustamente). */
function normKey(s: string): string {
    return (s ?? '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

/** Converte uma linha (objeto por header) num Map de chave normalizada -> valor. */
function normRow(row: Record<string, unknown>): Map<string, unknown> {
    const m = new Map<string, unknown>();
    for (const k of Object.keys(row)) m.set(normKey(k), row[k]);
    return m;
}

/** Lê o primeiro candidato de coluna presente (por chave normalizada). */
function pick(m: Map<string, unknown>, ...cands: string[]): unknown {
    for (const c of cands) {
        const v = m.get(normKey(c));
        if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return null;
}

function asBool(v: unknown): boolean {
    return ['true', 'sim', '1', 't', 'yes'].includes(String(v ?? '').trim().toLowerCase());
}

function asStr(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
}

function asInt(v: unknown): number | null {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = parseInt(String(v), 10);
    return Number.isNaN(n) ? null : n;
}

function asNum(v: unknown): number | null {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
}

/** Data -> ISO yyyy-mm-dd. Aceita Date (SheetJS cellDates) ou string dd/mm/yyyy | yyyy-mm-dd. */
function asISODate(v: unknown): string | null {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const raw = String(v).trim().split(' ')[0].split(',')[0];
    const parts = raw.split(/[/-]/);
    if (parts.length === 3) {
        let [a, b, c] = parts.map(x => parseInt(x, 10));
        if (String(parts[0]).length === 4) return `${a}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
        if (b > 12) { const t = a; a = b; b = t; } // dd/mm vs mm/dd
        if (!a || !b || !c) return null;
        return `${c}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    }
    return null;
}

/** Data/hora -> ISO (timestamptz) ou null. */
function asISODateTime(v: unknown): string | null {
    if (v instanceof Date) return v.toISOString();
    const d = asISODate(v);
    return d ? `${d}T00:00:00Z` : null;
}

function asModalities(v: unknown): string[] {
    if (!v) return [];
    return String(v).replace(/;/g, ',').split(',').map(s => s.trim()).filter(Boolean);
}

function asGender(v: unknown): string | null {
    const s = asStr(v);
    if (!s) return null;
    const u = s.toUpperCase();
    return u.startsWith('M') ? 'M' : (u.startsWith('F') ? 'F' : null);
}

function asStatus(v: unknown): string | null {
    const s = normKey(String(v ?? ''));
    if (!s) return null;
    if (s.includes('quaseinativo')) return 'QUASE-INATIVO';
    for (const st of ['inativo', 'irregular', 'ativo']) {
        if (s.includes(st)) return st.toUpperCase();
    }
    return null;
}

/** Upsert em lotes de 500; devolve linhas com id + glide_id quando solicitado. */
async function upsertChunked(
    table: string,
    rows: Record<string, unknown>[],
    onConflict: string,
    returning: string,
): Promise<{ id: string; glide_id?: string; glide_row_id?: string }[]> {
    const out: { id: string; glide_id?: string; glide_row_id?: string }[] = [];
    for (let i = 0; i < rows.length; i += 500) {
        const slice = rows.slice(i, i + 500);
        const { data, error } = await rm().from(table).upsert(slice, { onConflict }).select(returning);
        if (error) throw error;
        if (data) out.push(...(data as { id: string; glide_id?: string; glide_row_id?: string }[]));
    }
    return out;
}

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
     * Importador MER-aware (ACL Glide -> rm.*). Aceita workbook .ods/.xlsx multi-aba
     * OU um CSV de entidade única. Detecta abas por nome, carrega em ordem de dependência
     * (Congregação -> Grupos -> PublicadorReal -> Relatórios) e faz upsert idempotente
     * por chave natural do Glide (glide_id / glide_row_id). Re-rodar é seguro e aditivo.
     */
    async importGlideWorkbook(
        file: File,
        onProgress?: (msg: string) => void,
    ): Promise<ImportSummary> {
        const log = (m: string) => onProgress?.(m);
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', cellDates: true });

        const sheetByNorm = new Map(wb.SheetNames.map(n => [normKey(n), n]));
        const getRows = (...cands: string[]): Map<string, unknown>[] | null => {
            for (const c of cands) {
                const real = sheetByNorm.get(normKey(c));
                if (real) {
                    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[real], { defval: null });
                    return json.map(normRow);
                }
            }
            return null;
        };

        const summary: ImportSummary = {
            congregations: 0, groups: 0, publishers: 0, reports: 0, leaders: 0, skipped: 0,
            sheetsFound: wb.SheetNames,
        };
        const congMap = new Map<string, string>();   // glide_id -> uuid
        const groupMap = new Map<string, string>();   // glide_id -> uuid
        const pubMap = new Map<string, string>();     // glide_id -> uuid
        const pubCong = new Map<string, string | null>(); // pub uuid -> cong uuid
        const groupLeaders = new Map<string, { leader: string | null; assistant: string | null }>(); // group uuid -> glide ids

        // 1) Congregações
        const congRows = getRows('Congregação', 'Congregacao', 'Congregações');
        if (congRows) {
            log('Importando congregações…');
            const payload = congRows
                .map(m => ({ glide_id: asStr(pick(m, 'id_Congregação', 'id_Congregacao', 'id')), name: asStr(pick(m, 'Nome', 'Congregação')), number: asStr(pick(m, 'Número', 'Numero')) }))
                .filter(r => r.glide_id && r.name);
            const res = await upsertChunked('congregations', payload, 'glide_id', 'id, glide_id');
            for (const r of res) if (r.glide_id) congMap.set(r.glide_id, r.id);
            summary.congregations = res.length;
        }

        // 2) Grupos (guarda glide ids de líder/ajudante p/ resolver após publicadores)
        const groupRows = getRows('Grupos', 'Grupo');
        if (groupRows) {
            log('Importando grupos…');
            const payload = groupRows.map(m => {
                const congGid = asStr(pick(m, 'fk_id_Congregação', 'fk_id_Congregacao'));
                return {
                    glide_id: asStr(pick(m, 'id_Grupo', 'id')),
                    congregation_id: congGid ? congMap.get(congGid) ?? null : null,
                    group_number: asInt(pick(m, 'Número', 'Numero')) ?? 0,
                    name: asStr(pick(m, 'Nome do Grupo', 'Nome')),
                    glide_leader_id: asStr(pick(m, 'id_SuperDeGrupo')),
                    glide_assistant_id: asStr(pick(m, 'id_SuperAJDeGrupo')),
                };
            }).filter(r => r.glide_id && r.congregation_id);
            const res = await upsertChunked('field_groups', payload, 'glide_id', 'id, glide_id');
            for (const r of res) if (r.glide_id) groupMap.set(r.glide_id, r.id);
            // registra glide ids de líder p/ 2ª passada
            for (const p of payload) {
                const uuid = p.glide_id ? groupMap.get(p.glide_id) : null;
                if (uuid) groupLeaders.set(uuid, { leader: p.glide_leader_id, assistant: p.glide_assistant_id });
            }
            summary.groups = res.length;
        }

        // 3) Publicadores — preferir aba PublicadorReal; senão derivar da aba Relatórios
        let pubRows = getRows('PublicadorReal', 'Publicador Real', 'Publicadores');
        const relRowsRaw = getRows('Relatórios', 'Relatorios', 'Relatório');
        if (!pubRows && relRowsRaw) {
            // deriva publicadores distintos a partir dos relatórios (colunas denormalizadas)
            const seen = new Set<string>();
            pubRows = [];
            for (const m of relRowsRaw) {
                const gid = asStr(pick(m, 'idPubEntrada'));
                if (gid && !seen.has(gid)) {
                    seen.add(gid);
                    pubRows.push(m);
                }
            }
        }
        if (pubRows) {
            log('Importando publicadores…');
            const payload = pubRows.map(m => {
                const congGid = asStr(pick(m, 'fk_id_Congregação', 'fk_id_Congregacao', 'id_Congregação Qdo Relatou'));
                const groupGid = asStr(pick(m, 'id_Grupo', 'GrupoAtual'));
                return {
                    glide_id: asStr(pick(m, 'id_Publicador', 'idPubEntrada')),
                    congregation_id: congGid ? congMap.get(congGid) ?? null : null,
                    current_group_id: groupGid ? groupMap.get(groupGid) ?? null : null,
                    name: asStr(pick(m, 'Nome Completo', 'NomeCompleto', 'Nome')),
                    gender: asGender(pick(m, 'Sexo')),
                    birth_date: asISODate(pick(m, 'Data de Nascimento', 'DataNascimento')),
                    funcao: asStr(pick(m, 'Função', 'Funcao', 'Privilégio', 'Privilegio')),
                    field_service_status: asStatus(pick(m, 'Status do Último Relatório', 'Status')),
                };
            }).filter(r => r.glide_id && r.name);
            const res = await upsertChunked('publishers', payload, 'glide_id', 'id, glide_id');
            for (const r of res) if (r.glide_id) pubMap.set(r.glide_id, r.id);
            for (const p of payload) {
                const uuid = p.glide_id ? pubMap.get(p.glide_id) : null;
                if (uuid) pubCong.set(uuid, p.congregation_id);
            }
            summary.publishers = res.length;
        }

        // 4) Resolver líderes de grupo (glide id -> pub uuid)
        if (groupLeaders.size > 0) {
            log('Resolvendo líderes de grupo…');
            for (const [groupId, gl] of groupLeaders) {
                const leader = gl.leader ? pubMap.get(gl.leader) ?? null : null;
                const assistant = gl.assistant ? pubMap.get(gl.assistant) ?? null : null;
                if (leader || assistant) {
                    const { error } = await rm().from('field_groups')
                        .update({ leader_id: leader, assistant_leader_id: assistant })
                        .eq('id', groupId);
                    if (error) throw error;
                    summary.leaders++;
                }
            }
        }

        // 5) Relatórios
        if (relRowsRaw) {
            log('Importando relatórios…');
            const payload: Record<string, unknown>[] = [];
            for (const m of relRowsRaw) {
                const pubGid = asStr(pick(m, 'idPubEntrada'));
                const glideRowId = asStr(pick(m, 'Row ID', '🔒 Row ID'));
                const pubUuid = pubGid ? pubMap.get(pubGid) : null;
                const year = asInt(pick(m, 'Ano Ref', 'AnoRef'));
                const month = asInt(pick(m, 'MêsNum', 'MesNum'));
                if (!pubUuid || !glideRowId || year === null || month === null) {
                    summary.skipped++;
                    continue;
                }
                const congGid = asStr(pick(m, 'id_Congregação Qdo Relatou'));
                const congUuid = (congGid ? congMap.get(congGid) : null) ?? pubCong.get(pubUuid) ?? null;
                const submitted = asISODateTime(pick(m, 'Data'));
                payload.push({
                    publisher_id: pubUuid,
                    congregation_id: congUuid,
                    congregation_at_time: asStr(pick(m, 'Congregação Quando Relatou')),
                    group_at_time: asStr(pick(m, 'Grupo')),
                    reference_year: year,
                    reference_month: month,
                    service_year: asInt(pick(m, 'AnoServiçoQdoRelatou')),
                    has_preached: asBool(pick(m, 'PregouSim')),
                    hours: asNum(pick(m, 'Horas')),
                    bible_studies: asInt(pick(m, 'Estudos')) ?? 0,
                    modalities: asModalities(pick(m, 'Modalidade')),
                    notes: asStr(pick(m, 'Obs')),
                    is_late_report: asBool(pick(m, 'RelAtrasado')),
                    late_consolidation_period: asStr(pick(m, 'AnoMêsAtrasoSomar')),
                    is_auxiliary_pioneer: asBool(pick(m, 'PioneiroAuxiliar')),
                    glide_row_id: glideRowId,
                    glide_congregation_id: congGid,
                    ...(submitted ? { submitted_at: submitted } : {}),
                });
            }
            const res = await upsertChunked('monthly_reports', payload, 'glide_row_id', 'id');
            summary.reports = res.length;
        }

        log('Concluído.');
        return summary;
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
