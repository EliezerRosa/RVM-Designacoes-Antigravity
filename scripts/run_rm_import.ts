import { config } from 'dotenv';
config({ path: '.env.local' });
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const rm = () => supabase.schema('rm');

function normKey(s: string): string {
    return (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function normRow(row: Record<string, unknown>): Map<string, unknown> {
    const m = new Map<string, unknown>();
    for (const k of Object.keys(row)) m.set(normKey(k), row[k]);
    return m;
}
function pick(m: Map<string, unknown>, ...cands: string[]): unknown {
    for (const c of cands) {
        const v = m.get(normKey(c));
        if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return null;
}
function asBool(v: unknown): boolean { return ['true', 'sim', '1', 't', 'yes'].includes(String(v ?? '').trim().toLowerCase()); }
function asStr(v: unknown): string | null { if (v === null || v === undefined) return null; const s = String(v).trim(); return s === '' ? null : s; }
function asInt(v: unknown): number | null { if (v === null || v === undefined || String(v).trim() === '') return null; const n = parseInt(String(v), 10); return Number.isNaN(n) ? null : n; }
function asNum(v: unknown): number | null { if (v === null || v === undefined || String(v).trim() === '') return null; const n = Number(v); return Number.isNaN(n) ? null : n; }
function asISODate(v: unknown): string | null {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const raw = String(v).trim().split(' ')[0].split(',')[0];
    const parts = raw.split(/[/-]/);
    if (parts.length === 3) {
        let [a, b, c] = parts.map(x => parseInt(x, 10));
        if (String(parts[0]).length === 4) return `${a}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
        if (b > 12) { const t = a; a = b; b = t; }
        if (!a || !b || !c) return null;
        return `${c}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    }
    return null;
}
function asISODateTime(v: unknown): string | null {
    if (v instanceof Date) return v.toISOString();
    const d = asISODate(v);
    return d ? `${d}T00:00:00Z` : null;
}
function asModalities(v: unknown): string[] {
    if (!v) return [];
    return String(v).replace(/;/g, ',').split(',').map(s => s.trim()).filter(Boolean);
}

async function main() {
    console.log('Lendo arquivo Excel...');
    const buf = fs.readFileSync('C:\\Antigravity - RVM Designações\\Glide Apps\\Relatórios Glide.xlsx');
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
    
    const sheetByNorm = new Map(wb.SheetNames.map(n => [normKey(n), n]));
    const realSheet = sheetByNorm.get(normKey('Relatórios')) || sheetByNorm.get(normKey('Relatorios')) || sheetByNorm.get(normKey('Relatório'));
    if (!realSheet) throw new Error('Aba Relatórios não encontrada');
    
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[realSheet], { defval: null });
    const relRowsRaw = json.map(normRow);

    console.log('Carregando publicadores e congregações do banco (fallback)...');
    const [{ data: dbPubs, error: ePubs }, { data: dbCongs, error: eCongs }] = await Promise.all([
        rm().from('publishers').select('id, glide_id, congregation_id'),
        rm().from('congregations').select('id, glide_id'),
    ]);
    if (ePubs) throw ePubs;
    if (eCongs) throw eCongs;
    
    const pubMap = new Map<string, string>();
    const pubCong = new Map<string, string | null>();
    const congMap = new Map<string, string>();
    
    for (const r of (dbPubs ?? [])) {
        if (r.glide_id) pubMap.set(r.glide_id, r.id);
        pubCong.set(r.id, r.congregation_id);
    }
    for (const r of (dbCongs ?? [])) {
        if (r.glide_id) congMap.set(r.glide_id, r.id);
    }

    console.log('Processando relatórios...');
    const payload: Record<string, unknown>[] = [];
    let skipped = 0;
    for (const m of relRowsRaw) {
        const pubGid = asStr(pick(m, 'idPubEntrada'));
        const glideRowId = asStr(pick(m, 'Row ID', '🔒 Row ID'));
        const pubUuid = pubGid ? pubMap.get(pubGid) : null;
        const year = asInt(pick(m, 'Ano Ref', 'AnoRef'));
        const month = asInt(pick(m, 'MêsNum', 'MesNum'));
        
        if (!pubUuid || !glideRowId || year === null || month === null) {
            skipped++;
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
            late_consolidation_period: asStr(pick(m, 'AnoMêAtrasoSomar', 'AnoMesAtrasoSomar')),
            is_auxiliary_pioneer: asBool(pick(m, 'PioneiroAuxiliar')),
            is_regular_pioneer:  asBool(pick(m, 'PioneiroRegular')),
            is_special_pioneer:  asBool(pick(m, 'PioneiroEspecial')),
            glide_row_id: glideRowId,
            glide_congregation_id: congGid,
            ...(submitted ? { submitted_at: submitted } : {}),
        });
    }

    console.log('Deduplicando...');
    const dedupMap = new Map<string, Record<string, unknown>>();
    for (const row of payload) {
        const key = `${row.publisher_id}|${row.reference_year}|${row.reference_month}`;
        dedupMap.set(key, row);
    }
    const dedupedPayload = Array.from(dedupMap.values());

    console.log(`Inserindo/Atualizando ${dedupedPayload.length} relatórios (Ignorados: ${skipped})...`);
    for (let i = 0; i < dedupedPayload.length; i += 500) {
        const slice = dedupedPayload.slice(i, i + 500);
        const { error } = await rm().from('monthly_reports').upsert(slice, { onConflict: 'publisher_id,reference_year,reference_month' });
        if (error) throw error;
    }
    
    console.log('Concluído com sucesso!');
}

main().catch(console.error);
