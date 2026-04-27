/**
 * E2E Agent Test — semana 2026-05-11
 *
 * Encena o ciclo completo:
 *   USER (você) → AGENT (LLM) → JSON action → AgentActionService → Supabase
 *
 * Para cada passo, faz SELECT direto no Supabase e imprime evidência.
 *
 * Run:
 *   cd rvm-designacoes-unified
 *   node --import tsx scripts/e2e-agent-test.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Reuso direto dos serviços do app (MESMO motor que o agente usa em produção).
import { generationService } from '../src/services/generationService';
import type { Publisher, WorkbookPart, HistoryRecord } from '../src/types';
import { HistoryStatus } from '../src/types';

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no .env.local');
    process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// Cenário
// ---------------------------------------------------------------------------
const TARGET_WEEK = '2026-05-11';

// Cores ANSI mínimas
const c = {
    g: (s: string) => `\x1b[32m${s}\x1b[0m`,
    r: (s: string) => `\x1b[31m${s}\x1b[0m`,
    y: (s: string) => `\x1b[33m${s}\x1b[0m`,
    b: (s: string) => `\x1b[34m${s}\x1b[0m`,
    bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
    dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

const banner = (title: string) => {
    const line = '═'.repeat(78);
    console.log('\n' + c.b(line));
    console.log(c.b('║ ') + c.bold(title));
    console.log(c.b(line));
};

// ---------------------------------------------------------------------------
// Mapeamento snake_case → camelCase
// ---------------------------------------------------------------------------
function rowToWorkbookPart(row: any): WorkbookPart {
    return {
        id: row.id,
        weekId: row.week_id,
        weekDisplay: row.week_display,
        date: row.date,
        section: row.section,
        tipoParte: row.tipo_parte,
        modalidade: row.modalidade,
        tituloParte: row.part_title,
        descricaoParte: row.descricao,
        detalhesParte: row.detalhes_parte,
        seq: row.seq,
        funcao: row.funcao,
        duracao: row.duracao,
        horaInicio: row.hora_inicio,
        horaFim: row.hora_fim,
        rawPublisherName: row.raw_publisher_name,
        resolvedPublisherName: row.resolved_publisher_name,
        resolvedPublisherId: row.resolved_publisher_id,
        status: row.status,
        batch_id: row.batch_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    } as WorkbookPart;
}

function rowToPublisher(row: any): Publisher {
    // No Supabase, publishers tem schema { id, data: jsonb, created_at }.
    // O objeto Publisher real está em row.data (em camelCase).
    const d = row.data || row;
    return {
        id: d.id ?? row.id,
        name: d.name,
        gender: d.gender,
        condition: d.condition,
        funcao: d.funcao,
        phone: d.phone || '',
        email: d.email,
        isBaptized: d.isBaptized,
        isServing: d.isServing,
        ageGroup: d.ageGroup,
        parentIds: d.parentIds || [],
        isHelperOnly: d.isHelperOnly,
        canPairWithNonParent: d.canPairWithNonParent,
        privileges: d.privileges || {},
        privilegesBySection: d.privilegesBySection || {},
        availability: d.availability || { mode: 'always', exceptionDates: [] },
        aliases: d.aliases || [],
        isNotQualified: d.isNotQualified,
        requestedNoParticipation: d.requestedNoParticipation,
    } as Publisher;
}

function partToHistoryRecord(p: WorkbookPart): HistoryRecord {
    return {
        id: p.id,
        weekId: p.weekId,
        weekDisplay: p.weekDisplay,
        date: p.date,
        section: p.section,
        tipoParte: p.tipoParte,
        modalidade: p.modalidade,
        tituloParte: p.tituloParte,
        descricaoParte: p.descricaoParte,
        detalhesParte: p.detalhesParte,
        seq: p.seq,
        funcao: p.funcao as 'Titular' | 'Ajudante',
        duracao: parseInt(String(p.duracao || '0')) || 0,
        horaInicio: p.horaInicio,
        horaFim: p.horaFim,
        rawPublisherName: p.rawPublisherName,
        resolvedPublisherName: p.resolvedPublisherName,
        status: HistoryStatus.APPROVED,
        importSource: 'Excel',
        importBatchId: (p as any).batch_id || '',
        createdAt: p.createdAt || new Date().toISOString(),
        updatedAt: p.updatedAt || new Date().toISOString(),
    } as HistoryRecord;
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------
async function fetchAllPaginated<T>(table: string, columns = '*'): Promise<T[]> {
    const out: T[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
        const { data, error } = await sb.from(table).select(columns).range(from, from + PAGE - 1);
        if (error) throw new Error(`SELECT ${table}: ${error.message}`);
        if (!data || data.length === 0) break;
        out.push(...(data as T[]));
        if (data.length < PAGE) break;
        from += PAGE;
    }
    return out;
}

async function selectWeek(weekId: string): Promise<WorkbookPart[]> {
    const { data, error } = await sb
        .from('workbook_parts')
        .select('*')
        .eq('week_id', weekId)
        .order('seq', { ascending: true });
    if (error) throw new Error(`SELECT week: ${error.message}`);
    return (data || []).map(rowToWorkbookPart);
}

async function loadPublishers(): Promise<Publisher[]> {
    const rows = await fetchAllPaginated<any>('publishers');
    return rows.map(rowToPublisher);
}

async function loadHistoryFromAllParts(): Promise<HistoryRecord[]> {
    const rows = await fetchAllPaginated<any>('workbook_parts');
    return rows
        .map(rowToWorkbookPart)
        .filter(p => p.resolvedPublisherName || p.rawPublisherName)
        .map(partToHistoryRecord);
}

// ---------------------------------------------------------------------------
// Pretty-print
// ---------------------------------------------------------------------------
function printWeek(label: string, parts: WorkbookPart[]) {
    console.log(c.dim(`\n  [${label}] ${parts.length} partes da semana ${TARGET_WEEK}`));
    const assigned = parts.filter(p => p.resolvedPublisherName || p.rawPublisherName);
    console.log(c.dim(`  Atribuídas: ${assigned.length} | Vazias: ${parts.length - assigned.length}`));
    console.log('');
    for (const p of parts) {
        const who = p.resolvedPublisherName || p.rawPublisherName || c.r('— vazio —');
        const tag = (p.resolvedPublisherName || p.rawPublisherName) ? c.g('●') : c.r('○');
        console.log(`  ${tag} ${String(p.seq).padStart(2)} ${(p.tipoParte || '').padEnd(28)} ${(p.funcao || '').padEnd(8)} → ${who}  ${c.dim('[' + p.status + ']')}`);
    }
}

// ---------------------------------------------------------------------------
// Parser do agente (mesma regex do agentActionService.detectAllActions)
// ---------------------------------------------------------------------------
interface AgentAction { type: string; params: any; description?: string; }

function detectAllActions(responseContent: string): AgentAction[] {
    const actions: AgentAction[] = [];
    const blockRegex = /```json\s*([\s\S]*?)\s*```/g;
    let m: RegExpExecArray | null;
    while ((m = blockRegex.exec(responseContent)) !== null) {
        try {
            const data = JSON.parse(m[1]);
            if (data.type) actions.push({ type: data.type, params: data.params || {}, description: data.description });
        } catch (e) {
            console.warn('parse fail:', e);
        }
    }
    return actions;
}

// ---------------------------------------------------------------------------
// Atores
// ---------------------------------------------------------------------------
function userSays(text: string) {
    console.log('\n' + c.bold(c.y('👤 USER:')) + ' ' + text);
}
function agentSays(text: string) {
    console.log('\n' + c.bold(c.b('🤖 AGENT:')) + '\n' + text);
}
function systemSays(text: string) {
    console.log('\n' + c.dim('⚙️  SYSTEM: ' + text));
}

// ---------------------------------------------------------------------------
// Executor das actions (espelha agentActionService + workbookManagementService)
// ---------------------------------------------------------------------------
async function execClearWeek(weekId: string) {
    const parts = await selectWeek(weekId);
    const toClean = parts.filter(p => p.resolvedPublisherName || p.resolvedPublisherId || p.rawPublisherName);
    if (toClean.length === 0) {
        return { clearedCount: 0, message: 'Nada para limpar.' };
    }
    // Mesmo UPDATE que workbookManagementServiceCore.clearWeek faz no fallback:
    // resolved_publisher_name='', resolved_publisher_id=null, raw_publisher_name='', status='PENDENTE'
    const ids = toClean.map(p => p.id);
    const { error } = await sb
        .from('workbook_parts')
        .update({
            resolved_publisher_name: null,
            resolved_publisher_id: null,
            raw_publisher_name: null,
            status: 'PENDENTE',
            updated_at: new Date().toISOString(),
        })
        .in('id', ids);
    if (error) throw new Error(`UPDATE clear: ${error.message}`);
    return { clearedCount: toClean.length, message: `${toClean.length} designações removidas.` };
}

async function execGenerateWeek(weekId: string, _parts: WorkbookPart[], publishers: Publisher[]) {
    // Carrega TODAS as partes (motor precisa de history + contexto), filtra pela semana via config.
    const allRows = await fetchAllPaginated<any>('workbook_parts');
    const allParts = allRows.map(rowToWorkbookPart);

    // Chama o MESMO motor que o agente em produção usa (caminho E já corrigido).
    const result = await generationService.generateDesignations(allParts, publishers, {
        generationWeeks: [weekId],
        isDryRun: false,
    });
    return {
        partsGenerated: result.partsGenerated,
        total: _parts.filter(p => p.funcao === 'Titular' || p.funcao === 'Ajudante').length,
        message: result.message,
        errors: result.errors,
        warnings: result.warnings,
    };
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main() {
    banner(`E2E AGENT TEST — semana ${TARGET_WEEK}`);
    console.log(c.dim(`Supabase: ${SUPABASE_URL}`));

    // ============ PASSO 0: ESTADO INICIAL ============
    banner('PASSO 0 — Estado inicial do BD (SELECT direto)');
    let parts0 = await selectWeek(TARGET_WEEK);
    if (parts0.length === 0) {
        console.log(c.r(`Semana ${TARGET_WEEK} não existe no BD. Abortando.`));
        process.exit(2);
    }
    printWeek('ANTES', parts0);

    // ============ PASSO 1: USER PEDE LIMPEZA ============
    banner(`PASSO 1 — Usuário pede para limpar a semana ${TARGET_WEEK}`);
    userSays(`Limpe todas as designações da semana de 11 de maio de 2026.`);

    // O LLM retornaria algo assim:
    const agentResponse1 = `Claro! Vou limpar todas as designações da semana ${TARGET_WEEK}.

\`\`\`json
{
  "type": "CLEAR_WEEK",
  "params": { "weekId": "${TARGET_WEEK}" },
  "description": "Limpar designações da semana de 11 de maio"
}
\`\`\`
`;
    agentSays(agentResponse1);

    // ============ PASSO 2: PARSER DETECTA AÇÃO ============
    banner('PASSO 2 — agentActionService.detectAllActions parseia o bloco JSON');
    const actions1 = detectAllActions(agentResponse1);
    console.log(c.g(`  ✓ ${actions1.length} action(s) detectada(s)`));
    console.log('  ' + JSON.stringify(actions1[0], null, 2).split('\n').join('\n  '));

    // ============ PASSO 3: EXECUTA CLEAR_WEEK ============
    banner('PASSO 3 — Executa CLEAR_WEEK no Supabase');
    const r1 = await execClearWeek(TARGET_WEEK);
    systemSays(r1.message);

    // ============ PASSO 4: VERIFICA NO BD ============
    banner('PASSO 4 — VERIFICAÇÃO direta no BD pós-CLEAR');
    const parts1 = await selectWeek(TARGET_WEEK);
    printWeek('DEPOIS DE LIMPAR', parts1);

    const stillAssigned = parts1.filter(p => p.resolvedPublisherName || p.rawPublisherName);
    if (stillAssigned.length === 0) {
        console.log('\n' + c.g('  ✓ ZERAGEM CONFIRMADA: nenhuma parte tem publicador no BD.'));
    } else {
        console.log('\n' + c.r(`  ✗ FALHA: ${stillAssigned.length} parte(s) ainda atribuída(s)`));
        for (const p of stillAssigned) {
            console.log(c.r(`    • ${p.tipoParte}: ${p.resolvedPublisherName || p.rawPublisherName}`));
        }
    }

    // ============ PASSO 5: USER PEDE GERAÇÃO ============
    banner(`PASSO 5 — Usuário pede para designar a semana novamente`);
    userSays(`Agora gere as designações da semana ${TARGET_WEEK}.`);

    const agentResponse2 = `Vou gerar as designações da semana ${TARGET_WEEK} usando o motor unificado.

\`\`\`json
{
  "type": "GENERATE_WEEK",
  "params": { "weekId": "${TARGET_WEEK}" },
  "description": "Gerar designações da semana de 11 de maio"
}
\`\`\`
`;
    agentSays(agentResponse2);

    // ============ PASSO 6: PARSER ============
    banner('PASSO 6 — Parser detecta GENERATE_WEEK');
    const actions2 = detectAllActions(agentResponse2);
    console.log(c.g(`  ✓ ${actions2.length} action(s) detectada(s)`));
    console.log('  ' + JSON.stringify(actions2[0], null, 2).split('\n').join('\n  '));

    // ============ PASSO 7: EXECUTA GENERATE_WEEK ============
    banner('PASSO 7 — Executa GENERATE_WEEK (motor REAL: generationService)');
    systemSays('Carregando publishers...');
    const publishers = await loadPublishers();
    console.log(c.dim(`  Publishers: ${publishers.length}`));

    const r2 = await execGenerateWeek(TARGET_WEEK, parts1, publishers);
    systemSays(`${r2.partsGenerated}/${r2.total} partes designadas. ${r2.message || ''}`);
    if (r2.warnings && r2.warnings.length > 0) {
        console.log(c.y(`  ⚠ ${r2.warnings.length} warnings:`));
        for (const w of r2.warnings.slice(0, 10)) console.log(c.y(`    • ${w}`));
    }
    if (r2.errors && r2.errors.length > 0) {
        console.log(c.r(`  ✗ ${r2.errors.length} errors:`));
        for (const e of r2.errors) console.log(c.r(`    • ${e}`));
    }

    // ============ PASSO 8: VERIFICA NO BD ============
    banner('PASSO 8 — VERIFICAÇÃO direta no BD pós-GENERATE');
    const parts2 = await selectWeek(TARGET_WEEK);
    printWeek('DEPOIS DE GERAR', parts2);

    const newlyAssigned = parts2.filter(p => p.resolvedPublisherName || p.rawPublisherName);
    if (newlyAssigned.length > 0) {
        console.log('\n' + c.g(`  ✓ DESIGNAÇÃO CONFIRMADA: ${newlyAssigned.length} parte(s) atribuída(s) no BD.`));
    } else {
        console.log('\n' + c.r('  ✗ FALHA: nenhuma parte foi designada.'));
    }

    // ============ RESUMO ============
    banner('RESUMO');
    console.log(`  Estado inicial:    ${parts0.filter(p => p.resolvedPublisherName || p.rawPublisherName).length} atribuídas`);
    console.log(`  Após CLEAR_WEEK:   ${parts1.filter(p => p.resolvedPublisherName || p.rawPublisherName).length} atribuídas (esperado: 0)`);
    console.log(`  Após GENERATE:     ${parts2.filter(p => p.resolvedPublisherName || p.rawPublisherName).length} atribuídas`);
    console.log('');
}

main().catch(e => {
    console.error(c.r('\n💥 FATAL: '), e);
    process.exit(1);
});
