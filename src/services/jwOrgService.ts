/**
 * JW.org Service — Busca e parseia a apostila Vida e Ministério do wol.jw.org
 * 
 * Fluxo: data da semana → proxy Edge → HTML → parse → WorkbookExcelRow[]
 */

import type { WorkbookExcelRow } from './workbookService';
import { buildWorkbookParts } from './workbookPartsBuilder';
import { validateWeekAgainstTemplate } from '../constants/s140Template';
import { workbookImportService } from './workbookImportService';

// ===== Constantes =====

const MESES: Record<string, number> = {
    'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
    'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
    'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
};

const MESES_UPPER: Record<string, number> = Object.fromEntries(
    Object.entries(MESES).map(([k, v]) => [k.toUpperCase(), v])
);

const SECTIONS: Record<string, string> = {
    'TESOUROS DA PALAVRA DE DEUS': 'Tesouros da Palavra de Deus',
    'FAÇA SEU MELHOR NO MINISTÉRIO': 'Faça Seu Melhor no Ministério',
    'NOSSA VIDA CRISTÃ': 'Nossa Vida Cristã',
};

const TIPO_TO_MODALIDADE: Record<string, string> = {
    'Presidente': 'Presidência',
    'Cântico': 'Cântico',
    'Oração Final': 'Oração',
    'Discurso Tesouros': 'Discurso de Ensino',
    'Joias Espirituais': 'Discurso de Ensino',
    'Leitura da Bíblia': 'Leitura de Estudante',
    'Iniciando Conversas': 'Demonstração',
    'Cultivando o Interesse': 'Demonstração',
    'Fazendo Discípulos': 'Demonstração',
    'Explicando Suas Crenças': 'Demonstração',
    'Discurso de Estudante': 'Discurso de Estudante',
    'Dirigente EBC': 'Dirigente de EBC',
    'Leitor EBC': 'Leitor de EBC',
    'Necessidades Locais': 'Discurso de Ensino',
    'Parte Vida Cristã': 'Discurso de Ensino',
};

// Partes AUTO inseridas pelo builder — se parseadas do HTML, devem ser filtradas para evitar duplicação
const AUTO_PART_TYPES = [
    'cântico inicial', 'cantico inicial',
    'oração inicial', 'oracao inicial',
    'comentários iniciais', 'comentarios iniciais',
    'comentários finais', 'comentarios finais',
    'oração final', 'oracao final',
    'cântico final', 'cantico final',
];

// ===== Tipos =====

export interface JwFetchResult {
    success: boolean;
    parts: WorkbookExcelRow[];
    weekDisplay: string;
    weekId: string;
    totalParts: number;
    error?: string;
}

export interface JwImportResult {
    success: boolean;
    message: string;
    totalParts: number;
    weekDisplay: string;
    weekId: string;
    error?: string;
}

// ===== Utilidades =====

/** Calcula ano e semana ISO a partir de uma data */
function getISOWeek(date: Date): { year: number; week: number } {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return { year: d.getUTCFullYear(), week };
}

/** Formata minutos absolutos para HH:MM */
function formatTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Classifica o tipo da parte pelo título.
 * 
 * "Explicando Suas Crenças" pode ser demonstração (titular+ajudante) ou
 * discurso (só titular). A heurística usa a presença de "discurso" no título
 * para decidir. Sem "discurso", assume demonstração (com ajudante).
 */
function classifyPartType(title: string, sectionKey: string, partNum: number): { tipo: string; needsHelper: boolean } {
    const lower = title.toLowerCase();

    if (lower.includes('joias espirituais')) return { tipo: 'Joias Espirituais', needsHelper: false };
    if (lower.includes('leitura da bíblia') || lower.includes('leitura da biblia'))
        return { tipo: 'Leitura da Bíblia', needsHelper: false };
    if (lower.includes('iniciando')) return { tipo: 'Iniciando Conversas', needsHelper: true };
    if (lower.includes('cultivando')) return { tipo: 'Cultivando o Interesse', needsHelper: true };
    if (lower.includes('fazendo disc')) return { tipo: 'Fazendo Discípulos', needsHelper: true };
    if (lower.includes('explicando')) {
        // "Explicando Suas Crenças" pode ser demonstração ou discurso.
        // Se o título contém "discurso", é só titular (sem ajudante).
        const isDiscurso = lower.includes('discurso');
        return { tipo: 'Explicando Suas Crenças', needsHelper: !isDiscurso };
    }
    if (lower.includes('discurso') && sectionKey === 'MINISTERIO')
        return { tipo: 'Discurso de Estudante', needsHelper: false };
    if (lower.includes('estudo bíblico de congregação') || lower.includes('estudo biblico de congregacao'))
        return { tipo: 'Dirigente EBC', needsHelper: false };
    if (lower.includes('necessidades')) return { tipo: 'Necessidades Locais', needsHelper: false };
    if (partNum === 1 && sectionKey === 'TESOUROS') return { tipo: 'Discurso Tesouros', needsHelper: false };
    if (sectionKey === 'VIDA') return { tipo: 'Parte Vida Cristã', needsHelper: false };
    if (sectionKey === 'MINISTERIO') return { tipo: 'Parte Ministério', needsHelper: false };
    if (sectionKey === 'TESOUROS') return { tipo: 'Parte Tesouros', needsHelper: false };

    return { tipo: 'Parte', needsHelper: false };
}

// ===== Fetch & Parse =====

/**
 * Busca o HTML da apostila de uma semana específica via proxy Edge
 */
async function fetchWeekHtml(weekDate: Date): Promise<{ html: string; articleUrl: string }> {
    const { year, week } = getISOWeek(weekDate);

    const res = await fetch(`/api/fetch-workbook?year=${year}&week=${week}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
        throw new Error(data.error || `Erro ao buscar apostila: HTTP ${res.status}`);
    }

    return { html: data.html, articleUrl: data.articleUrl };
}

/**
 * Parseia o HTML da apostila e extrai as partes estruturadas.
 * 
 * REGRAS DE PARSING (refinadas):
 * 
 * CÂNTICOS:
 * - O HTML contém 3 cânticos: Inicial, Meio e Final.
 * - Cântico Inicial: H3 no formato "Cântico NN e oração | Comentários iniciais (1 min)"
 *   → Aparece ANTES de qualquer seção H2 ou dentro de "Início da Reunião"
 * - Cântico do Meio: H3 no formato "Cântico NN" (sem número de parte)
 *   → Aparece entre as seções Ministério e Vida Cristã
 * - Cântico Final: H3 no formato "Comentários finais (3 min) | Cântico NN e oração"
 *   → Aparece no final do documento, após o EBC
 * 
 * DURAÇÕES:
 * - Formato: (N min) ou (N min.) — o ponto após "min" é opcional
 * - Se não encontrado no texto do H3, buscar no texto acumulado dos siblings
 * - Fallback: usar duração padrão do template S-140 para aquele tipo de parte
 * 
 * ORDENAÇÃO:
 * - As partes parseadas do HTML seguem a ordem do documento
 * - O Cântico do Meio é REMOVIDO da lista principal e passado ao builder como parâmetro
 * - O builder posiciona o Cântico do Meio entre Ministério e Vida Cristã (posição canônica)
 * 
 * SEÇÕES:
 * - H2 determina a seção atual (Tesouros, Ministério, Vida Cristã)
 * - H3 dentro de uma seção são as partes numeradas
 * - H3 sem número de parte podem ser cânticos ou headers especiais
 */
function parseWorkbookHtml(html: string, weekDate: Date): JwFetchResult {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 1. Extrair header da semana: "16-22 DE MARÇO"
    const bodyText = doc.body?.textContent || '';
    const weekHeaderMatch = bodyText.match(
        /(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(?:DE\s+)?([A-ZÇÃÉÍÓÚÂÊÎÔÛ]{3,})/i
    );

    let weekDisplay = '';
    let weekId = '';
    const year = weekDate.getFullYear();

    if (weekHeaderMatch) {
        const day1 = parseInt(weekHeaderMatch[1]);
        const day2 = parseInt(weekHeaderMatch[2]);
        const monthName = weekHeaderMatch[3].toLowerCase();
        const month = MESES_UPPER[weekHeaderMatch[3].toUpperCase()] || MESES[monthName] || (weekDate.getMonth() + 1);
        weekDisplay = `${day1}-${day2} de ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}`;
        weekId = `${year}-${String(month).padStart(2, '0')}-${String(day1).padStart(2, '0')}`;
    } else {
        // Fallback from the date input
        const m = weekDate.getMonth() + 1;
        const d = weekDate.getDate();
        weekId = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        weekDisplay = weekId;
    }

    // 2. Extrair números dos 3 cânticos do texto completo
    //    Formato abertura: "Cântico 21 e oração"
    //    Formato meio: "Cântico 100" (standalone H3)
    //    Formato encerramento: "Cântico 42 e oração" (no final, após "Comentários finais")
    const canticoRegex = /c[aâ]ntico\s+(\d+)/gi;
    const allCanticos: number[] = [];
    let canticoScan: RegExpExecArray | null;
    while ((canticoScan = canticoRegex.exec(bodyText)) !== null) {
        const num = parseInt(canticoScan[1]);
        if (!allCanticos.includes(num)) {
            allCanticos.push(num);
        }
    }
    // Tipicamente: [21, 100, 42] → inicial, meio, final
    const canticoInicial = allCanticos.length >= 1 ? allCanticos[0] : null;
    const canticoMeio = allCanticos.length >= 2 ? allCanticos[1] : null;
    const canticoFinal = allCanticos.length >= 3 ? allCanticos[2] : null;

    console.log(`[jwOrgService] Cânticos detectados: Inicial=${canticoInicial}, Meio=${canticoMeio}, Final=${canticoFinal}`);

    // 3. Parse sections and parts from the HTML headings
    const parts: WorkbookExcelRow[] = [];
    let seq = 1;
    let currentTime = 19 * 60 + 30; // 19:30

    // Gather all h2 (sections) and h3 (parts) in document order
    const headings = doc.querySelectorAll('h2, h3');
    let currentSection = '';
    let currentSectionKey = '';

    // Durações padrão por tipo de parte (fallback do template S-140)
    const DEFAULT_DURATIONS: Record<string, number> = {
        'Discurso Tesouros': 10,
        'Joias Espirituais': 10,
        'Leitura da Bíblia': 4,
        'Iniciando Conversas': 3,
        'Cultivando o Interesse': 4,
        'Fazendo Discípulos': 5,
        'Explicando Suas Crenças': 5,
        'Discurso de Estudante': 5,
        'Parte Vida Cristã': 15,
        'Necessidades Locais': 15,
        'Dirigente EBC': 30,
    };

    headings.forEach((heading) => {
        const text = (heading.textContent || '').trim();

        if (heading.tagName === 'H2') {
            // Section header
            const upper = text.toUpperCase();
            for (const [key, canonical] of Object.entries(SECTIONS)) {
                if (upper.includes(key)) {
                    currentSection = canonical;
                    currentSectionKey = key.includes('TESOUROS') ? 'TESOUROS' :
                        key.includes('MINISTÉRIO') ? 'MINISTERIO' : 'VIDA';
                    break;
                }
            }
            return;
        }

        // h3 — Detectar cânticos (heading sem número de parte: "Cântico 65")
        // Ignorar: cânticos inicial e final são gerenciados pelo builder
        // Capturar: Cântico do Meio é passado como parâmetro ao builder
        const canticoMatch = text.match(/c[aâ]ntico\s+(\d+)/i);
        if (canticoMatch && !text.match(/^\d+\./)) {
            // Se contém "oração" ou "comentários", é cântico de abertura/encerramento → ignorar (builder insere)
            const lower = text.toLowerCase();
            if (lower.includes('oração') || lower.includes('oracao') || 
                lower.includes('comentários') || lower.includes('comentarios')) {
                return; // Cântico inicial ou final — builder cuida
            }
            // É o Cântico do Meio — NÃO adicionar à lista (será passado via options ao builder)
            return;
        }

        // h3 que começa com "Comentários finais" → ignorar (builder insere)
        if (text.toLowerCase().startsWith('comentários finais') || text.toLowerCase().startsWith('comentarios finais')) {
            return;
        }

        // h3 — potential numbered part
        // Match: "N. Title" or "N. Title (X min)"
        const partMatch = text.match(/^(\d+)\.\s+(.+)/);
        if (!partMatch) return;
        if (!currentSection) return;

        const partNum = parseInt(partMatch[1]);
        let titleAndRest = partMatch[2];

        // Extract duration — aceita "min" ou "min." com ponto opcional
        const timeMatch = titleAndRest.match(/\((\d+)\s*min\.?\)/);
        // Classify first to get default duration as fallback
        const { tipo, needsHelper } = classifyPartType(titleAndRest, currentSectionKey, partNum);
        const defaultDur = DEFAULT_DURATIONS[tipo] || 5;
        const duracao = timeMatch ? timeMatch[1] : String(defaultDur);
        const duracaoMin = parseInt(duracao);

        // Title is everything before (X min)
        let title = timeMatch
            ? titleAndRest.substring(0, timeMatch.index).trim()
            : titleAndRest;
        title = title.replace(/[:\s—–-]+$/, '').trim();

        // Description: text after (X min) in the same h3, or next sibling content
        let descricao = '';
        let detalhes = '';
        if (timeMatch) {
            const afterTime = titleAndRest.substring((timeMatch.index || 0) + timeMatch[0].length).trim();
            if (afterTime) {
                descricao = afterTime.replace(/^[:\s—–-]+/, '').trim();
            }
        }

        // Also grab text from next sibling paragraphs/divs until next heading
        let nextSibling = heading.nextElementSibling;
        const extraLines: string[] = [];
        while (nextSibling && nextSibling.tagName !== 'H2' && nextSibling.tagName !== 'H3') {
            const sibText = (nextSibling.textContent || '').trim();
            if (sibText && !sibText.startsWith('Sua resposta')) {
                extraLines.push(sibText);
            }
            nextSibling = nextSibling.nextElementSibling;
        }
        if (!descricao && extraLines.length > 0) {
            descricao = extraLines[0];
            detalhes = extraLines.slice(1).join(' ');
        } else if (extraLines.length > 0) {
            detalhes = extraLines.join(' ');
        }

        // tipo e needsHelper já classificados acima (antes da extração de duração)
        const modalidade = TIPO_TO_MODALIDADE[tipo] || 'Demonstração';

        // Titular record
        parts.push({
            year,
            weekId,
            weekDisplay,
            date: weekId,
            section: currentSection,
            tipoParte: tipo,
            modalidade,
            tituloParte: `${partNum}. ${title}`,
            descricaoParte: descricao.substring(0, 500),
            detalhesParte: detalhes.substring(0, 1000),
            seq,
            funcao: 'Titular',
            duracao,
            horaInicio: formatTime(currentTime),
            horaFim: formatTime(currentTime + duracaoMin),
            rawPublisherName: '',
            status: 'PENDENTE',
        });
        currentTime += duracaoMin;
        seq += 1;

        // Ajudante record for parts that need helpers
        if (needsHelper) {
            parts.push({
                year,
                weekId,
                weekDisplay,
                date: weekId,
                section: currentSection,
                tipoParte: `${tipo} (Ajudante)`,
                modalidade,
                tituloParte: `${partNum}. ${title} - Ajudante`,
                descricaoParte: '',
                detalhesParte: '',
                seq,
                funcao: 'Ajudante',
                duracao: '',
                horaInicio: formatTime(currentTime - duracaoMin),
                horaFim: formatTime(currentTime),
                rawPublisherName: '',
                status: 'PENDENTE',
            });
            seq += 1;
        }
    });

    // Also detect EBC Leitor — if there's a "Estudo bíblico de congregação", add Leitor
    const hasEbc = parts.some(p => p.tipoParte === 'Dirigente EBC');
    if (hasEbc) {
        const ebcPart = parts.find(p => p.tipoParte === 'Dirigente EBC')!;
        parts.push({
            year,
            weekId,
            weekDisplay,
            date: weekId,
            section: ebcPart.section,
            tipoParte: 'Leitor EBC',
            modalidade: 'Leitor de EBC',
            tituloParte: 'Leitor do Estudo Bíblico de Congregação',
            descricaoParte: '',
            detalhesParte: '',
            seq,
            funcao: 'Titular',
            duracao: '0',
            horaInicio: ebcPart.horaInicio,
            horaFim: ebcPart.horaFim,
            rawPublisherName: '',
            status: 'PENDENTE',
        });
    }

    // Filtrar partes AUTO que possam ter sido parseadas do HTML (evitar duplicação)
    // O builder vai inserir essas partes automaticamente
    const filteredParts = parts.filter(p => {
        const lower = p.tipoParte.toLowerCase().trim();
        return !AUTO_PART_TYPES.includes(lower);
    });

    // Aplicar builder para inserir partes automáticas e horários padronizados
    // Passar números dos 3 cânticos extraídos do HTML
    const partesFinal = buildWorkbookParts(filteredParts, {
        presidente: '', // Pode ser ajustado se necessário
        horaInicioReuniao: '19:30',
        incluirComentarios: true,
        incluirOracoes: true,
        incluirCanticos: true,
        canticoInicial: canticoInicial ?? undefined,
        canticoMeio: canticoMeio ?? undefined,
        canticoFinal: canticoFinal ?? undefined,
    });

    // Validar resultado contra o template S-140
    const validation = validateWeekAgainstTemplate(partesFinal);
    if (validation.warnings.length > 0) {
        console.warn(`[jwOrgService] Warnings para semana ${weekId}:`, validation.warnings);
    }
    if (!validation.valid) {
        console.error(`[jwOrgService] Erros de validação para semana ${weekId}:`, validation.errors);
    }

    return {
        success: partesFinal.length > 0,
        parts: partesFinal,
        weekDisplay,
        weekId,
        totalParts: partesFinal.length,
        error: partesFinal.length === 0 ? 'Nenhuma parte encontrada no HTML' : undefined,
    };
}

// ===== API Pública =====

/**
 * Busca e parseia a apostila de uma semana do jw.org
 */
export async function fetchWorkbookFromJwOrg(weekDate: Date): Promise<JwFetchResult> {
    const { html } = await fetchWeekHtml(weekDate);
    return parseWorkbookHtml(html, weekDate);
}

/**
 * Busca, parseia e SALVA no banco (fluxo completo)
 */
export async function importWorkbookFromJwOrg(weekDate: Date): Promise<JwImportResult> {
    try {
        const result = await fetchWorkbookFromJwOrg(weekDate);

        if (!result.success || result.parts.length === 0) {
            return {
                success: false,
                message: result.error || 'Nenhuma parte extraída',
                totalParts: 0,
                weekDisplay: result.weekDisplay,
                weekId: result.weekId,
                error: result.error,
            };
        }

        // Salvar via boundary de importação (mesmo caminho do upload Excel)
        const batch = await workbookImportService.importBatch(
            `jw.org — ${result.weekDisplay}`,
            result.parts
        );

        return {
            success: true,
            message: `✅ ${result.totalParts} partes importadas com sucesso para a semana ${result.weekDisplay} (Batch: ${batch.id})`,
            totalParts: result.totalParts,
            weekDisplay: result.weekDisplay,
            weekId: result.weekId,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        return {
            success: false,
            message: `Erro ao importar: ${message}`,
            totalParts: 0,
            weekDisplay: '',
            weekId: '',
            error: message,
        };
    }
}

/**
 * Busca múltiplas semanas sequenciais do jw.org
 */
export async function importMultipleWeeks(startDate: Date, count: number): Promise<JwImportResult[]> {
    const results: JwImportResult[] = [];
    const d = new Date(startDate);

    for (let i = 0; i < count; i++) {
        const result = await importWorkbookFromJwOrg(new Date(d));
        results.push(result);
        d.setDate(d.getDate() + 7); // Next week
    }

    return results;
}
