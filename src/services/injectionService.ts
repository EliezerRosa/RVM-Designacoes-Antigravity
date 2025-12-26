/**
 * Injection Service - RVM Designações
 * Injeção automática de partes obrigatórias durante o upload
 */

import type { HistoryRecord } from '../types';
import {
    HistoryStatus,
    EnumSecao,
    EnumTipoParte,
    EnumModalidade,
    EnumFuncao
} from '../types';

/**
 * Injeta partes obrigatórias nos registros importados
 * - Cântico Inicial: após Presidente
 * - Cântico do Meio: início da Vida Cristã
 * - Cântico Final: antes da Oração Final (se não existir)
 * - Elogios e Conselhos: após cada PARTE_ESTUDANTE
 */
export function injectMandatoryParts(
    records: HistoryRecord[],
    batchId: string
): HistoryRecord[] {
    if (records.length === 0) return records;

    // Agrupar por semana
    const weekGroups = new Map<string, HistoryRecord[]>();
    records.forEach(r => {
        const key = r.weekId || r.date || r.date;
        if (!weekGroups.has(key)) {
            weekGroups.set(key, []);
        }
        weekGroups.get(key)!.push(r);
    });

    const result: HistoryRecord[] = [];

    weekGroups.forEach((weekRecords, weekKey) => {
        // Ordenar por seq/partSequence
        weekRecords.sort((a, b) => (a.seq || a.seq || 0) - (b.seq || b.seq || 0));

        const injectedWeek = injectPartsForWeek(weekRecords, weekKey, batchId);
        result.push(...injectedWeek);
    });

    // Reordenar resultado final
    result.sort((a, b) => {
        const weekA = a.date || a.date || '';
        const weekB = b.date || b.date || '';
        if (weekA !== weekB) return weekA.localeCompare(weekB);
        return (a.seq || a.seq || 0) - (b.seq || b.seq || 0);
    });

    console.log(`[Injection Service] ${result.length - records.length} partes injetadas`);
    return result;
}

function injectPartsForWeek(
    records: HistoryRecord[],
    weekKey: string,
    batchId: string
): HistoryRecord[] {
    const result: HistoryRecord[] = [];
    let seqCounter = 1;
    let injectedCount = 0;

    // Verificar quais partes já existem
    const hasCanticoInicial = records.some(r =>
        r.tipoParte === EnumTipoParte.CANTICO_INICIAL ||
        r.tituloParte?.toLowerCase().includes('cântico inicial')
    );
    const hasCanticoMeio = records.some(r =>
        r.tipoParte === EnumTipoParte.CANTICO_MEIO ||
        r.tituloParte?.toLowerCase().includes('cântico do meio')
    );
    const hasCanticoFinal = records.some(r =>
        r.tipoParte === EnumTipoParte.CANTICO_FINAL ||
        r.tituloParte?.toLowerCase().includes('cântico final')
    );

    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const nextRecord = records[i + 1];

        // Atribuir seq atualizado
        const updatedRecord = { ...record, seq: seqCounter, partSequence: seqCounter };
        result.push(updatedRecord);
        seqCounter++;

        // REGRA 1: Cântico Inicial após Presidente
        if (!hasCanticoInicial &&
            (record.tipoParte === EnumTipoParte.PRESIDENTE ||
                record.tituloParte?.toLowerCase().includes('presidente'))) {
            result.push(createInjectedPart({
                weekKey,
                batchId,
                seq: seqCounter,
                secao: EnumSecao.INICIO_REUNIAO,
                tipoParte: EnumTipoParte.CANTICO_INICIAL,
                descricao: 'Cântico Inicial',
                modalidade: EnumModalidade.CANTICO,
                duracao: 3,
                baseRecord: record
            }));
            seqCounter++;
            injectedCount++;
        }

        // REGRA 2: Elogios e Conselhos após PARTE_ESTUDANTE
        if ((record.tipoParte === EnumTipoParte.PARTE_ESTUDANTE ||
            record.modalidade === EnumModalidade.LEITURA_ESTUDANTE ||
            record.modalidade === EnumModalidade.DEMONSTRACAO ||
            record.modalidade === EnumModalidade.DISCURSO_ESTUDANTE) &&
            record.funcao === EnumFuncao.TITULAR) {

            // Verificar se já existe Elogios após esta parte
            const nextIsTitular = nextRecord && nextRecord.funcao === EnumFuncao.TITULAR;
            const nextIsElogios = nextRecord &&
                (nextRecord.tipoParte === EnumTipoParte.ELOGIOS_CONSELHOS ||
                    nextRecord.tituloParte?.toLowerCase().includes('elogios'));

            // Só injetar se a próxima parte titular não for Elogios
            if (nextIsTitular && !nextIsElogios) {
                result.push(createInjectedPart({
                    weekKey,
                    batchId,
                    seq: seqCounter,
                    secao: record.section || EnumSecao.MINISTERIO,
                    tipoParte: EnumTipoParte.ELOGIOS_CONSELHOS,
                    descricao: 'Elogios e Conselhos',
                    modalidade: EnumModalidade.ACONSELHAMENTO,
                    duracao: 1,
                    baseRecord: record
                }));
                seqCounter++;
                injectedCount++;
            }
        }

        // REGRA 3: Cântico do Meio no início da Vida Cristã
        if (!hasCanticoMeio && nextRecord) {
            const currentIsNotVidaCrista = record.section !== EnumSecao.VIDA_CRISTA;
            const nextIsVidaCrista = nextRecord.section === EnumSecao.VIDA_CRISTA ||
                nextRecord.tituloParte?.toLowerCase().includes('vida cristã');

            if (currentIsNotVidaCrista && nextIsVidaCrista) {
                result.push(createInjectedPart({
                    weekKey,
                    batchId,
                    seq: seqCounter,
                    secao: EnumSecao.VIDA_CRISTA,
                    tipoParte: EnumTipoParte.CANTICO_MEIO,
                    descricao: 'Cântico do Meio',
                    modalidade: EnumModalidade.CANTICO,
                    duracao: 3,
                    baseRecord: record
                }));
                seqCounter++;
                injectedCount++;
            }
        }
    }

    // REGRA 4: Cântico Final (se não existir) - inserir antes da Oração Final
    if (!hasCanticoFinal) {
        const oracaoFinalIndex = result.findIndex(r =>
            r.tipoParte === EnumTipoParte.ORACAO_FINAL ||
            r.tituloParte?.toLowerCase().includes('oração final')
        );

        if (oracaoFinalIndex > 0) {
            const baseRecord = result[oracaoFinalIndex - 1];
            const canticoFinal = createInjectedPart({
                weekKey,
                batchId,
                seq: result[oracaoFinalIndex].seq! - 0.5, // Temporário
                secao: EnumSecao.FINAL_REUNIAO,
                tipoParte: EnumTipoParte.CANTICO_FINAL,
                descricao: 'Cântico Final',
                modalidade: EnumModalidade.CANTICO,
                duracao: 3,
                baseRecord
            });
            result.splice(oracaoFinalIndex, 0, canticoFinal);
            injectedCount++;
        }
    }

    // Renumerar sequências
    result.forEach((r, idx) => {
        r.seq = idx + 1;
        r.seq = idx + 1;
    });

    if (injectedCount > 0) {
        console.log(`[Injection Service] Semana ${weekKey}: ${injectedCount} partes injetadas`);
    }

    return result;
}

interface InjectedPartParams {
    weekKey: string;
    batchId: string;
    seq: number;
    secao: string;
    tipoParte: string;
    descricao: string;
    modalidade: string;
    duracao: number;
    baseRecord: HistoryRecord;
}

function createInjectedPart(params: InjectedPartParams): HistoryRecord {
    const { weekKey, batchId, seq, secao, tipoParte, descricao, modalidade, duracao, baseRecord } = params;

    return {
        id: `injected-${batchId}-${weekKey}-${seq}-${Date.now()}`,

        // Contexto temporal
        weekId: baseRecord.weekId,
        weekDisplay: baseRecord.weekDisplay,
        date: baseRecord.date,

        // 5 CAMPOS CANÔNICOS
        section: secao,
        tipoParte: tipoParte,
        modalidade: modalidade,
        tituloParte: descricao,
        descricaoParte: '',
        detalhesParte: '',

        // Sequência e função
        seq: seq,
        funcao: 'Titular' as const,
        duracao: duracao,
        horaInicio: '',
        horaFim: '',

        // Publicador
        rawPublisherName: tipoParte === EnumTipoParte.ELOGIOS_CONSELHOS ? 'Presidente' : '',
        resolvedPublisherId: undefined,
        resolvedPublisherName: undefined,
        matchConfidence: 0,

        // Status e metadados
        status: HistoryStatus.PENDING,
        importSource: 'AUTO_INJECTED',
        importBatchId: batchId,
        createdAt: new Date().toISOString(),
    };
}
