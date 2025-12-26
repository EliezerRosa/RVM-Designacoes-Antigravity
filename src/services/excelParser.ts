/**
 * Excel Parser - RVM Designações
 * Importa histórico consolidado do formato Excel (12 colunas RVM Pro 2.0)
 */

import * as XLSX from 'xlsx';
import type { HistoryRecord } from '../types';
import { HistoryStatus } from '../types';

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

// Gerar weekDisplay a partir da data (formato: SEMANA X-Y DE MÊS | ANO)
function generateWeekDisplay(date: string): string {
    const d = new Date(date + 'T12:00:00'); // Adiciona hora para evitar problemas de timezone
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    // Ajustar para segunda-feira se não for
    const dayOfWeek = d.getDay(); // 0 = domingo, 1 = segunda
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMonday);

    // Calcular domingo (6 dias após segunda)
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const startDay = monday.getDate();
    const endDay = sunday.getDate();
    const month = months[monday.getMonth()];
    const year = monday.getFullYear();

    // Se a semana cruza meses, mostrar os dois
    if (monday.getMonth() !== sunday.getMonth()) {
        const endMonth = months[sunday.getMonth()];
        return `SEMANA ${startDay} DE ${month.toUpperCase()} - ${endDay} DE ${endMonth.toUpperCase()} | ${year}`;
    }

    return `SEMANA ${startDay}-${endDay} DE ${month.toUpperCase()} | ${year}`;
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

                    // Contexto temporal
                    weekId: weekId,
                    weekDisplay: generateWeekDisplay(dateStr),
                    date: dateStr,

                    // 5 CAMPOS CANÔNICOS
                    section: row['Seção'] || 'Tesouros da Palavra de Deus',
                    tipoParte: row['Tipo da Parte'] || 'Parte',
                    modalidade: row['Modalidade'] || 'Demonstração',
                    tituloParte: row['Tipo da Parte'] || 'Parte',
                    descricaoParte: row['Descrição-Tema-Conteúdo'] || '',
                    detalhesParte: '',

                    // Sequência e função
                    seq: row['Seq'] || i + 1,
                    funcao: (row['Função'] === 'Ajudante' ? 'Ajudante' : 'Titular') as 'Titular' | 'Ajudante',
                    duracao: row['Duração'] || 0,
                    horaInicio: row['Horário Inicial']?.toString() || '',
                    horaFim: row['Horário Final']?.toString() || '',

                    // Publicador
                    rawPublisherName: row['Nome Original'] || '',
                    resolvedPublisherId: undefined,
                    resolvedPublisherName: row['Publicador'] || undefined,
                    matchConfidence: row['Publicador'] ? 100 : 0,

                    // Status e metadados
                    status: HistoryStatus.PENDING,
                    importSource: 'Excel',
                    importBatchId: batchId,
                    createdAt: new Date().toISOString(),
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
