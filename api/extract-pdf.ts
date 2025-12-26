import { VercelRequest, VercelResponse } from '@vercel/node';
// @ts-ignore
const pdf = require('pdf-parse');
import { IncomingForm, File } from 'formidable';
import fs from 'fs';

// Constantes
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

// Configuração para o formidable não fazer parse automático do body (o Vercel pode já ter feito)
// mas normalmente precisamos usar o formidable para multipart
export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const form = new IncomingForm();

        const [fields, files] = await new Promise<[any, any]>((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) reject(err);
                resolve([fields, files]);
            });
        });

        const file = Array.isArray(files.file) ? files.file[0] : files.file;
        if (!file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const dataBuffer = fs.readFileSync(file.filepath);
        const data = await pdf(dataBuffer);
        const text_content = data.text;

        // Lógica de Extração (Adaptada para Texto Puro)
        const lines = text_content.split(/\n/).filter((line: string) => line.trim() !== '');

        // 1. Detectar Ano
        const yearMatch = text_content.match(/\b(20\d{2})\b/);
        const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

        // Estrutura de retorno
        const allWeeks: any = {};

        let currentWeekId: string | null = null;
        let currentSection = 'INICIO'; // Estado para rastrear seção atual baseada em headers

        // Regex Patterns
        // "7-13 DE OUTUBRO"
        const weekPattern1 = /(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:DE\s+)?([A-ZÇÃÉÍÓÚÂÊÎÔÛ]+)/i;
        // "30 DE SETEMBRO–6 DE OUTUBRO"
        const weekPattern2 = /(\d{1,2})\s*(?:DE\s+)?([A-ZÇÃÉÍÓÚÂÊÎÔÛ]+)\s*[-–]\s*(\d{1,2})[°º.ª]*\s*(?:DE\s+)?([A-ZÇÃÉÍÓÚÂÊÎÔÛ]+)/i;

        const partPattern = /^(\d+)\.\s*(.+)$/;
        const timePattern = /\((\d+)\s*min\)/;

        // Headers de Seção
        const HEADERS = {
            'TESOUROS DA PALAVRA DE DEUS': 'TESOUROS',
            'FAÇA SEU MELHOR NO MINISTÉRIO': 'MINISTERIO',
            'NOSSA VIDA CRISTÃ': 'VIDA'
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const upperLine = line.toUpperCase();

            // Detectar Semana (Tipo 2 primeiro: Setembro-Outubro)
            const matchW2 = line.match(weekPattern2);
            if (matchW2) {
                const day1 = parseInt(matchW2[1]);
                const month1Name = matchW2[2].toLowerCase();
                // const day2 = parseInt(matchW2[3]);
                // const month2Name = matchW2[4].toLowerCase();
                const month1 = MESES[month1Name] || MESES[month1Name.replace('ç', 'c')] || 1;

                const weekId = `${year}-${String(month1).padStart(2, '0')}-${String(day1).padStart(2, '0')}`;
                if (!allWeeks[weekId]) {
                    currentWeekId = weekId;
                    currentSection = 'INICIO'; // Nova semana reseta seção
                    allWeeks[weekId] = {
                        weekId,
                        display: line, // Usa o texto original da linha como display
                        parts: {}
                    };
                }
                continue;
            }

            // Detectar Semana (Tipo 1: 7-13 de Outubro)
            const matchW1 = line.match(weekPattern1);
            if (matchW1) {
                // Verificar se não é falso positivo (ex: texto no meio de frase)
                // Geralmente headers de semana são curtos ou isolados
                if (line.length < 50) {
                    const day1 = parseInt(matchW1[1]);
                    // const day2 = parseInt(matchW1[2]);
                    const monthName = matchW1[3].toLowerCase();
                    const month = MESES[monthName] || MESES[monthName.replace('ç', 'c')] || 1;

                    const weekId = `${year}-${String(month).padStart(2, '0')}-${String(day1).padStart(2, '0')}`;
                    if (!allWeeks[weekId]) {
                        currentWeekId = weekId;
                        currentSection = 'INICIO'; // Nova semana reseta seção
                        allWeeks[weekId] = {
                            weekId,
                            display: line,
                            parts: {}
                        };
                    }
                    continue;
                }
            }

            if (!currentWeekId) continue;

            // Detectar Seção por Texto
            for (const [headerText, sectionKey] of Object.entries(HEADERS)) {
                if (upperLine.includes(headerText)) {
                    currentSection = sectionKey;
                    break;
                }
            }
            if (upperLine.includes('CÂNTICO') && !upperLine.includes('ORACAO')) {
                // Cânticos podem aparecer em várias seções, mas geralmente não mudam a seção principal
                // exceto Cântico final. Mas mantemos section tracking.
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
                    // Remove tempo do tema
                    const timeIndex = temaRaw.indexOf(timeMatch[0]);
                    const beforeTime = temaRaw.substring(0, timeIndex).trim();
                    const afterTime = temaRaw.substring(timeIndex + timeMatch[0].length).trim();

                    temaRaw = beforeTime;
                    // O texto após o tempo muitas vezes é parte da descrição inicial
                    // ou lixo de formatação
                }

                // Limpeza do tema
                let tema = temaRaw.replace(/[:\s—–-]+$/, '').trim();

                let descricao = '';
                let detalhes = '';

                // Tentar pegar próxima linha como descrição se não for header/outra parte
                if (i + 1 < lines.length) {
                    const nextLine = lines[i + 1].trim();
                    const nextUpper = nextLine.toUpperCase();
                    const isNextPart = partPattern.test(nextLine);
                    const isHeader = Object.keys(HEADERS).some(h => nextUpper.includes(h));
                    const isSong = nextUpper.startsWith('CÂNTICO');

                    if (!isNextPart && !isHeader && !isSong) {
                        descricao = nextLine;
                        // Pegar mais linhas para detalhes?
                        // Simplificação: apenas próxima linha por enquanto no pdf-parse text-only
                    }
                }

                const week = allWeeks[currentWeekId];
                if (!week.parts[num]) {
                    week.parts[num] = {
                        num,
                        tema,
                        duracao,
                        descricao,
                        detalhes,
                        section: currentSection
                    };
                }
            }
        }

        // Converter para Lista Plana (igual ao endpoint Python)
        const records: any[] = [];

        const sortedWeekIds = Object.keys(allWeeks).sort();
        for (const wId of sortedWeekIds) {
            const week = allWeeks[wId];
            let seq = 1;
            let currentTimeMinutes = 19 * 60 + 30; // 19:30

            const sortedParts = Object.keys(week.parts).map(Number).sort((a, b) => a - b);

            for (const num of sortedParts) {
                const part = week.parts[num];
                const sectionKey = part.section;
                const secao = SECOES[sectionKey] || sectionKey;
                const temaLower = part.tema.toLowerCase();

                let tipo = 'Parte';
                let needsHelper = false;

                if (temaLower.includes('joias espirituais')) tipo = 'Joias Espirituais';
                else if (temaLower.includes('leitura da bíblia')) tipo = 'Leitura da Bíblia';
                else if (temaLower.includes('iniciando')) { tipo = 'Iniciando Conversas'; needsHelper = true; }
                else if (temaLower.includes('cultivando')) { tipo = 'Cultivando o Interesse'; needsHelper = true; }
                else if (temaLower.includes('fazendo')) { tipo = 'Fazendo Discípulos'; needsHelper = true; }
                else if (temaLower.includes('explicando')) { tipo = 'Explicando Suas Crenças'; needsHelper = true; }
                else if (temaLower.includes('discurso') && sectionKey === 'MINISTERIO') tipo = 'Discurso de Estudante';
                else if (temaLower.includes('estudo bíblico de congregação')) tipo = 'Dirigente EBC';
                else if (temaLower.includes('necessidades')) tipo = 'Necessidades Locais';
                else if (num === 1 && sectionKey === 'TESOUROS') tipo = 'Discurso Tesouros';
                else if (sectionKey === 'VIDA') tipo = 'Parte Vida Cristã';
                else if (sectionKey === 'MINISTERIO') tipo = 'Parte Ministério';
                else if (sectionKey === 'TESOUROS') tipo = 'Parte Tesouros';

                const modalidade = TIPO_TO_MODALIDADE[tipo] || derivarModalidade(tipo);
                const duracaoVal = parseInt(part.duracao || '5');

                // Titular
                records.push({
                    id: crypto.randomUUID(),
                    weekId: wId,
                    weekDisplay: week.display,
                    date: wId,
                    section: secao,
                    tipoParte: tipo,
                    modalidade: modalidade,
                    tituloParte: `${num}. ${part.tema}`,
                    descricaoParte: part.descricao,
                    detalhesParte: part.detalhes,
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
                        weekId: wId,
                        weekDisplay: week.display,
                        date: wId,
                        section: secao,
                        tipoParte: `${tipo} (Ajudante)`,
                        modalidade: modalidade,
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

        res.status(200).json({
            success: true,
            totalParts: records.length,
            totalWeeks: sortedWeekIds.length,
            year: year,
            records: records
        });

    } catch (e: any) {
        console.error(e);
        res.status(500).json({
            success: false,
            error: e.message || 'Internal Server Error'
        });
    }
}

function minsToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function derivarModalidade(tipo: string): string {
    return 'Demonstração';
}
