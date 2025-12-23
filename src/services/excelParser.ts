/**
 * Excel Parser - RVM Designações
 * Importa histórico consolidado do formato Excel (12 colunas RVM Pro 2.0)
 */

import * as XLSX from 'xlsx';
import type { HistoryRecord } from '../types';
import {
    HistoryStatus,
    MeetingSection,
    PartModality,
    EnumSecao,
    EnumTipoParte,
    EnumModalidade,
    EnumFuncao
} from '../types';

// Colunas esperadas no Excel consolidado
interface ExcelRow {
    'Semana': string | Date;
    'Seq': number;
    'Seção': string;
    'Tipo da Parte': string;
    'Descrição-Tema-Conteúdo': string;
    'Modalidade': string;
    'Horário Inicial': string;
    'Horário Final': string;
    'Duração': number;
    'Nome Original': string;
    'Função': string;
    'Publicador': string;
}

export interface ExcelParseResult {
    success: boolean;
    records: HistoryRecord[];
    error?: string;
    totalRows: number;
    importedRows: number;
}

// Mapear seção do Excel para enum legado
function mapSecaoToLegacy(secao: string): MeetingSection {
    const map: Record<string, MeetingSection> = {
        'Início da Reunião': MeetingSection.INICIO,
        'Tesouros da Palavra de Deus': MeetingSection.TESOUROS,
        'Faça Seu Melhor no Ministério': MeetingSection.MINISTERIO,
        'Nossa Vida Cristã': MeetingSection.VIDA_CRISTA,
        'Final da Reunião': MeetingSection.FINAL,
    };
    return map[secao] || MeetingSection.TESOUROS;
}

// Mapear modalidade do Excel para enum legado
function mapModalidadeToLegacy(modalidade: string): PartModality {
    const map: Record<string, PartModality> = {
        'Presidência': PartModality.PRESIDENCIA,
        'Cântico': PartModality.PRESIDENCIA, // Não tem correspondente exato
        'Oração': PartModality.ORACAO,
        'Aconselhamento': PartModality.PRESIDENCIA,
        'Discurso de Ensino': PartModality.DISCURSO_ENSINO,
        'Leitura de Estudante': PartModality.LEITURA_ESTUDANTE,
        'Demonstração': PartModality.DEMONSTRACAO,
        'Discurso de Estudante': PartModality.DISCURSO_ESTUDANTE,
        'Dirigente de EBC': PartModality.DIRIGENTE_EBC,
        'Leitor de EBC': PartModality.LEITOR_EBC,
    };
    return map[modalidade] || PartModality.DISCURSO_ENSINO;
}

// Formatar data do Excel para ISO string
function formatDate(date: string | Date | number): string {
    if (date instanceof Date) {
        return date.toISOString().split('T')[0];
    }
    if (typeof date === 'number') {
        // Excel date serial number
        const excelDate = new Date((date - 25569) * 86400 * 1000);
        return excelDate.toISOString().split('T')[0];
    }
    if (typeof date === 'string' && date.includes('/')) {
        // DD/MM/YYYY format
        const [d, m, y] = date.split('/');
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return date?.toString() || new Date().toISOString().split('T')[0];
}

// Gerar weekDisplay a partir da data
function generateWeekDisplay(date: string): string {
    const d = new Date(date);
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `SEMANA ${day} DE ${month.toUpperCase()} | ${year}`;
}

export async function parseExcelFile(file: File): Promise<ExcelParseResult> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

        // Pegar primeira planilha
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Converter para JSON
        const rows = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);

        if (rows.length === 0) {
            return {
                success: false,
                records: [],
                error: 'Planilha vazia',
                totalRows: 0,
                importedRows: 0
            };
        }

        const batchId = `excel-${Date.now()}`;
        const records: HistoryRecord[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            try {
                const dateStr = formatDate(row['Semana']);
                const weekId = dateStr.substring(0, 7); // "2024-11"

                const record: HistoryRecord = {
                    id: `excel-${batchId}-${i}`,

                    // Campos legado (obrigatórios)
                    weekId: weekId,
                    weekDisplay: generateWeekDisplay(dateStr),
                    date: dateStr,
                    section: mapSecaoToLegacy(row['Seção']),
                    partTitle: row['Tipo da Parte'] || 'Parte',
                    partSequence: row['Seq'] || i + 1,
                    modality: mapModalidadeToLegacy(row['Modalidade']),
                    rawPublisherName: row['Nome Original'] || '',
                    participationRole: (row['Função'] === 'Ajudante' ? 'Ajudante' : 'Titular') as 'Titular' | 'Ajudante',

                    // Resolução
                    resolvedPublisherId: undefined,
                    resolvedPublisherName: row['Publicador'] || undefined,
                    matchConfidence: row['Publicador'] ? 100 : 0,

                    // Status
                    status: HistoryStatus.PENDING,
                    importSource: 'Excel',
                    importBatchId: batchId,
                    createdAt: new Date().toISOString(),

                    // Novos campos RVM Pro 2.0
                    semana: dateStr,
                    seq: row['Seq'] || i + 1,
                    secao: row['Seção'] as EnumSecao,
                    tipoParte: row['Tipo da Parte'] as EnumTipoParte,
                    descricao: row['Descrição-Tema-Conteúdo'] || '',
                    modalidade: row['Modalidade'] as EnumModalidade,
                    horaInicio: row['Horário Inicial']?.toString() || '',
                    horaFim: row['Horário Final']?.toString() || '',
                    duracao: row['Duração'] || 0,
                    nomeOriginal: row['Nome Original'] || '',
                    funcao: (row['Função'] === 'Ajudante' ? EnumFuncao.AJUDANTE : EnumFuncao.TITULAR),
                    publicadorId: undefined,
                    publicadorNome: row['Publicador'] || undefined,
                };

                records.push(record);
            } catch (err) {
                console.warn(`[Excel Parser] Erro na linha ${i + 2}:`, err);
            }
        }

        console.log(`[Excel Parser] Importados ${records.length} de ${rows.length} registros`);

        return {
            success: true,
            records,
            totalRows: rows.length,
            importedRows: records.length
        };

    } catch (error) {
        console.error('[Excel Parser] Erro:', error);
        return {
            success: false,
            records: [],
            error: error instanceof Error ? error.message : 'Erro desconhecido',
            totalRows: 0,
            importedRows: 0
        };
    }
}
