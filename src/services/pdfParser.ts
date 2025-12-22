/**
 * Parser de PDF S-140 usando PDF.js (funciona no navegador)
 * Extrai semanas e partes de pautas de reunião
 */
import * as pdfjsLib from 'pdfjs-dist';
import type { HistoryRecord, PartModality } from '../types';
import { HistoryStatus, PartModality as PartModalityEnum } from '../types';

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
    'palavra de deus': 'Tesouros',
    'ministério': 'Ministério',
    'ministerio': 'Ministério',
    'faça seu melhor': 'Ministério',
    'faca seu melhor': 'Ministério',
    'vida cristã': 'Vida Cristã',
    'vida crista': 'Vida Cristã',
    'vida': 'Vida Cristã',
    'conclusão': 'Vida Cristã',
    'conclusao': 'Vida Cristã',
};

const TESOUROS_PARTS = ['leitura', 'bíblia', 'biblia', 'joias', 'jóias', 'pacto'];
const VIDA_CRISTA_PARTS = ['ebc', 'estudo bíblico', 'estudo biblico', 'congregação', 'congregacao', 'necessidades', 'demonstra', 'amor'];
// Partes do Ministério: Iniciando, Cultivando, Fazendo, Explicando, Discurso
const MINISTERIO_PARTS = ['iniciando', 'cultivando', 'fazendo', 'explicando'];

const SKIP_KEYWORDS = ['SALA B', 'SALAO PRINCIPAL', 'SAL├âO PRINCIPAL'];

// Partes NÃO designáveis (por função ou fixas) - ignorar no histórico
const NON_DESIGNABLE_PARTS = [
    'comentários', 'comentarios', 'comentário inicial', 'comentario inicial',
    'comentários finais', 'comentarios finais',
    'cântico', 'cantico',
    'oração inicial', 'oracao inicial'  // Oração Inicial é fixo do Presidente
];

// Regex Patterns
const DURATION_PATTERN = /(.+?)\s*\((\d+)\s*min\)/i;
const WEEK_HEADER_PATTERN = /\d{1,2}\s*(?:[-–]|a)\s*\d{1,2}\s*de\s*[a-zç]+/i;
const YEAR_PATTERN = /20\d{2}/;

// Limpar label da semana (remover | e trecho bíblico)
function cleanWeekLabel(rawLabel: string): string {
    // Remover tudo após "|" 
    let clean = rawLabel.split('|')[0].trim();
    // Remover "SEMANA" inicial para normalizar
    clean = clean.replace(/^SEMANA\s*/i, '').trim();
    return clean; // Retorna s├│ "4-10 DE NOVEMBRO" etc.
}

// Inferir seção pelo título da parte
function inferSectionFromTitle(title: string): string {
    const lower = title.toLowerCase();

    // Tesouros: Part 1 is ALWAYS Tesouros, and usually Parts 2-3 too
    if (lower.startsWith('1.') || lower.startsWith('2.') || lower.startsWith('3.')) {
        return 'Tesouros';
    }

    // Vida Cristã específica (prioridade para não confundir com outros)
    if (VIDA_CRISTA_PARTS.some(p => lower.includes(p))) {
        return 'Vida Cristã';
    }

    // Tesouros: Leitura da Bíblia, Joias
    if (TESOUROS_PARTS.some(p => lower.includes(p))) {
        return 'Tesouros';
    }

    // Ministério: Iniciando, etc.
    if (MINISTERIO_PARTS.some(p => lower.includes(p))) {
        return 'Ministério';
    }

    // Default: Ministério para partes numeradas altas se não caiu nas anteriores
    return 'Ministério';
}

// Inferir modalidade pelo t├¡tulo e se├º├úo
function inferModalityFromTitle(title: string, section: string): PartModality {
    const lower = title.toLowerCase();

    // Leitura da B├¡blia ÔåÆ Leitura de Estudante (Tesouros)
    if (lower.includes('leitura') && section === 'Tesouros') {
        return PartModalityEnum.LEITURA_ESTUDANTE;
    }

    // Estudo Bíblico de Congregação / Dirigente → Dirigente de EBC (Vida Cristã)
    if ((lower.includes('estudo bíblico') || lower.includes('estudo biblico') ||
        lower.includes('dirigente') || lower.includes('conduz')) && section === 'Vida Cristã') {
        return PartModalityEnum.DIRIGENTE_EBC;
    }

    // Leitura no EBC / Leitor ÔåÆ Leitor de EBC (Vida Crist├ú)
    if ((lower.includes('leitura no ebc') || lower.includes('leitor')) && section === 'Vida Crist├ú') {
        return PartModalityEnum.LEITOR_EBC;
    }

    // Ora├º├úo Final ÔåÆ Ora├º├úo (Vida Crist├ú)
    if (lower.includes('ora├º├úo') || lower.includes('oracao')) {
        return PartModalityEnum.ORACAO;
    }

    // Discurso no Minist├®rio (final da se├º├úo) ÔåÆ Discurso de Estudante
    if (lower.includes('discurso') && section === 'Minist├®rio') {
        return PartModalityEnum.DISCURSO_ESTUDANTE;
    }

    // Discurso em Tesouros ou Vida Crist├ú ÔåÆ Discurso de Ensino
    if (section === 'Tesouros' || section === 'Vida Crist├ú') {
        // EBC Dirigente, Joias, Discurso de tema
        return PartModalityEnum.DISCURSO_ENSINO;
    }

    // Partes do Minist├®rio com demonstra├º├úo (Iniciando, Cultivando, Fazendo, Explicando)
    if (section === 'Minist├®rio') {
        return PartModalityEnum.DEMONSTRACAO;
    }

    // Default
    return PartModalityEnum.DISCURSO_ENSINO;
}

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
// Fun├º├Áes de Parsing
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
    const rangePattern = /(\d{1,2})\s*(?:[-ÔÇô]|a)\s*(\d{1,2})?\s+de\s+([a-z├º]+)/i;
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
        if (['TESOUROS', 'MINIST', 'BIBL', 'ORA├ç├âO', 'C├éNTICO', 'CANTICO', 'PROGRAMA├ç├âO']
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

    // Separador expl├¡cito: + ou /
    if (sanitized.includes('+')) {
        const [student, assistant] = sanitized.split('+', 2);
        return [student.trim(), assistant?.trim() || null];
    }
    if (sanitized.includes('/')) {
        const [student, assistant] = sanitized.split('/', 2);
        return [student.trim(), assistant?.trim() || null];
    }

    // Formato EBC especial: "Dirigente: Nome Sobrenome Leitor: Nome Sobrenome"
    const dirigenteMatch = sanitized.match(/Dirigente[:\s]+(.+?)\s+Leitor[:\s]+(.+)/i);
    if (dirigenteMatch) {
        return [dirigenteMatch[1].trim(), dirigenteMatch[2].trim()];
    }

    // Formato alternativo EBC: "Dirigente: Nome Sobrenome" (s├│ dirigente)
    const onlyDirigenteMatch = sanitized.match(/Dirigente[:\s]+(.+)/i);
    if (onlyDirigenteMatch && !sanitized.toLowerCase().includes('leitor')) {
        return [onlyDirigenteMatch[1].trim(), null];
    }

    // Verificar se tem 4 nomes consecutivos (Titular + Ajudante, cada um com 2 nomes)
    // Exemplo: "Rozelita Sales Keyla Costa" ÔåÆ ["Rozelita Sales", "Keyla Costa"]
    const words = sanitized.split(/\s+/).filter(w => w.length >= 2);

    if (words.length >= 4) {
        // Assumir que cada participante tem 2 nomes (primeiro + ├║ltimo)
        const titular = `${words[0]} ${words[1]}`;
        const ajudante = words.slice(2).join(' ');
        return [titular.trim(), ajudante.trim()];
    }

    if (words.length === 3) {
        // 3 nomes: pode ser "Nome Sobrenome NomeS├│" ÔåÆ Titular tem 2, ajudante tem 1
        const titular = `${words[0]} ${words[1]}`;
        const ajudante = words[2];
        return [titular.trim(), ajudante.trim()];
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
                label: cleanWeekLabel(line), // J├í limpo, sem | nem trecho b├¡blico
                date: weekDate,
                parts: []
            };
            currentSection = null;
            continue;
        }

        if (!currentWeek) continue;

        // Detect section (se detectar explicitamente)
        const nextSection = detectSection(line, currentSection);
        if (nextSection !== currentSection) {
            currentSection = nextSection;
            // N├úo pular - continuar processando a linha
        }

        // Detect part with duration - formato: "Parte (X min) Nome Student / Nome Ajudante"
        const match = line.match(DURATION_PATTERN);
        if (match) {
            const title = match[1].trim().replace(/^[-:"]+|[-:"]+$/g, '');

            // Ignorar partes N├âO design├íveis (por fun├º├úo ou fixas)
            const lowerTitle = title.toLowerCase();
            if (NON_DESIGNABLE_PARTS.some(p => lowerTitle.includes(p))) {
                continue;
            }

            // Tentar extrair nome ap├│s a dura├º├úo na mesma linha
            // Formato: "T├¡tulo (10 min) Nome Estudante" ou "T├¡tulo (10 min) Nome / Ajudante"
            const afterDuration = line.substring(line.indexOf(match[0]) + match[0].length).trim();

            let nameBlock = afterDuration;

            // Se n├úo h├í nome na mesma linha, procurar na pr├│xima
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
                    // Usar se├º├úo detectada explicitamente, ou inferir pelo t├¡tulo
                    const partSection = currentSection || inferSectionFromTitle(title);
                    const lowerTitle = title.toLowerCase();

                    // EBC: criar 2 parts separadas - Dirigente e Leitor
                    const isEBC = lowerTitle.includes('estudo b├¡blico') ||
                        lowerTitle.includes('estudo biblico') ||
                        lowerTitle.includes('ebc') ||
                        lowerTitle.includes('congrega├º├úo') ||
                        lowerTitle.includes('congregacao');

                    if (isEBC && assistant) {
                        // Part 1: Estudo B├¡blico de Congrega├º├úo (Dirigente)
                        currentWeek.parts.push({
                            section: partSection,
                            title: 'Estudo B├¡blico de Congrega├º├úo',
                            student,
                            assistant: null  // Dirigente n├úo tem ajudante
                        });

                        // Part 2: Leitura no EBC (Leitor)
                        currentWeek.parts.push({
                            section: partSection,
                            title: 'Leitura no EBC',
                            student: assistant,  // O "assistant" ├® o Leitor
                            assistant: null
                        });
                    } else {
                        // Parte normal (n├úo EBC)
                        currentWeek.parts.push({
                            section: partSection,
                            title,
                            student,
                            assistant
                        });
                    }
                }
            }
        }
    }

    if (currentWeek) weeks.push(currentWeek);
    return weeks;
}

// ==========================================
// Interface P├║blica
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

            // Extrair items com posi├º├Áes para preservar layout
            const items = textContent.items as Array<{
                str: string;
                transform: number[];
            }>;

            // Ordenar por posi├º├úo Y (alto para baixo) e depois X (esquerda para direita)
            const sortedItems = items
                .filter(item => item.str.trim())
                .map(item => ({
                    text: item.str,
                    x: item.transform[4],
                    y: item.transform[5]
                }))
                .sort((a, b) => {
                    // Agrupar por linhas (toler├óncia de 5 pixels)
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

        console.log('[PDF Parser] Texto extra├¡do:', fullText.substring(0, 500));

        if (!fullText.trim()) {
            return {
                success: false,
                weeks: [],
                records: [],
                error: 'PDF sem texto extra├¡vel'
            };
        }

        // Parse weeks
        const weeks = extractWeeksFromText(fullText);

        console.log('[PDF Parser] Semanas encontradas:', weeks.length);

        // Debug: mostrar partes por semana
        for (const week of weeks) {
            console.log(`[PDF Parser] ${week.label} - ${week.parts.length} partes`);
            for (const part of week.parts) {
                console.log(`  - ${part.title}: ${part.student} + ${part.assistant || 'N/A'}`);
            }
        }

        // Convert to HistoryRecords - cada participante = row separada
        const batchId = `batch-${Date.now()}`;
        const records: HistoryRecord[] = [];

        for (const week of weeks) {
            for (const part of week.parts) {
                // Calcular modalidade da parte
                const modality = inferModalityFromTitle(part.title, part.section);

                // Row do Titular
                if (part.student) {
                    records.push({
                        id: `hr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        weekId: week.date?.substring(0, 7) || '',
                        weekDisplay: week.label,
                        date: week.date || '',
                        section: part.section,
                        partType: part.title,
                        partTitle: part.title,
                        modality,
                        rawPublisherName: part.student,
                        participationRole: 'Titular',
                        status: HistoryStatus.PENDING,
                        importSource: 'PDF',
                        importBatchId: batchId,
                        createdAt: new Date().toISOString(),
                    });
                }

                // Row do Ajudante (se houver)
                if (part.assistant) {
                    records.push({
                        id: `hr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        weekId: week.date?.substring(0, 7) || '',
                        weekDisplay: week.label,
                        date: week.date || '',
                        section: part.section,
                        partType: part.title,
                        partTitle: part.title,
                        modality,
                        rawPublisherName: part.assistant,
                        participationRole: 'Ajudante',
                        status: HistoryStatus.PENDING,
                        importSource: 'PDF',
                        importBatchId: batchId,
                        createdAt: new Date().toISOString(),
                    });
                }
            }
        }

        console.log('[PDF Parser] Records gerados:', records.length);

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
