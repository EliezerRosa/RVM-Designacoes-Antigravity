/**
 * Script pontual: ranqueia candidatos para "Dirigente EBC" na semana 2026-05-11
 * usando a MESMA fonte de histórico do Agente/App (historyAdapter -> workbook_parts).
 * Execução: npx tsx _score_check.ts
 */
import { createClient } from '@supabase/supabase-js';
import { calculateScore } from './src/services/unifiedRotationService';
import { updateRotationConfig } from './src/services/unifiedRotationService';
import type { Publisher, HistoryRecord } from './src/types';

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SUPABASE_ANON = 'sb_publishable_SObnBXFPKyoPO7-b4ldeqg_i2gpKOrv';
const TARGET_PART  = 'Dirigente EBC';
const TARGET_DATE  = '2026-05-11';
const TARGET_WEEKID = '2026-05-11';
const LOOKBACK_MONTHS = 12;

const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

async function loadHistoryFromWorkbookParts(): Promise<HistoryRecord[]> {
    const limitDate = new Date();
    limitDate.setMonth(limitDate.getMonth() - LOOKBACK_MONTHS);
    const dateStr = limitDate.toISOString().split('T')[0];

    const allRows: any[] = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
        const { data, error } = await sb
            .from('workbook_parts')
            .select('*')
            .not('resolved_publisher_name', 'is', null)
            .gte('date', dateStr)
            .order('date', { ascending: false })
            .range(from, from + pageSize - 1);

        if (error) {
            console.error('workbook_parts history:', error.message);
            return [];
        }

        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
    }

    return allRows.map((row: any) => ({
        id: row.id,
        weekId: row.week_id || '',
        weekDisplay: row.week_display || '',
        date: row.date || '',
        section: row.section || '',
        tipoParte: row.tipo_parte || '',
        modalidade: row.modalidade || '',
        tituloParte: row.part_title || '',
        descricaoParte: row.descricao || '',
        detalhesParte: row.detalhes_parte || row.detalhes || '',
        seq: row.seq || 0,
        funcao: row.funcao || 'Titular',
        duracao: parseInt(row.duracao) || 0,
        horaInicio: row.hora_inicio || '',
        horaFim: row.hora_fim || '',
        rawPublisherName: row.raw_publisher_name || '',
        resolvedPublisherName: row.resolved_publisher_name || '',
        status: 'APPROVED',
        importSource: 'WorkbookParts',
        importBatchId: row.batch_id || '',
        createdAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || new Date().toISOString(),
    } as HistoryRecord));
}

async function main() {
    // Alinha com a proposta nova registrada em memória (2026-05-15)
    // heavyProximityPenalty base 3500 em raio de 4 semanas.
    updateRotationConfig({ HEAVY_ROLE_BASE: 3500, HEAVY_ROLE_RADIUS: 4 });

    // ── 1. Publishers ativos
    const { data: pubRows, error: e1 } = await sb.from('publishers').select('data');
    if (e1) { console.error('publishers:', e1.message); process.exit(1); }

    const publishers: Publisher[] = (pubRows || [])
        .map((r: any) => r.data as Publisher)
        .filter((p: Publisher) => p.isServing !== false && !p.isNotQualified);

    // Elegíveis para Dirigente EBC: irmãos com canConductCBS
    const eligible = publishers.filter(p =>
        p.gender === 'brother' && p.privileges?.canConductCBS
    );

    // ── 2. Histórico (mesma tabela do Agente/App: workbook_parts)
    const history: HistoryRecord[] = await loadHistoryFromWorkbookParts();

    // Filtrar semana corrente para evitar loop de auto-referência
    const histForScoring = history.filter(h => h.weekId !== TARGET_WEEKID);

    const refDate = new Date(TARGET_DATE + 'T12:00:00');

    // ── 3. Calcular scores
    const results = eligible.map(pub => {
        const sd = calculateScore(pub, TARGET_PART, histForScoring, refDate);

        return { pub, sd };
    }).sort((a, b) => b.sd.score - a.sd.score);

    // ── 4. Imprimir
    console.log(`\n=== Candidatos para "${TARGET_PART}" — semana ${TARGET_DATE} ===\n`);
    console.log(`${'#'.padEnd(3)} ${'Nome'.padEnd(22)} ${'Score'.padStart(6)}  ${'Base'.padStart(5)} ${'Time'.padStart(5)} ${'Freq'.padStart(5)} ${'Heavy'.padStart(6)}  ${'Visual'.padEnd(8)}  Explicação`);
    console.log('-'.repeat(160));

    results.forEach(({ pub, sd }, i) => {
        const flag = sd.isInCooldown ? '⏳' : '  ';
        console.log(
            `${String(i+1).padEnd(3)} ${pub.name.padEnd(22)} ${String(sd.score).padStart(6)}  ` +
            `${String(sd.details.base).padStart(5)} ${String(sd.details.timeBonus).padStart(5)} ` +
            `${String(-sd.details.frequencyPenalty).padStart(5)} ${String(-sd.details.heavyProximityPenalty).padStart(6)}  ` +
            `${flag.padEnd(8)}  ${sd.explanation}`
        );
    });

    console.log(`\nTotal elegíveis: ${eligible.length} | Publishers ativos: ${publishers.length} | Histórico: ${history.length} registros\n`);
}

main().catch(console.error);
