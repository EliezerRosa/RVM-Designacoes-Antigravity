/**
 * Simula o agente-chat respondendo: "Qual o score do Diego Resmann?"
 *
 * Reproduz exatamente o caminho B (CHECK_SCORE) do agentActionService:
 *   USER → "qual o score do Diego Resmann?"
 *   AGENT → emite { type: 'CHECK_SCORE', params: { partType, date } }
 *   AgentActionService.execute → carrega contexto → ranked = getRankedCandidates(...)
 *   → resposta formatada
 *
 * Run: node --import tsx scripts/agent-check-score.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getRankedCandidates, explainScoreForAgent } from '../src/services/unifiedRotationService';
import { checkEligibility, buildEligibilityContext } from '../src/services/eligibilityService';
import { isBlocked } from '../src/services/cooldownService';
import { EnumFuncao } from '../src/types';
import type { Publisher, WorkbookPart, HistoryRecord } from '../src/types';
import { HistoryStatus } from '../src/types';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const TARGET_NAME = 'Diego Resmann';
const TARGET_WEEK = '2026-05-11';

// Permite override via CLI: --part="Presidente da Reunião" --top=5
const cli = Object.fromEntries(
    process.argv.slice(2).map(a => {
        const m = a.match(/^--([^=]+)=(.*)$/);
        return m ? [m[1], m[2]] : [a, true];
    })
);
const PART_OVERRIDE = (cli.part as string) || '';
const TOP_N = Number(cli.top) || 10;

// ---- mappers (mesmos do e2e-agent-test) -----------------------------------
function rowToWorkbookPart(row: any): WorkbookPart {
    return {
        id: row.id, weekId: row.week_id, weekDisplay: row.week_display, date: row.date,
        section: row.section, tipoParte: row.tipo_parte, modalidade: row.modalidade,
        tituloParte: row.part_title, descricaoParte: row.descricao, detalhesParte: row.detalhes_parte,
        seq: row.seq, funcao: row.funcao, duracao: row.duracao,
        horaInicio: row.hora_inicio, horaFim: row.hora_fim,
        rawPublisherName: row.raw_publisher_name, resolvedPublisherName: row.resolved_publisher_name,
        resolvedPublisherId: row.resolved_publisher_id, status: row.status,
        batch_id: row.batch_id, createdAt: row.created_at, updatedAt: row.updated_at,
    } as WorkbookPart;
}
function rowToPublisher(row: any): Publisher {
    const d = row.data || row;
    return {
        id: d.id ?? row.id, name: d.name, gender: d.gender, condition: d.condition,
        funcao: d.funcao, phone: d.phone || '', email: d.email,
        isBaptized: d.isBaptized, isServing: d.isServing, ageGroup: d.ageGroup,
        parentIds: d.parentIds || [], isHelperOnly: d.isHelperOnly,
        canPairWithNonParent: d.canPairWithNonParent,
        privileges: d.privileges || {}, privilegesBySection: d.privilegesBySection || {},
        availability: d.availability || { mode: 'always', exceptionDates: [] },
        aliases: d.aliases || [], isNotQualified: d.isNotQualified,
        requestedNoParticipation: d.requestedNoParticipation,
    } as Publisher;
}
function partToHistoryRecord(p: WorkbookPart): HistoryRecord {
    return {
        id: p.id, weekId: p.weekId, weekDisplay: p.weekDisplay, date: p.date,
        section: p.section, tipoParte: p.tipoParte, modalidade: p.modalidade,
        tituloParte: p.tituloParte, descricaoParte: p.descricaoParte, detalhesParte: p.detalhesParte,
        seq: p.seq, funcao: p.funcao as 'Titular' | 'Ajudante',
        duracao: parseInt(String(p.duracao || '0')) || 0,
        horaInicio: p.horaInicio, horaFim: p.horaFim,
        rawPublisherName: p.rawPublisherName, resolvedPublisherName: p.resolvedPublisherName,
        status: HistoryStatus.APPROVED, importSource: 'Excel',
        importBatchId: (p as any).batch_id || '',
        createdAt: p.createdAt || new Date().toISOString(),
        updatedAt: p.updatedAt || new Date().toISOString(),
    } as HistoryRecord;
}

async function fetchAll<T>(table: string): Promise<T[]> {
    const out: T[] = []; let from = 0; const PAGE = 1000;
    while (true) {
        const { data, error } = await sb.from(table).select('*').range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;
        out.push(...(data as T[]));
        if (data.length < PAGE) break;
        from += PAGE;
    }
    return out;
}

const c = {
    g: (s: string) => `\x1b[32m${s}\x1b[0m`,
    r: (s: string) => `\x1b[31m${s}\x1b[0m`,
    y: (s: string) => `\x1b[33m${s}\x1b[0m`,
    b: (s: string) => `\x1b[34m${s}\x1b[0m`,
    bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
    dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

async function main() {
    console.log(c.b('═'.repeat(78)));
    if (PART_OVERRIDE) {
        console.log(c.bold('║ USER (chat): ') + `"top ${TOP_N} de score para ${PART_OVERRIDE}"`);
    } else {
        console.log(c.bold('║ USER (chat): ') + `"qual o score do ${TARGET_NAME}?"`);
    }
    console.log(c.b('═'.repeat(78)));

    // 1) Carrega contexto (igual o app: publishers, parts, history)
    const [partRows, pubRows] = await Promise.all([
        fetchAll<any>('workbook_parts'),
        fetchAll<any>('publishers'),
    ]);
    const allParts = partRows.map(rowToWorkbookPart);
    const publishers = pubRows.map(rowToPublisher);
    const history = allParts
        .filter(p => p.resolvedPublisherName || p.rawPublisherName)
        .map(partToHistoryRecord);

    console.log(c.dim(`\n[ctx] publishers=${publishers.length} parts=${allParts.length} history=${history.length}`));

    // ── Caminho 1: usuário pediu uma PARTE específica (top N) ──────────────
    if (PART_OVERRIDE) {
        // Reproduz EXATAMENTE o handler CHECK_SCORE pós-fix do agentActionService.
        const MODALIDADE_ALIASES: Record<string, string> = {
            'Presidente': 'Presidência',
            'Presidente da Reunião': 'Presidência',
            'Presidente da Reuniao': 'Presidência',
            'Comentários Iniciais': 'Presidência',
            'Comentarios Iniciais': 'Presidência',
            'Comentários Finais': 'Presidência',
            'Comentarios Finais': 'Presidência',
            'Oração': 'Oração',
            'Oração Inicial': 'Oração',
            'Oração Final': 'Oração',
            'Discurso na Tesouros': 'Discurso de Ensino',
            'Discurso Tesouros': 'Discurso de Ensino',
            'Joias Espirituais': 'Discurso de Ensino',
            'Parte na Vida Cristã': 'Discurso de Ensino',
            'Elogios e Conselhos': 'Aconselhamento',
            'Leitura da Bíblia': 'Leitura de Estudante',
            'Leitura': 'Leitura de Estudante',
            'Iniciando Conversas': 'Demonstração',
            'Cultivando o Interesse': 'Demonstração',
            'Fazendo Discípulos': 'Demonstração',
            'Iniciando Conversas (Ajudante)': 'Demonstração',
            'Cultivando o Interesse (Ajudante)': 'Demonstração',
            'Fazendo Discípulos (Ajudante)': 'Demonstração',
            'Discurso': 'Discurso de Estudante',
            'Estudo Bíblico': 'Demonstração',
            'Primeira Conversa': 'Demonstração',
            'Revisita': 'Demonstração',
            'Dirigente do EBC': 'Dirigente de EBC',
            'Dirigente EBC': 'Dirigente de EBC',
            'Leitor do EBC': 'Leitor de EBC',
            'Leitor EBC': 'Leitor de EBC',
            'Necessidades Locais': 'Necessidades Locais',
        };
        const resolvedModalidade = MODALIDADE_ALIASES[PART_OVERRIDE] || PART_OVERRIDE;

        const norm = (s: any) => String(s || '').toLowerCase().trim();
        const ptNorm = norm(PART_OVERRIDE);
        const targetPart = allParts.find(p => {
            const dateMatch = p.weekId === TARGET_WEEK || p.date === TARGET_WEEK;
            if (!dateMatch) return false;
            const tipo = norm(p.tipoParte);
            const titulo = norm(p.tituloParte);
            const mod = norm(p.modalidade);
            return tipo === ptNorm || titulo === ptNorm || mod === norm(resolvedModalidade)
                || tipo.includes(ptNorm) || ptNorm.includes(tipo) || titulo.includes(ptNorm);
        });
        const weekPartsCtx = targetPart ? allParts.filter(p => p.weekId === targetPart.weekId) : [];
        const eligCtx = targetPart ? buildEligibilityContext(targetPart, weekPartsCtx, publishers) : { date: TARGET_WEEK };
        const elegModalidade = (targetPart?.modalidade as any) || (resolvedModalidade as any);
        const elegFuncao = (targetPart?.funcao as any) || EnumFuncao.TITULAR;

        const action = { type: 'CHECK_SCORE', params: { partType: PART_OVERRIDE, date: TARGET_WEEK } };
        console.log(c.dim(`\n[AGENT JSON] ${JSON.stringify(action)}`));
        console.log(c.dim(`[resolve] modalidade="${elegModalidade}" funcao="${elegFuncao}" targetPart=${targetPart ? `"${targetPart.tipoParte}" (${targetPart.id.substring(0,8)})` : 'null'}`));

        const eligible = publishers.filter(p => checkEligibility(p, elegModalidade, elegFuncao, eligCtx).eligible);
        console.log(c.dim(`[elig] ${eligible.length}/${publishers.length} elegíveis`));

        if (eligible.length === 0) {
            console.log(c.r(`\n⚠️ Nenhum publicador elegível para ${PART_OVERRIDE}.`));
            process.exit(0);
        }

        const refDate = new Date(TARGET_WEEK + 'T12:00:00');
        const historyForScoring = targetPart ? history.filter(h => h.weekId !== targetPart.weekId) : history;
        const ranked = getRankedCandidates(eligible, PART_OVERRIDE, historyForScoring, undefined, refDate);
        const rankedWithCooldown = ranked.map(r => ({
            ...r, blocked: isBlocked(r.publisher.name, historyForScoring, refDate)
        }));
        const sorted = [
            ...rankedWithCooldown.filter(r => !r.blocked),
            ...rankedWithCooldown.filter(r => r.blocked),
        ];

        console.log('\n' + c.b('═'.repeat(78)));
        console.log(c.bold('║ AGENT (chat):'));
        console.log(c.b('═'.repeat(78)));
        console.log(`**Análise do Cérebro (Top ${TOP_N}):**`);
        console.log(`Para: ${PART_OVERRIDE} (Ref: ${TARGET_WEEK})\n`);
        sorted.slice(0, TOP_N).forEach((cand, i) => {
            const tag = cand.blocked ? c.y(' ⏸ (em cooldown)') : '';
            console.log(`  ${i + 1}. ${explainScoreForAgent(cand)}${tag}`);
        });
        return;
    }

    // ── Caminho 2 (default): foco no Diego Resmann ─────────────────────────

    // 2) Localiza Diego no diretório
    const diego = publishers.find(p => (p.name || '').toLowerCase().includes('diego resmann'));
    if (!diego) {
        console.log(c.r(`\nDiego Resmann não encontrado no diretório.`));
        process.exit(2);
    }
    console.log(c.g(`\n[match] ${diego.name} (id=${diego.id}, ${diego.gender}/${diego.condition})`));

    // 3) Localiza a parte que ele tem na semana alvo (pivot do CHECK_SCORE)
    const weekParts = allParts.filter(p => p.weekId === TARGET_WEEK);
    const diegoPart = weekParts.find(p =>
        (p.resolvedPublisherName || p.rawPublisherName || '').toLowerCase().includes('diego resmann')
    );
    if (!diegoPart) {
        console.log(c.y(`\nDiego não está designado em nenhuma parte na semana ${TARGET_WEEK}.`));
        process.exit(0);
    }

    console.log(c.g(`[match] parte = "${diegoPart.tipoParte}" (${diegoPart.funcao}) em ${diegoPart.date} [status=${diegoPart.status}]`));

    // 4) AGENT emite a action JSON
    const action = {
        type: 'CHECK_SCORE',
        params: { partType: diegoPart.tipoParte, date: diegoPart.weekId }
    };
    console.log(c.dim(`\n[AGENT JSON] ${JSON.stringify(action)}`));

    // 5) AgentActionService.executeAction → CHECK_SCORE (cópia fiel do switch)
    const targetPart = diegoPart;
    const weekPartsCtx = allParts.filter(p => p.weekId === targetPart.weekId);
    const eligCtx = buildEligibilityContext(targetPart, weekPartsCtx, publishers);
    const elegModalidade = (targetPart.modalidade as any) || (action.params.partType as any);
    const elegFuncao = (targetPart.funcao as any) || EnumFuncao.TITULAR;

    const eligible = publishers.filter(p =>
        checkEligibility(p, elegModalidade, elegFuncao, eligCtx).eligible
    );
    console.log(c.dim(`[elig] ${eligible.length}/${publishers.length} elegíveis para ${elegModalidade}/${elegFuncao}`));

    const refDateStr = targetPart.date || targetPart.weekId;
    const refDate = new Date(refDateStr + 'T12:00:00');
    const historyForScoring = history.filter(h => h.weekId !== targetPart.weekId);
    const ranked = getRankedCandidates(eligible, action.params.partType, historyForScoring, undefined, refDate);
    const rankedWithCooldown = ranked.map(r => ({
        ...r, blocked: isBlocked(r.publisher.name, historyForScoring, refDate)
    }));
    const sorted = [
        ...rankedWithCooldown.filter(r => !r.blocked),
        ...rankedWithCooldown.filter(r => r.blocked),
    ];

    // 6) Resposta do AGENT (mesmo formato da UI do chat)
    console.log('\n' + c.b('═'.repeat(78)));
    console.log(c.bold('║ AGENT (chat):'));
    console.log(c.b('═'.repeat(78)));
    console.log(`**Análise do Cérebro (Top 10):**`);
    console.log(`Para: ${action.params.partType} (Ref: ${action.params.date})\n`);
    sorted.slice(0, 10).forEach((cand, i) => {
        const tag = cand.blocked ? c.y(' ⏸ (em cooldown)') : '';
        const isDiego = cand.publisher.name === diego.name;
        const line = `${i + 1}. ${explainScoreForAgent(cand)}${tag}`;
        console.log(isDiego ? c.bold(c.g('▶ ' + line)) : '  ' + line);
    });

    // 7) Foco no Diego — extrai a posição e decomposição
    const diegoEntry = sorted.find(r => r.publisher.name === diego.name);
    const diegoIdx = sorted.findIndex(r => r.publisher.name === diego.name);
    console.log('\n' + c.b('─'.repeat(78)));
    if (diegoEntry) {
        console.log(c.bold(`FOCO — ${diego.name}`));
        console.log(`  • Posição no ranking: ${c.bold((diegoIdx + 1).toString())}/${sorted.length}`);
        console.log(`  • Score final:        ${c.bold(c.g(diegoEntry.scoreData.score.toString()))}`);
        console.log(`  • Decomposição:       ${diegoEntry.scoreData.explanation}`);
        console.log(`  • Cooldown ativo:     ${diegoEntry.blocked ? c.y('SIM') : c.g('não')}`);
    } else {
        console.log(c.r(`Diego não passou pelo filtro de elegibilidade!`));
    }
    console.log(c.b('─'.repeat(78)));
}

main().catch(e => { console.error(c.r('FATAL:'), e); process.exit(1); });
