
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { WorkbookExcelRow } from './workbookService';

// Configurar Worker (usando importação local compatível com Vite)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface ExtractedData {
    success: boolean;
    totalParts: number;
    totalWeeks: number;
    year: number;
    records: WorkbookExcelRow[];
    error?: string;
}

const MESES: { [key: string]: number } = {
    'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
    'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
    'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12
};

const SECOES: { [key: string]: string } = {
    'INICIO': 'Início da Reunião',
    'TESOUROS': 'Tesouros da Palavra de Deus',
    'MINISTERIO': 'Faça Seu Melhor no Ministério',
    'VIDA': 'Nossa Vida Cristã',
    'FINAL': 'Final da Reunião',
};

const TIPO_TO_MODALIDADE: { [key: string]: string } = {
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
    'Elogios e Conselhos': 'Aconselhamento',
};

export const pdfExtractionService = {
    async extractWorkbookParts(file: File): Promise<ExtractedData> {
        try {
            // Ler arquivo
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items
                    // @ts-ignore
                    .map(item => item.str)
                    .join('\n');
                fullText += pageText + '\n';
            }

            // Lógica de Extração (Portada do Serverless)
            const lines = fullText.split(/\n/).filter((line: string) => line.trim() !== '');

            // 1. Detectar Ano
            const yearMatch = fullText.match(/\b(20\d{2})\b/);
            const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

            // Estrutura interna para agrupar
            const allWeeks: any = {};
            let currentWeekId: string | null = null;
            let currentSection = 'INICIO';

            const weekPattern1 = /(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:DE\s+)?([A-ZÇÃÉÍÓÚÂÊÎÔÛ]+)/i;
            const weekPattern2 = /(\d{1,2})\s*(?:DE\s+)?([A-ZÇÃÉÍÓÚÂÊÎÔÛ]+)\s*[-–]\s*(\d{1,2})[°º.ª]*\s*(?:DE\s+)?([A-ZÇÃÉÍÓÚÂÊÎÔÛ]+)/i;
            const partPattern = /^(\d+)\.\s*(.+)$/;
            const timePattern = /\((\d+)\s*min\)/;

            const HEADERS = {
                'TESOUROS DA PALAVRA DE DEUS': 'TESOUROS',
                'FAÇA SEU MELHOR NO MINISTÉRIO': 'MINISTERIO',
                'NOSSA VIDA CRISTÃ': 'VIDA'
            };

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                const upperLine = line.toUpperCase();

                // Detectar Semana Tipo 2 (Setembro-Outubro)
                const matchW2 = line.match(weekPattern2);
                if (matchW2) {
                    const day1 = parseInt(matchW2[1]);
                    const month1Name = matchW2[2].toLowerCase();
                    const month1 = MESES[month1Name] || MESES[month1Name.replace('ç', 'c')] || 1;
                    const weekId = `${year}-${String(month1).padStart(2, '0')}-${String(day1).padStart(2, '0')}`;

                    if (!allWeeks[weekId]) {
                        currentWeekId = weekId;
                        currentSection = 'INICIO';
                        allWeeks[weekId] = { weekId, display: line, parts: {} };
                    }
                    continue;
                }

                // Detectar Semana Tipo 1 (7-13 de Outubro)
                const matchW1 = line.match(weekPattern1);
                if (matchW1 && line.length < 50) {
                    const day1 = parseInt(matchW1[1]);
                    const monthName = matchW1[3].toLowerCase();
                    const month = MESES[monthName] || MESES[monthName.replace('ç', 'c')] || 1;
                    const weekId = `${year}-${String(month).padStart(2, '0')}-${String(day1).padStart(2, '0')}`;

                    if (!allWeeks[weekId]) {
                        currentWeekId = weekId;
                        currentSection = 'INICIO';
                        allWeeks[weekId] = { weekId, display: line, parts: {} };
                    }
                    continue;
                }

                if (!currentWeekId) continue;

                // Detectar Seção
                for (const [headerText, sectionKey] of Object.entries(HEADERS)) {
                    if (upperLine.includes(headerText)) {
                        currentSection = sectionKey;
                        break;
                    }
                }

                // Detectar Parte
                const partMatch = line.match(partPattern);
                if (partMatch) {
                    const num = parseInt(partMatch[1]);
                    let temaRaw = partMatch[2];
                    let duracao = '';

                    const timeMatch = temaRaw.match(timePattern);
                    if (timeMatch) {
                        duracao = timeMatch[1];
                        const timeIndex = temaRaw.indexOf(timeMatch[0]);
                        temaRaw = temaRaw.substring(0, timeIndex).trim();
                    }

                    const tema = temaRaw.replace(/[:\s—–-]+$/, '').trim();
                    let descricao = '';

                    // Tentar pegar próxima linha como descrição simplificada
                    if (i + 1 < lines.length) {
                        const nextLine = lines[i + 1].trim();
                        const nextUpper = nextLine.toUpperCase();
                        const isNextPart = partPattern.test(nextLine);
                        const isHeader = Object.keys(HEADERS).some(h => nextUpper.includes(h));
                        const isSong = nextUpper.startsWith('CÂNTICO');

                        if (!isNextPart && !isHeader && !isSong) {
                            descricao = nextLine;
                        }
                    }

                    const week = allWeeks[currentWeekId];
                    if (!week.parts[num]) {
                        week.parts[num] = { num, tema, duracao, descricao, section: currentSection };
                    }
                }
            }

            // Converter para Flat List
            const records: WorkbookExcelRow[] = [];
            const sortedWeekIds = Object.keys(allWeeks).sort();

            for (const wId of sortedWeekIds) {
                const week = allWeeks[wId];
                let seq = 1;
                let currentTimeMinutes = 19 * 60 + 30; // 19:30

                const sortedParts = Object.keys(week.parts).map(Number).sort((a, b) => a - b);

                for (const num of sortedParts) {
                    const part = week.parts[num];
                    const secao = SECOES[part.section] || part.section;
                    const temaLower = part.tema.toLowerCase();
                    let tipo = 'Parte';
                    let needsHelper = false;

                    // Lógica de Tipo
                    if (temaLower.includes('joias espirituais')) tipo = 'Joias Espirituais';
                    else if (temaLower.includes('leitura da bíblia')) tipo = 'Leitura da Bíblia';
                    else if (temaLower.includes('iniciando')) { tipo = 'Iniciando Conversas'; needsHelper = true; }
                    else if (temaLower.includes('cultivando')) { tipo = 'Cultivando o Interesse'; needsHelper = true; }
                    else if (temaLower.includes('fazendo')) { tipo = 'Fazendo Discípulos'; needsHelper = true; }
                    else if (temaLower.includes('explicando')) { tipo = 'Explicando Suas Crenças'; needsHelper = true; }
                    else if (temaLower.includes('discurso') && part.section === 'MINISTERIO') tipo = 'Discurso de Estudante';
                    else if (temaLower.includes('estudo bíblico de congregação')) tipo = 'Dirigente EBC';
                    else if (temaLower.includes('necessidades')) tipo = 'Necessidades Locais';
                    else if (num === 1 && part.section === 'TESOUROS') tipo = 'Discurso Tesouros';
                    else if (part.section === 'VIDA') tipo = 'Parte Vida Cristã';

                    const modalidade = TIPO_TO_MODALIDADE[tipo] || 'Demonstração';
                    const duracaoVal = parseInt(part.duracao || '5');

                    // Titular
                    records.push({
                        id: crypto.randomUUID(),
                        year,
                        weekId: wId,
                        weekDisplay: week.display,
                        date: wId,
                        section: secao,
                        tipoParte: tipo,
                        modalidade,
                        tituloParte: `${num}. ${part.tema}`,
                        descricaoParte: part.descricao,
                        detalhesParte: '',
                        seq: seq++,
                        funcao: 'Titular',
                        duracao: part.duracao,
                        horaInicio: minsToTime(currentTimeMinutes),
                        horaFim: minsToTime(currentTimeMinutes + duracaoVal),
                        rawPublisherName: '',
                        status: 'DRAFT'
                    });
                    currentTimeMinutes += duracaoVal;

                    // Ajudante
                    if (needsHelper) {
                        records.push({
                            id: crypto.randomUUID(),
                            year,
                            weekId: wId,
                            weekDisplay: week.display,
                            date: wId,
                            section: secao,
                            tipoParte: `${tipo} (Ajudante)`,
                            modalidade,
                            tituloParte: `${num}. ${part.tema} - Ajudante`,
                            descricaoParte: '',
                            detalhesParte: '',
                            seq: seq++,
                            funcao: 'Ajudante',
                            duracao: '',
                            horaInicio: minsToTime(currentTimeMinutes - duracaoVal),
                            horaFim: minsToTime(currentTimeMinutes),
                            rawPublisherName: '',
                            status: 'DRAFT'
                        });
                    }
                }
            }

            return {
                success: true,
                totalParts: records.length,
                totalWeeks: sortedWeekIds.length,
                year,
                records
            };

        } catch (error: any) {
            console.error('Extraction error:', error);
            return {
                success: false,
                totalParts: 0,
                totalWeeks: 0,
                year: new Date().getFullYear(),
                records: [],
                error: error.message
            };
        }
    }
};

function minsToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
