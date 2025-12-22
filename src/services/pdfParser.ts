/**
 * Parser de PDF S-140 usando PDF.js (funciona no navegador)
 * Extrai semanas e partes de pautas de reunião
 */
import * as pdfjsLib from 'pdfjs-dist';
import type { HistoryRecord } from '../types';
import { HistoryStatus } from '../types';

// Configurar worker do PDF.js usando import estático
// @ts-ignore - O Vite vai resolver esse import corretamente
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;

// ==========================================
// Constantes
// ==========================================

const PORTUGUESE_MONTHS: Record<string, number> = {
    'janeiro': 1, 'fevereiro': 2, 'marco': 3, 'março': 3, 'abril': 4,
    'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8, 'setembro': 9,
    'outubro': 10, 'novembro': 11, 'dezembro': 12,
};

const SECTION_HEADINGS: Record<string, string> = {
    'tesouros': 'Tesouros',
    'minist': 'Ministério',
    'vida': 'Vida Cristã',
    'conclus': 'Conclusão',
};

const SKIP_KEYWORDS = ['SALA B', 'SALAO PRINCIPAL', 'SALÃO PRINCIPAL'];

// Regex Patterns
const DURATION_PATTERN = /(.+?)\s*\((\d+)\s*min\)/i;
const WEEK_HEADER_PATTERN = /\d{1,2}\s*(?:[-–]|a)\s*\d{1,2}\s*de\s*[a-zç]+/i;
const YEAR_PATTERN = /20\d{2}/;

// ==========================================
// Tipos
// ==========================================

interface ParsedPart {
    section: string;
    title: string;
    student: string | null;
    assistant: string | null;
}

interface ParsedWeek {
    label: string;
    date: string | null;
    parts: ParsedPart[];
}

// ==========================================
// Funções de Parsing
// ==========================================

function normalizeText(text: string): string {
    // Remove acentos
    const normalized = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    // Remove caracteres de controle
    return normalized
        .replace(/\/CR|\/SUBC|\/CAN/g, ' ')
        .replace(/\u2002|\u00a0/g, ' ');
}

function prepareLines(text: string): string[] {
    const normalized = normalizeText(text);
    const lines: string[] = [];
    let seen: string | null = null;

    for (const raw of normalized.split('\n')) {
        let line = raw.trim();
        if (!line) continue;

        // Remove timestamps
        line = line.replace(/\d{1,2}:\d{2}\s+/, '');
        line = line.replace(/\s{2,}/g, ' ');
        line = line.trim().replace(/^[-:/]+|[-:/]+$/g, '');

        if (!line) continue;

        // Skip headers
        const upper = line.toUpperCase();
        if (SKIP_KEYWORDS.some(kw => upper.includes(kw))) continue;

        // Skip duplicates
        if (line === seen) continue;
        seen = line;
        lines.push(line);
    }

    return lines;
}

function detectYear(text: string): number {
    const match = text.match(YEAR_PATTERN);
    return match ? parseInt(match[0]) : new Date().getFullYear();
}

function extractWeekStart(label: string, yearHint: number): string | null {
    const sanitized = label.toLowerCase().replace('.o', '');
    const rangePattern = /(\d{1,2})\s*(?:[-–]|a)\s*(\d{1,2})?\s+de\s+([a-zç]+)/i;
    const match = sanitized.match(rangePattern);

    if (!match) return null;

    const day = parseInt(match[1]);
    const monthName = match[3].replace(/\s/g, '');
    const month = PORTUGUESE_MONTHS[monthName];

    if (!month) return null;

    try {
        const date = new Date(yearHint, month - 1, day);
        return date.toISOString().split('T')[0];
    } catch {
        return null;
    }
}

function looksLikeWeekHeader(line: string): boolean {
    const compact = line.toLowerCase().replace(/\s+/g, '');
    return WEEK_HEADER_PATTERN.test(compact);
}

function detectSection(line: string, current: string | null): string | null {
    const normalized = line.toLowerCase();
    for (const [snippet, section] of Object.entries(SECTION_HEADINGS)) {
        if (normalized.includes(snippet)) {
            return section;
        }
    }
    return current;
}

function nextNameBlock(lines: string[], startIndex: number): string | null {
    for (let offset = startIndex; offset < Math.min(startIndex + 4, lines.length); offset++) {
        const candidate = lines[offset].trim();
        if (!candidate) continue;

        // Skip time tokens
        if (/^\d{1,2}[\.:,]\d{2}$/.test(candidate)) continue;

        // Stop at numbered lines
        if (/^\d+[\.)]?\s+/.test(candidate)) break;

        // Skip section headers
        const normalized = candidate.toUpperCase();
        if (['TESOUROS', 'MINIST', 'BIBL', 'ORAÇÃO', 'CÂNTICO', 'CANTICO', 'PROGRAMAÇÃO']
            .some(kw => normalized.includes(kw))) continue;

        // Clean duration suffix
        let cleaned = candidate.replace(/\(\s*\d+\s*min\s*\)/gi, '');
        cleaned = cleaned.replace(/\d+\s*min\)?/gi, '');
        cleaned = cleaned.trim().replace(/^[-:]+|[-:]+$/g, '');

        if (!cleaned) continue;
        return cleaned;
    }

    return null;
}

function namesFromString(payload: string): [string, string | null] {
    let sanitized = payload.trim().replace(/\)$/, '').trim();
    sanitized = sanitized.replace(/\s{2,}/g, ' ');

    if (sanitized.includes('+')) {
        const [student, assistant] = sanitized.split('+', 2);
        return [student.trim(), assistant?.trim() || null];
    }

    if (sanitized.includes('/')) {
        const [student, assistant] = sanitized.split('/', 2);
        return [student.trim(), assistant?.trim() || null];
    }

    return [sanitized.trim(), null];
}

function extractWeeksFromText(text: string): ParsedWeek[] {
    const yearHint = detectYear(text);
    const cleanedLines = prepareLines(text);
    const weeks: ParsedWeek[] = [];
    let currentWeek: ParsedWeek | null = null;
    let currentSection: string | null = null;

    for (let idx = 0; idx < cleanedLines.length; idx++) {
        const line = cleanedLines[idx];

        // Detect week header
        if (looksLikeWeekHeader(line)) {
            if (currentWeek) weeks.push(currentWeek);

            const weekDate = extractWeekStart(line, yearHint);
            currentWeek = {
                label: line,
                date: weekDate,
                parts: []
            };
            currentSection = null;
            continue;
        }

        if (!currentWeek) continue;

        // Detect section
        const nextSection = detectSection(line, currentSection);
        if (nextSection !== currentSection) {
            currentSection = nextSection;
            continue;
        }

        // Detect part with duration - formato: "Parte (X min) Nome Student / Nome Ajudante"
        const match = line.match(DURATION_PATTERN);
        if (match && currentSection) {
            const title = match[1].trim().replace(/^[-:"]+|[-:"]+$/g, '');

            // Tentar extrair nome após a duração na mesma linha
            // Formato: "Título (10 min) Nome Estudante" ou "Título (10 min) Nome / Ajudante"
            const afterDuration = line.substring(line.indexOf(match[0]) + match[0].length).trim();

            let nameBlock = afterDuration;

            // Se não há nome na mesma linha, procurar na próxima
            if (!nameBlock || nameBlock.length < 3) {
                nameBlock = nextNameBlock(cleanedLines, idx + 1) || '';
            }

            if (nameBlock && nameBlock.length >= 3) {
                // Limpar sufixos como "Estudante:" ou "Ajudante"
                nameBlock = nameBlock.replace(/^Estudante:\s*/i, '')
                    .replace(/^Estudante\s+Ajudante/i, '')
                    .replace(/Estudante\s*$/i, '')
                    .trim();

                const [student, assistant] = namesFromString(nameBlock);

                if (student && student.length >= 2) {
                    currentWeek.parts.push({
                        section: currentSection,
                        title,
                        student,
                        assistant
                    });
                }
            }
        }
    }

    if (currentWeek) weeks.push(currentWeek);
    return weeks;
}

// ==========================================
// Interface Pública
// ==========================================

export interface ParseResult {
    success: boolean;
    weeks: ParsedWeek[];
    records: HistoryRecord[];
    error?: string;
}

export async function parsePdfFile(file: File): Promise<ParseResult> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // Extrair items com posições para preservar layout
            const items = textContent.items as Array<{
                str: string;
                transform: number[];
            }>;

            // Ordenar por posição Y (alto para baixo) e depois X (esquerda para direita)
            const sortedItems = items
                .filter(item => item.str.trim())
                .map(item => ({
                    text: item.str,
                    x: item.transform[4],
                    y: item.transform[5]
                }))
                .sort((a, b) => {
                    // Agrupar por linhas (tolerância de 5 pixels)
                    const yDiff = b.y - a.y;
                    if (Math.abs(yDiff) > 5) return yDiff;
                    return a.x - b.x;
                });

            // Agrupar em linhas
            const lines: string[][] = [];
            let currentLine: string[] = [];
            let currentY = sortedItems[0]?.y ?? 0;

            for (const item of sortedItems) {
                if (Math.abs(item.y - currentY) > 5) {
                    if (currentLine.length > 0) {
                        lines.push(currentLine);
                    }
                    currentLine = [];
                    currentY = item.y;
                }
                currentLine.push(item.text);
            }
            if (currentLine.length > 0) {
                lines.push(currentLine);
            }

            // Juntar linhas
            fullText += lines.map(line => line.join(' ')).join('\n') + '\n';
        }

        console.log('[PDF Parser] Texto extraído:', fullText.substring(0, 500));

        if (!fullText.trim()) {
            return {
                success: false,
                weeks: [],
                records: [],
                error: 'PDF sem texto extraível'
            };
        }

        // Parse weeks
        const weeks = extractWeeksFromText(fullText);

        console.log('[PDF Parser] Semanas encontradas:', weeks.length);

        // Convert to HistoryRecords
        const batchId = `batch-${Date.now()}`;
        const records: HistoryRecord[] = [];

        for (const week of weeks) {
            for (const part of week.parts) {
                if (part.student) {
                    records.push({
                        id: `hr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        weekId: week.date?.substring(0, 7) || '',
                        weekDisplay: week.label,
                        date: week.date || '',
                        partTitle: part.title,
                        partType: part.section,
                        rawPublisherName: part.student,
                        rawHelperName: part.assistant || undefined,
                        status: HistoryStatus.PENDING,
                        importSource: 'PDF',
                        importBatchId: batchId,
                        createdAt: new Date().toISOString(),
                    });
                }
            }
        }

        return {
            success: true,
            weeks,
            records
        };
    } catch (error) {
        return {
            success: false,
            weeks: [],
            records: [],
            error: error instanceof Error ? error.message : 'Erro ao processar PDF'
        };
    }
}
