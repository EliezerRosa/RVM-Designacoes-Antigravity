/**
 * Parser de PDF S-140 usando PDF.js (funciona no navegador)
 * Extrai semanas e partes de pautas de reunião
 * Suporta OCR via Tesseract.js para PDFs baseados em imagem
 */
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';
import type { HistoryRecord, PartModality, MeetingSection, StandardPartKey } from '../types';
import { HistoryStatus, PartModality as PartModalityEnum, MeetingSection as MeetingSectionEnum, StandardPart } from '../types';

// Configurar worker do PDF.js usando import estático
// @ts-ignore - O Vite vai resolver esse import corretamente
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;

// Callback para progresso do OCR
export type OcrProgressCallback = (progress: { status: string; progress: number }) => void;


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
// OCR-tolerant: aceita O/0, l/1 como confusoes comuns
const DURATION_PATTERN = /(.+?)\s*\(([0-9OolI]+)\s*m[il1]n\)/i;
const WEEK_HEADER_PATTERN = /[0-9OolI]{1,2}\s*(?:[-–]|a)\s*[0-9OolI]{1,2}\s*de\s*[a-zç]+/i;
const YEAR_PATTERN = /20[0-9OolI]{2}/;

// Normalizar texto de OCR - corrigir confusoes comuns de caracteres
function normalizeOcrText(text: string): string {
    return text
        // Numeros: O->0, l->1
        .replace(/\b([0-9]*)[Oo]([0-9]+)\b/g, '$10$2')
        .replace(/\b([0-9]+)[Oo]([0-9]*)\b/g, '$10$2')
        .replace(/\b[Oo]([0-9]+)\b/g, '0$1')
        .replace(/\b([0-9]+)[Oo]\b/g, '$10')
        .replace(/\b([0-9]*)[lI]([0-9]+)\b/g, '$11$2')
        .replace(/\b[lI]([0-9]+)\b/g, '1$1')
        .replace(/\b([0-9]+)[lI]\b/g, '$11')
        // Palavras comuns mal lidas
        .replace(/m[il1]n\b/gi, 'min')
        .replace(/\brnin\b/gi, 'min')
        .replace(/\bmlnutos?\b/gi, 'minutos')
        // Acentos perdidos
        .replace(/\bMinisterio\b/g, 'Ministério')
        .replace(/\bVida Crista\b/g, 'Vida Cristã')
        .replace(/\bOracao\b/gi, 'Oração')
        .replace(/\bBiblia\b/gi, 'Bíblia')
        .replace(/\bCongregacao\b/gi, 'Congregação');
}



// Limpar label da semana (remover | e trecho bíblico)
function cleanWeekLabel(rawLabel: string): string {
    // Remover tudo após "|" 
    let clean = rawLabel.split('|')[0].trim();
    // Remover "SEMANA" inicial para normalizar
    clean = clean.replace(/^SEMANA\s*/i, '').trim();
    return clean; // Retorna só "4-10 DE NOVEMBRO" etc.
}

// Normalizar texto com problemas de encoding (mojibake)
function normalizeMojibake(text: string): string {
    return text
        .replace(/├¡/g, 'í')
        .replace(/├º/g, 'ç')
        .replace(/├ú/g, 'ã')
        .replace(/├®/g, 'ê')
        .replace(/├í/g, 'á')
        .replace(/├ó/g, 'ó')
        .replace(/├╝/g, 'ü')
        .replace(/├â/g, 'Ã')
        .replace(/├ü/g, 'Á')
        .replace(/ÔåÆ/g, '→')
        .replace(/Ôçö/g, '—');
}

// Inferir seção pelo título da parte - retorna MeetingSection
function inferSectionFromTitle(title: string): MeetingSection {
    const lower = title.toLowerCase();

    // Início da Reunião
    if (lower.includes('presidente')) {
        return MeetingSectionEnum.INICIO;
    }

    // Tesouros: Part 1 is ALWAYS Tesouros, and usually Parts 2-3 too
    if (lower.startsWith('1.') || lower.startsWith('2.') || lower.startsWith('3.')) {
        return MeetingSectionEnum.TESOUROS;
    }

    // Vida Cristã específica (prioridade para não confundir com outros)
    if (VIDA_CRISTA_PARTS.some(p => lower.includes(p))) {
        return MeetingSectionEnum.VIDA_CRISTA;
    }

    // Tesouros: Leitura da Bíblia, Joias
    if (TESOUROS_PARTS.some(p => lower.includes(p))) {
        return MeetingSectionEnum.TESOUROS;
    }

    // Ministério: Iniciando, etc.
    if (MINISTERIO_PARTS.some(p => lower.includes(p))) {
        return MeetingSectionEnum.MINISTERIO;
    }

    // Final: Oração final
    if (lower.includes('oração') && lower.includes('final')) {
        return MeetingSectionEnum.FINAL;
    }

    // Default: Ministério para partes numeradas altas se não caiu nas anteriores
    return MeetingSectionEnum.MINISTERIO;
}

// Inferir StandardPartKey pelo título da parte
function inferStandardPartKey(title: string): StandardPartKey | undefined {
    const lower = title.toLowerCase();
    // Normalizar texto com possível mojibake
    const normalized = lower
        .replace(/├¡/g, 'í')
        .replace(/├º/g, 'ç')
        .replace(/├ú/g, 'ã')
        .replace(/├®/g, 'ê');

    // Mapear títulos para StandardPartKey
    if (normalized.includes('presidente')) return 'PRESIDENTE';
    if (normalized.includes('oração inicial') || normalized.includes('oracao inicial')) return 'ORACAO_INICIAL';
    if (normalized.includes('oração final') || normalized.includes('oracao final')) return 'ORACAO_FINAL';
    if (normalized.includes('joias') || normalized.includes('jóias')) return 'JOIAS';
    if ((normalized.includes('leitura') && normalized.includes('bíblia')) ||
        (normalized.includes('leitura') && normalized.includes('biblia'))) return 'LEITURA_BIBLIA';
    if (normalized.includes('iniciando')) return 'INICIANDO';
    if (normalized.includes('cultivando')) return 'CULTIVANDO';
    if (normalized.includes('fazendo')) return 'FAZENDO';
    if (normalized.includes('explicando')) return 'EXPLICANDO';
    if (normalized.includes('discurso') && normalized.includes('estudante')) return 'DISCURSO_ESTUDANTE';
    if (normalized.includes('necessidades')) return 'NECESSIDADES';

    // Leitor do EBC (antes de EBC para ter prioridade)
    if (normalized.includes('leitor') ||
        (normalized.includes('leitura') && (normalized.includes('ebc') || normalized.includes('congregação') || normalized.includes('congregacao')))) return 'EBC_LEITOR';

    // EBC - múltiplas variantes
    if ((normalized.includes('estudo') && normalized.includes('bíblico')) ||
        (normalized.includes('estudo') && normalized.includes('biblico')) ||
        (normalized.includes('estudo') && normalized.includes('congregação')) ||
        (normalized.includes('estudo') && normalized.includes('congregacao'))) return 'EBC';

    // Primeira parte de Tesouros (Discurso)
    if (normalized.startsWith('1.')) return 'DISCURSO_TESOUROS';

    return undefined;
}

// Inferir modalidade pelo título e seção
function inferModalityFromTitle(title: string, section: MeetingSection): PartModality {
    const lower = title.toLowerCase();
    // Normalizar texto com possível mojibake
    const normalized = lower
        .replace(/├¡/g, 'í')
        .replace(/├º/g, 'ç')
        .replace(/├ú/g, 'ã')
        .replace(/├®/g, 'ê');

    // Presidente → Presidência
    if (normalized.includes('presidente')) {
        return PartModalityEnum.PRESIDENCIA;
    }

    // Oração → Oração
    if (normalized.includes('oração') || normalized.includes('oracao')) {
        return PartModalityEnum.ORACAO;
    }

    // Leitura da Bíblia → Leitura de Estudante (Tesouros)
    if ((normalized.includes('leitura') && normalized.includes('bíblia')) ||
        (normalized.includes('leitura') && normalized.includes('biblia'))) {
        return PartModalityEnum.LEITURA_ESTUDANTE;
    }

    // Leitor do EBC / Leitura no EBC → Leitor de EBC (Vida Cristã)
    if ((normalized.includes('leitor') ||
        (normalized.includes('leitura') && (normalized.includes('ebc') || section === MeetingSectionEnum.VIDA_CRISTA))) &&
        section === MeetingSectionEnum.VIDA_CRISTA) {
        return PartModalityEnum.LEITOR_EBC;
    }

    // Estudo Bíblico de Congregação / Dirigente → Dirigente de EBC (Vida Cristã)
    if ((normalized.includes('estudo') && (normalized.includes('bíblico') || normalized.includes('biblico') || normalized.includes('congregação') || normalized.includes('congregacao'))) ||
        normalized.includes('dirigente') || normalized.includes('conduz')) {
        if (section === MeetingSectionEnum.VIDA_CRISTA) {
            return PartModalityEnum.DIRIGENTE_EBC;
        }
    }

    // Discurso no Ministério (final da seção) → Discurso de Estudante
    if (normalized.includes('discurso') && section === MeetingSectionEnum.MINISTERIO) {
        return PartModalityEnum.DISCURSO_ESTUDANTE;
    }

    // Discurso em Tesouros → Discurso de Ensino
    if (section === MeetingSectionEnum.TESOUROS) {
        return PartModalityEnum.DISCURSO_ENSINO;
    }

    // Partes do Ministério → Demonstração (Iniciando, Cultivando, Fazendo, Explicando)
    if (section === MeetingSectionEnum.MINISTERIO) {
        return PartModalityEnum.DEMONSTRACAO;
    }

    // Vida Cristã (outras partes) → Discurso de Ensino
    if (section === MeetingSectionEnum.VIDA_CRISTA) {
        return PartModalityEnum.DISCURSO_ENSINO;
    }

    // Default
    return PartModalityEnum.DISCURSO_ENSINO;
}

// ==========================================
// Tipos
// ==========================================

export interface ParsedPart {
    section: string;
    title: string;
    student: string | null;
    assistant: string | null;
}

export interface ParsedWeek {
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
    const lower = line.toLowerCase();
    // Formato S-140: "4-10 DE NOVEMBRO"
    if (WEEK_HEADER_PATTERN.test(compact)) return true;
    // Formato pauta impressa: linha contendo "Programação"
    if (lower.includes('programação') || lower.includes('programacao')) return true;
    // Formato com data ISO: "2026-01-12" ou "2026 01 12"
    if (/20\d{2}[-\s]\d{2}[-\s]\d{2}/.test(line)) return true;
    // Formato com data: "12 de janeiro" ou similar no início
    if (/^\d{1,2}\s+de\s+[a-zç]+/i.test(line)) return true;
    return false;
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
                label: cleanWeekLabel(line),
                date: weekDate,
                parts: []
            };
            currentSection = null;

            // Verificar se Presidente está na mesma linha do cabeçalho
            const normalizedHeader = normalizeMojibake(line);
            const presidenteHeaderMatch = normalizedHeader.match(/presidente[:\s]+([A-Za-zÀ-ÿ\s]+)/i);
            if (presidenteHeaderMatch && presidenteHeaderMatch[1]) {
                const presidenteName = presidenteHeaderMatch[1].trim();
                if (presidenteName && presidenteName.length >= 3) {
                    currentWeek.parts.push({
                        section: 'Início',
                        title: 'Presidente',
                        student: presidenteName,
                        assistant: null
                    });
                }
            }
            continue;
        }

        if (!currentWeek) {
            // Fallback: Se nenhum cabeçalho de semana foi encontrado mas temos linhas com horários,
            // criar uma semana padrão (para pautas impressas de semana única)
            const timestampMatch = line.match(/^(\d{1,2})[:\.](\d{2})\s+/);
            if (timestampMatch || line.toLowerCase().includes('oração') || line.toLowerCase().includes('tesouros')) {
                currentWeek = {
                    label: 'Semana Importada',
                    date: new Date().toISOString().split('T')[0],
                    parts: []
                };
                console.log('[PDF Parser] Criando semana padrão por fallback');
            } else {
                continue;
            }
        }

        // Detect section (se detectar explicitamente)
        const nextSection = detectSection(line, currentSection);
        if (nextSection !== currentSection) {
            currentSection = nextSection;
            // Não pular - continuar processando a linha
        }

        // Normalizar linha para detecção (lidar com mojibake)
        const normalizedLine = normalizeMojibake(line);

        // Detectar Presidente (múltiplos formatos possíveis)
        // Formatos: "Presidente: Nome", "Presidente Nome", "Presidente    Nome"
        const lowerLine = normalizedLine.toLowerCase();
        if (lowerLine.includes('presidente') && !lowerLine.includes('min)')) {
            // Extrair nome após "presidente"
            const presidenteMatch = normalizedLine.match(/presidente[:\s]+([A-Za-zÀ-ÿ\s]+)/i);
            if (presidenteMatch && presidenteMatch[1]) {
                const presidenteName = presidenteMatch[1].trim();
                if (presidenteName && presidenteName.length >= 3 && !presidenteName.match(/^\d/)) {
                    currentWeek.parts.push({
                        section: 'Início',
                        title: 'Presidente',
                        student: presidenteName,
                        assistant: null
                    });
                    continue;
                }
            }
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

        // Fallback: Detectar linhas com timestamp no formato "19:30 Parte Nome Participante"
        // Para pautas impressas que não usam formato "(X min)"
        const timestampMatch = line.match(/^(\d{1,2})[:\.](\d{2})\s+(.+)/);
        if (timestampMatch) {
            const content = timestampMatch[3].trim();

            // Tentar extrair parte e nome
            // Formato comum: "Título da Parte Nome Sobrenome" ou "Título Nome / Ajudante"
            const partSection = currentSection || inferSectionFromTitle(content);

            // Verificar se é uma parte conhecida pelo início do conteúdo
            const lowerContent = content.toLowerCase();
            if (NON_DESIGNABLE_PARTS.some(p => lowerContent.includes(p))) {
                continue;
            }

            // Tentar separar título e nome
            // Estratégias: procurar padrões conhecidos
            let title = content;
            let studentName: string | null = null;
            let assistantName: string | null = null;

            // Padrão 1: "Leitura da Bíblia Gabriel Carlos + José Luiz"
            const knownParts = ['leitura da bíblia', 'leitura biblia', 'joias espirituais', 'iniciando conversas',
                'cultivando interesse', 'fazendo discípulos', 'explicando', 'discurso',
                'estudo bíblico', 'estudo biblico', 'oração', 'oracao'];
            for (const part of knownParts) {
                if (lowerContent.startsWith(part)) {
                    title = content.substring(0, part.length).trim();
                    const remainder = content.substring(part.length).trim();
                    if (remainder) {
                        const [student, assistant] = namesFromString(remainder);
                        studentName = student;
                        assistantName = assistant;
                    }
                    break;
                }
            }

            // Padrão 2: Número no início "4. Iniciando conversas Margarete Venturin"
            const numberedMatch = content.match(/^(\d+[\.)]\s*.+?)\s+([A-Z][a-zà-ÿ]+\s+[A-Z][a-zà-ÿ]+.*)$/);
            if (numberedMatch && !studentName) {
                title = numberedMatch[1].trim();
                const [student, assistant] = namesFromString(numberedMatch[2]);
                studentName = student;
                assistantName = assistant;
            }

            if (studentName && currentWeek) {
                currentWeek.parts.push({
                    section: partSection,
                    title: title,
                    student: studentName,
                    assistant: assistantName
                });
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
    usedOcr?: boolean;
}

// Extrair texto de PDF usando OCR (Tesseract.js)
async function extractTextWithOCR(
    pdf: pdfjsLib.PDFDocumentProxy,
    onProgress?: OcrProgressCallback
): Promise<string> {
    let fullText = '';
    const totalPages = pdf.numPages;

    for (let i = 1; i <= totalPages; i++) {
        if (onProgress) {
            onProgress({
                status: `Processando página ${i}/${totalPages} com OCR...`,
                progress: (i - 1) / totalPages
            });
        }

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); // 2x para melhor qualidade OCR

        // Criar canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) continue;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Renderizar página no canvas
        await page.render({
            canvasContext: context,
            viewport: viewport,
            // @ts-ignore - PDF.js types may be incorrect
            canvas: canvas
        }).promise;

        // Pré-processamento de imagem para melhorar OCR
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let j = 0; j < data.length; j += 4) {
            // Converter para escala de cinza
            const gray = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
            // Aplicar aumento de contraste
            const contrasted = Math.min(255, Math.max(0, ((gray - 128) * 1.5) + 128));
            const final = contrasted < 100 ? contrasted * 0.7 : Math.min(255, contrasted * 1.2);
            data[j] = final;
            data[j + 1] = final;
            data[j + 2] = final;
        }
        context.putImageData(imageData, 0, 0);

        // Executar OCR na imagem
        const result = await Tesseract.recognize(
            canvas,
            'por', // Português
            {
                logger: (m) => {
                    if (onProgress && m.status === 'recognizing text') {
                        onProgress({
                            status: `OCR página ${i}/${totalPages}: ${Math.round((m.progress || 0) * 100)}%`,
                            progress: ((i - 1) + (m.progress || 0)) / totalPages
                        });
                    }
                }
            }
        );

        fullText += result.data.text + '\n';
    }

    if (onProgress) {
        onProgress({ status: 'OCR concluído!', progress: 1 });
    }

    // Aplicar normalizacao de erros comuns de OCR
    return normalizeOcrText(fullText);
}

export async function parsePdfFile(
    file: File,
    onOcrProgress?: OcrProgressCallback
): Promise<ParseResult> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        let fullText = '';
        let usedOcr = false;

        // Primeiro, tentar extrair texto normalmente
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

        // Se não conseguiu extrair texto, usar OCR
        if (!fullText.trim()) {
            console.log('[PDF Parser] PDF sem texto extraível, usando OCR...');

            if (onOcrProgress) {
                onOcrProgress({ status: 'Iniciando OCR...', progress: 0 });
            }

            fullText = await extractTextWithOCR(pdf, onOcrProgress);
            usedOcr = true;

            console.log('[PDF Parser] Texto OCR:', fullText.substring(0, 500));

            if (!fullText.trim()) {
                return {
                    success: false,
                    weeks: [],
                    records: [],
                    error: 'PDF sem texto extraível (OCR também falhou)',
                    usedOcr: true
                };
            }
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
            let partSequence = 0; // Contador de sequência por semana

            for (const part of week.parts) {
                partSequence++; // Incrementar sequência para cada parte

                // Normalizar título para remover mojibake
                const normalizedTitle = normalizeMojibake(part.title);

                // Extrair numeração da apostila do título (ex: "4. Iniciando" → "4.")
                const numberMatch = normalizedTitle.match(/^(\d+\.)\s*/);
                const workbookNumber = numberMatch ? numberMatch[1] : undefined;
                const cleanTitle = numberMatch ? normalizedTitle.replace(numberMatch[0], '').trim() : normalizedTitle;

                // Inferir seção e parte padrão (usando título normalizado)
                const section = inferSectionFromTitle(normalizedTitle);
                const standardPartKey = inferStandardPartKey(normalizedTitle);

                // Calcular modalidade da parte (usando standardPart se disponível)
                const modality = standardPartKey && StandardPart[standardPartKey]
                    ? PartModalityEnum[StandardPart[standardPartKey].modality]
                    : inferModalityFromTitle(normalizedTitle, section);

                // Row do Titular
                if (part.student) {
                    records.push({
                        id: `hr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        weekId: week.date?.substring(0, 7) || '',
                        weekDisplay: week.label,
                        date: week.date || '',
                        section,
                        standardPartKey,
                        partTitle: cleanTitle,
                        partSequence,
                        workbookNumber,
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
                        section,
                        standardPartKey,
                        partTitle: cleanTitle,
                        partSequence,
                        workbookNumber,
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
            records,
            usedOcr
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
