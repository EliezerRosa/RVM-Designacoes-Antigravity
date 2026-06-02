/**
 * Harness determinístico — reproduz a resposta do Agente/Motor sobre Dayse Campos
 * SEM UI, usando as funções REAIS dos serviços + dados ao vivo do Supabase.
 *
 * Run: npx tsx scripts/_test_dayse.ts   (cwd = rvm-designacoes-unified)
 * Requer env SUPABASE_MCP_TOKEN no shell.
 */
import { isBlocked, getParticipationCategory, getBlockInfo, COOLDOWN_WEEKS } from '../src/services/cooldownService';
import { calculateScore } from '../src/services/unifiedRotationService';
import type { HistoryRecord, Publisher } from '../src/types';
import { HistoryStatus } from '../src/types';

const PROJECT_REF = 'pevstuyzlewvjidjkmea';
const TOKEN = process.env.SUPABASE_MCP_TOKEN;
const TARGET = 'Dayse Campos';

async function sql<T = any>(query: string): Promise<T[]> {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`SQL ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T[]>;
}

// Replica mapDbToWorkbookPart + workbookPartToHistoryRecord (historyAdapter)
function rowToHistory(row: Record<string, any>): HistoryRecord {
    return {
        id: row.id || '',
        weekId: row.week_id || '',
        weekDisplay: row.week_display || '',
        date: row.date || '',
        section: row.section || '',
        tipoParte: row.tipo_parte || '',
        modalidade: row.modalidade || 'Demonstração',
        tituloParte: row.part_title || '',
        descricaoParte: row.descricao || '',
        detalhesParte: row.detalhes_parte || row.detalhes || '',
        seq: row.seq || 0,
        funcao: (row.funcao || 'Titular') as 'Titular' | 'Ajudante',
        duracao: parseInt(row.duracao) || 0,
        horaInicio: row.hora_inicio || '',
        horaFim: row.hora_fim || '',
        rawPublisherName: row.raw_publisher_name || '',
        resolvedPublisherName: row.resolved_publisher_name || undefined,
        resolvedPublisherId: row.resolved_publisher_id || undefined,
        status: HistoryStatus.APPROVED,
        importSource: 'Excel',
        importBatchId: row.batch_id || '',
        createdAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || new Date().toISOString(),
    } as HistoryRecord;
}

const normLP = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const fmt = (s: string) => { try { return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return s; } };

async function main() {
    if (!TOKEN) throw new Error('SUPABASE_MCP_TOKEN ausente no env.');

    // 1) Publisher Dayse (jsonb data)
    const pubRows = await sql<any>(
        `SELECT id, data->>'name' AS name, data->>'gender' AS gender, data->>'condition' AS condition,
                data->>'isServing' AS is_serving, data->>'isHelperOnly' AS is_helper_only,
                data->>'requestedNoParticipation' AS req_no_part
         FROM publishers WHERE data->>'name' ILIKE '%Dayse%';`
    );
    const dayseRow = pubRows.find(r => normLP(r.name) === normLP(TARGET)) || pubRows[0];
    const dayse: Publisher = {
        id: dayseRow.id,
        name: dayseRow.name,
        gender: (dayseRow.gender || 'sister') as any,
    } as Publisher;

    // 2) Histórico em memória — EXATO filtro do loadCompletedParticipations:
    //    resolved (name OU id) não-nulo, date >= hoje - HISTORY_LOOKBACK_MONTHS(12m)
    const lookback = new Date();
    lookback.setMonth(lookback.getMonth() - 12);
    const lookbackStr = lookback.toISOString().slice(0, 10);
    const histRows = await sql<any>(
        `SELECT id, week_id, week_display, date, section, tipo_parte, modalidade, part_title,
                descricao, detalhes_parte, seq, funcao, duracao, hora_inicio, hora_fim,
                raw_publisher_name, resolved_publisher_name, resolved_publisher_id, status,
                batch_id, created_at, updated_at
         FROM workbook_parts
         WHERE (resolved_publisher_name IS NOT NULL OR resolved_publisher_id IS NOT NULL)
           AND date >= '${lookbackStr}'
         ORDER BY date ASC;`
    );
    const history: HistoryRecord[] = histRows.map(rowToHistory);

    console.log(`\n========== DADOS ==========`);
    console.log(`Publisher: id=${dayse.id} name="${dayse.name}" gender=${(dayse as any).gender}`);
    console.log(`Histórico total carregado (filtro app, 12m): ${history.length} registros`);

    // Linhas da Dayse (por id OU nome OU raw)
    const dayseHist = history.filter(h =>
        h.resolvedPublisherId === dayse.id ||
        normLP(h.resolvedPublisherName) === normLP(dayse.name) ||
        normLP(h.rawPublisherName) === normLP(dayse.name)
    );
    console.log(`\n--- Registros da Dayse no histórico (${dayseHist.length}) ---`);
    for (const h of dayseHist) {
        console.log(`  ${h.date} | ${h.tipoParte} | func=${h.funcao} | raw="${h.rawPublisherName}" | resName="${h.resolvedPublisherName ?? ''}" | rid=${h.resolvedPublisherId ?? ''}`);
    }

    // 3) QUERY_LAST_PARTICIPATION (replica EXATA do handler — agora casa por ID)
    const today = new Date().toISOString().slice(0, 10);
    const lastRecords = history
        .filter(h => h.resolvedPublisherId === dayse.id)
        .filter(h => (h.weekId || h.date || '') < today)
        .sort((a, b) => (b.weekId || b.date || '').localeCompare(a.weekId || a.date || ''));
    console.log(`\n========== QUERY_LAST_PARTICIPATION (handler do agente) ==========`);
    console.log(`Casamento do handler: por ID (resolvedPublisherId === pub.id)`);
    console.log(`Registros casados: ${lastRecords.length}`);
    if (lastRecords.length === 0) {
        console.log(`>> Resposta do agente: "Nenhum registro encontrado".`);
    } else {
        const last = lastRecords[0];
        console.log(`>> Última registrada: ${fmt(last.date)} — ${last.tituloParte || last.tipoParte} (${last.funcao})`);
        for (const r of lastRecords) console.log(`   - ${fmt(r.date)} | ${r.tituloParte || r.tipoParte} | ${r.funcao}`);
    }

    // 4) QUERY_COOLDOWN_STATUS + isBlocked REAL
    console.log(`\n========== QUERY_COOLDOWN_STATUS (handler + isBlocked real) ==========`);
    const refDate = today;
    const blocked = isBlocked(dayse.name, history, new Date(refDate + 'T12:00:00'), dayse.id);
    const category = getParticipationCategory; // ref só
    const blockInfo = getBlockInfo(dayse.name, history, new Date(refDate + 'T12:00:00'), dayse.id);
    console.log(`refDate=${refDate} | COOLDOWN_WEEKS=${COOLDOWN_WEEKS}`);
    console.log(`>> isBlocked (casa por ID): ${blocked ? '🔴 BLOQUEADO' : '🟢 LIVRE'}`);
    console.log(`>> getBlockInfo: ${blockInfo ? JSON.stringify({ inCooldown: blockInfo.isInCooldown, weeksSinceLast: blockInfo.weeksSinceLast, lastPartType: (blockInfo as any).lastPartType }) : 'null (nunca participou MAIN por nome)'}`);
    void category;

    // 5) DIAGNÓSTICO id-gap: a parte 2026-05-11 (helper, resName=null, rid=80)
    const idOnly = dayseHist.filter(h => (!h.resolvedPublisherName) && h.resolvedPublisherId === dayse.id);
    console.log(`\n========== DIAGNÓSTICO: partes resolvidas SÓ por id (invisíveis aos handlers por nome) ==========`);
    console.log(`Partes da Dayse com resName vazio mas rid=${dayse.id}: ${idOnly.length}`);
    for (const h of idOnly) console.log(`   - ${h.date} | ${h.tipoParte} | func=${h.funcao} | INVISÍVEL p/ QUERY_LAST/isBlocked, VISÍVEL p/ Motor (Option A)`);

    // 6) Motor — calculateScore real (usa Option A, casa por id também)
    console.log(`\n========== MOTOR calculateScore (Option A — casa por nome E id) ==========`);
    for (const pt of ['Iniciando Conversas', 'Cultivando o Interesse']) {
        const score = calculateScore(dayse, pt, history, new Date(refDate + 'T12:00:00'));
        console.log(`  partType="${pt}" => score=${score.score?.toFixed?.(1) ?? score.score} | recentCount=${(score as any).details?.recentCount} | timeBonus=${(score as any).details?.timeBonus?.toFixed?.(1)} | freqPenalty=${(score as any).details?.frequencyPenalty?.toFixed?.(1)}`);
    }

    // 7) ABA APOSTILA — lista para Dayse nas datas de designação dela (semana completa)
    const dates = [...new Set(dayseHist.map(h => h.date).filter(Boolean))].sort();
    console.log(`\n========== ABA APOSTILA — semanas das designações da Dayse ==========`);
    for (const d of dates) {
        const weekRows = await sql<any>(
            `SELECT date, week_id, tipo_parte, part_title, funcao, raw_publisher_name AS raw,
                    resolved_publisher_name AS res, resolved_publisher_id AS rid, status
             FROM workbook_parts WHERE date = '${d}' ORDER BY seq ASC;`
        );
        console.log(`\n--- Semana ${fmt(d)} (${d}) — ${weekRows.length} partes ---`);
        for (const r of weekRows) {
            const isDayse = r.rid === dayse.id || normLP(r.res) === normLP(dayse.name) || normLP(r.raw) === normLP(dayse.name);
            const mark = isDayse ? ' <<< DAYSE' : '';
            console.log(`  [${r.status}] ${r.tipo_parte} | ${r.part_title} | func=${r.funcao} | res="${r.res ?? ''}" rid=${r.rid ?? ''}${mark}`);
        }
    }

    console.log(`\n========== FIM ==========\n`);
}

main().catch(e => { console.error('ERRO:', e); process.exit(1); });
