/**
 * Audita o risco do bug "alias inflado" em CHECK_SCORE para TODOS os tipoParte.
 *
 * Para cada tipoParte real da semana 2026-05-11, simula o agente emitindo:
 *   (a) o nome OFICIAL (tipoParte da BD)               → baseline correto
 *   (b) variantes informais que o LLM costuma gerar    → expõe inflação
 *
 * Compara o score do TOP-1 em cada caso. Se (b) >> (a), há bug latente.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getRankedCandidates } from '../src/services/unifiedRotationService';
import { checkEligibility, buildEligibilityContext } from '../src/services/eligibilityService';
import { EnumFuncao } from '../src/types';
import type { Publisher, WorkbookPart, HistoryRecord } from '../src/types';
import { HistoryStatus } from '../src/types';

const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const TARGET_WEEK = '2026-05-11';

// Mesmas funções do e2e-agent-test (compactado)
const rowToPart = (r: any): WorkbookPart => ({ id: r.id, weekId: r.week_id, weekDisplay: r.week_display, date: r.date, section: r.section, tipoParte: r.tipo_parte, modalidade: r.modalidade, tituloParte: r.part_title, descricaoParte: r.descricao, detalhesParte: r.detalhes_parte, seq: r.seq, funcao: r.funcao, duracao: r.duracao, horaInicio: r.hora_inicio, horaFim: r.hora_fim, rawPublisherName: r.raw_publisher_name, resolvedPublisherName: r.resolved_publisher_name, resolvedPublisherId: r.resolved_publisher_id, status: r.status, batch_id: r.batch_id, createdAt: r.created_at, updatedAt: r.updated_at } as any);
const rowToPub = (r: any): Publisher => { const d = r.data || r; return { id: d.id ?? r.id, name: d.name, gender: d.gender, condition: d.condition, funcao: d.funcao, phone: d.phone || '', email: d.email, isBaptized: d.isBaptized, isServing: d.isServing, ageGroup: d.ageGroup, parentIds: d.parentIds || [], isHelperOnly: d.isHelperOnly, canPairWithNonParent: d.canPairWithNonParent, privileges: d.privileges || {}, privilegesBySection: d.privilegesBySection || {}, availability: d.availability || { mode: 'always', exceptionDates: [] }, aliases: d.aliases || [], isNotQualified: d.isNotQualified, requestedNoParticipation: d.requestedNoParticipation } as any; };
const partToHist = (p: WorkbookPart): HistoryRecord => ({ id: p.id, weekId: p.weekId, weekDisplay: p.weekDisplay, date: p.date, section: p.section, tipoParte: p.tipoParte, modalidade: p.modalidade, tituloParte: p.tituloParte, descricaoParte: p.descricaoParte, detalhesParte: p.detalhesParte, seq: p.seq, funcao: p.funcao as any, duracao: parseInt(String(p.duracao || '0')) || 0, horaInicio: p.horaInicio, horaFim: p.horaFim, rawPublisherName: p.rawPublisherName, resolvedPublisherName: p.resolvedPublisherName, status: HistoryStatus.APPROVED, importSource: 'Excel', importBatchId: (p as any).batch_id || '', createdAt: p.createdAt, updatedAt: p.updatedAt } as any);

async function fetchAll(table: string) { const out: any[] = []; let from = 0; const PAGE = 1000; while (true) { const { data, error } = await sb.from(table).select('*').range(from, from + PAGE - 1); if (error) throw new Error(error.message); if (!data || data.length === 0) break; out.push(...data); if (data.length < PAGE) break; from += PAGE; } return out; }

// Variantes que o LLM provavelmente emite para cada tipoParte oficial.
const LLM_VARIANTS: Record<string, string[]> = {
    'Presidente': ['Presidente da Reunião', 'Presidência', 'presidente'],
    'Comentários Iniciais': ['Comentário Inicial', 'Abertura', 'comentarios iniciais'],
    'Discurso na Tesouros': ['Discurso Tesouros', 'Tesouros', 'Discurso da Tesouros'],
    'Joias Espirituais': ['Jóias Espirituais', 'Joias espirituais'],
    'Parte de Estudante': ['Leitura da Bíblia', 'Iniciando Conversas', 'Cultivando o Interesse', 'Fazendo Discípulos'],
    'Elogios e Conselhos': ['Elogios', 'Aconselhamento', 'Conselhos'],
    'Parte na Vida Cristã': ['Vida Cristã', 'Necessidades Locais', 'Estudo Bíblico'],
    'Dirigente do EBC': ['Dirigente EBC', 'Dirigente'],
    'Leitor do EBC': ['Leitor EBC', 'Leitor'],
    'Necessidades Locais': ['Necessidade Local', 'NL'],
    'Comentários Finais': ['Comentário Final', 'Encerramento'],
    'Oração Inicial': ['Oração de Abertura', 'Oração'],
    'Oração Final': ['Oração de Encerramento', 'Oração'],
    'Cântico Inicial': ['Cântico'],
    'Cântico do Meio': ['Cântico'],
    'Cântico Final': ['Cântico'],
};

async function main() {
    const [partRows, pubRows] = await Promise.all([fetchAll('workbook_parts'), fetchAll('publishers')]);
    const allParts = partRows.map(rowToPart);
    const publishers = pubRows.map(rowToPub);
    const history = allParts.filter(p => p.resolvedPublisherName || p.rawPublisherName).map(partToHist);
    const weekParts = allParts.filter(p => p.weekId === TARGET_WEEK);
    const refDate = new Date(TARGET_WEEK + 'T12:00:00');

    const distinctTipos = Array.from(new Set(weekParts.map(p => p.tipoParte))).filter(Boolean);
    console.log(`\nSemana ${TARGET_WEEK} | ${distinctTipos.length} tipoParte distintos\n`);
    console.log('TipoParte (oficial) → top1 score | variante LLM → top1 score | DELTA');
    console.log('─'.repeat(110));

    const issues: Array<{ tipo: string; variant: string; baseline: number; inflated: number; delta: number }> = [];

    for (const tipoOficial of distinctTipos) {
        const targetPart = weekParts.find(p => p.tipoParte === tipoOficial)!;
        const eligCtx = buildEligibilityContext(targetPart, weekParts, publishers);
        const elegMod = (targetPart.modalidade as any) || (tipoOficial as any);
        const elegFn = (targetPart.funcao as any) || EnumFuncao.TITULAR;
        const eligible = publishers.filter(p => checkEligibility(p, elegMod, elegFn, eligCtx).eligible);
        if (eligible.length === 0) continue;

        const histScore = history.filter(h => h.weekId !== targetPart.weekId);

        // Baseline: nome oficial
        const baseRanked = getRankedCandidates(eligible, tipoOficial, histScore, undefined, refDate);
        const baseTop = baseRanked[0]?.scoreData.score ?? 0;

        const variants = LLM_VARIANTS[tipoOficial] || [];
        for (const v of variants) {
            const vRanked = getRankedCandidates(eligible, v, histScore, undefined, refDate);
            const vTop = vRanked[0]?.scoreData.score ?? 0;
            const delta = vTop - baseTop;
            const flag = Math.abs(delta) > 100 ? '🔴' : Math.abs(delta) > 0 ? '🟡' : '✅';
            console.log(`${flag} ${tipoOficial.padEnd(28)} ${String(baseTop).padStart(6)} | "${v}".padEnd(35) ${String(vTop).padStart(6)} | ${delta > 0 ? '+' : ''}${delta}`);
            if (Math.abs(delta) > 100) issues.push({ tipo: tipoOficial, variant: v, baseline: baseTop, inflated: vTop, delta });
        }
    }

    console.log('\n' + '═'.repeat(110));
    console.log(`RESUMO: ${issues.length} variantes com inflação > 100 pontos\n`);
    issues.forEach(i => {
        console.log(`  🔴 "${i.variant}" → score top ${i.inflated} (vs ${i.baseline} oficial, delta +${i.delta})`);
        console.log(`     tipoParte oficial: "${i.tipo}"`);
    });
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
