/**
 * S-140 Generator - Quadro de Anúncios da Reunião
 * Gera PDF do formulário S-140 para o quadro de anúncios
 */

import html2pdf from 'html2pdf.js';
import type { WorkbookPart } from '../types';

// ============================================================================
// TIPOS
// ============================================================================

export interface S140WeekData {
    weekId: string;
    weekDisplay: string;
    bibleReading: string;
    president: string;
    prayerOpening: string;
    prayerClosing: string;
    counselorRoomB?: string;
    parts: S140Part[];
}

export interface S140Part {
    seq: number;
    section: string;
    time: string;
    title: string;
    duration: number;
    assignee: string;
    assistant?: string;
    isStudentPart: boolean;
    tipoParte: string;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const CONGREGATION_NAME = 'PARQUE JACARAÍPE';

// Cores oficiais das seções
const SECTION_COLORS: Record<string, { bg: string; text: string }> = {
    'Tesouros da Palavra de Deus': { bg: '#5a4632', text: '#ffffff' },
    'Tesouros': { bg: '#5a4632', text: '#ffffff' },
    'Faça Seu Melhor no Ministério': { bg: '#c4a03c', text: '#ffffff' },
    'Ministério': { bg: '#c4a03c', text: '#ffffff' },
    'Nossa Vida Cristã': { bg: '#942a39', text: '#ffffff' },
    'Vida Cristã': { bg: '#942a39', text: '#ffffff' },
    'Início da Reunião': { bg: '#4F46E5', text: '#ffffff' },
    'Final da Reunião': { bg: '#4F46E5', text: '#ffffff' },
};

// Partes que não precisam de assignee visível
const HIDDEN_ASSIGNEE_PARTS = [
    'Cântico Inicial', 'Cântico do Meio', 'Cântico Final',
    'Comentários Iniciais', 'Comentários Finais'
];

// Partes de estudante (aparecem na Sala B)
const STUDENT_PARTS = [
    'Leitura da Bíblia', 'Leitura da Biblia',
    'Iniciando Conversas', 'Cultivando o Interesse',
    'Fazendo Discípulos', 'Explicando Suas Crenças',
    'Discurso de Estudante'
];

// ============================================================================
// FUNÇÕES DE PREPARAÇÃO DE DADOS
// ============================================================================

/**
 * Prepara os dados do S-140 a partir das partes de uma semana
 * AJUSTES:
 * - Incluir TODAS as partes (inclusive ocultas)
 * - Usar horaInicio do BD
 * - Título = tituloParte (já tem a duração)
 * - Combinar Titular/Ajudante da mesma parte
 * - Nome só na parte "Presidente" (não Comentários/Oração)
 */
export function prepareS140Data(parts: WorkbookPart[]): S140WeekData {
    if (parts.length === 0) {
        throw new Error('Nenhuma parte fornecida para o S-140');
    }

    // Ordenar por seq
    const sortedParts = [...parts].sort((a, b) => (a.seq || 0) - (b.seq || 0));

    // Encontrar presidente, orações
    const presidentPart = sortedParts.find(p => p.tipoParte === 'Presidente' || p.tipoParte === 'Presidente da Reunião');
    const prayerOpeningPart = sortedParts.find(p => p.tipoParte === 'Oração Inicial' || p.tipoParte === 'Oracao Inicial');
    const prayerClosingPart = sortedParts.find(p => p.tipoParte === 'Oração Final' || p.tipoParte === 'Oracao Final');

    // Agrupar Titular + Ajudante por tituloParte
    const titularParts = sortedParts.filter(p => p.funcao === 'Titular');
    const ajudanteParts = sortedParts.filter(p => p.funcao === 'Ajudante');

    // Mapa de ajudantes por tituloParte
    const ajudanteMap = new Map<string, string>();
    ajudanteParts.forEach(a => {
        const key = a.tituloParte || a.tipoParte;
        const name = a.resolvedPublisherName || a.rawPublisherName || '';
        if (name) {
            ajudanteMap.set(key, name);
        }
    });

    // Partes que mostram o nome do designado
    const PARTS_WITH_ASSIGNEE = [
        'Presidente', 'Presidente da Reunião',
        'Tesouros', 'Tesouros da Palavra de Deus', 'Discurso Tesouros',
        'Joias Espirituais',
        'Leitura da Bíblia', 'Leitura da Biblia',
        'Iniciando Conversas', 'Cultivando o Interesse', 'Fazendo Discípulos', 'Explicando Suas Crenças',
        'Discurso de Estudante',
        'Necessidades Locais', 'Necessidades da Congregação',
        'Dirigente EBC', 'Leitor EBC', 'Estudo Bíblico de Congregação',
        'Oração Inicial', 'Oracao Inicial', 'Oração Final', 'Oracao Final'
    ];

    const preparedParts: S140Part[] = titularParts.map(p => {
        // Usar horaInicio do BD
        const time = p.horaInicio || '';

        // Checar se é parte de estudante
        const isStudentPart = STUDENT_PARTS.some(sp =>
            p.tipoParte.toLowerCase().includes(sp.toLowerCase())
        );

        // Determinar assignee
        let assignee = '';
        const showsAssignee = PARTS_WITH_ASSIGNEE.some(pa =>
            p.tipoParte.includes(pa) || (p.tituloParte && p.tituloParte.includes(pa))
        );

        if (showsAssignee) {
            assignee = p.resolvedPublisherName || p.rawPublisherName || '';
        }

        // Buscar ajudante se houver
        const titleKey = p.tituloParte || p.tipoParte;
        const assistant = ajudanteMap.get(titleKey);

        // Título: usar tituloParte se existir, senão tipoParte (já contém duração)
        let title = p.tituloParte || p.tipoParte;

        // Para cânticos, adicionar símbolo
        if (p.tipoParte.startsWith('Cântico')) {
            title = `□ ${title}`;
        }

        const duration = typeof p.duracao === 'string' ? parseInt(p.duracao, 10) || 0 : (p.duracao || 0);

        return {
            seq: p.seq || 0,
            section: p.section,
            time,
            title,
            duration,
            assignee,
            assistant,
            isStudentPart,
            tipoParte: p.tipoParte,
        };
    });

    return {
        weekId: sortedParts[0].weekId,
        weekDisplay: sortedParts[0].weekDisplay,
        bibleReading: extractBibleReading(sortedParts),
        president: presidentPart?.resolvedPublisherName || presidentPart?.rawPublisherName || '',
        prayerOpening: prayerOpeningPart?.resolvedPublisherName || prayerOpeningPart?.rawPublisherName || '',
        prayerClosing: prayerClosingPart?.resolvedPublisherName || prayerClosingPart?.rawPublisherName || '',
        parts: preparedParts,
    };
}

/**
 * Extrai a leitura bíblica semanal (ex: "Isaías 3-5")
 */
function extractBibleReading(parts: WorkbookPart[]): string {
    // Tentar encontrar no título da Leitura da Bíblia ou em descricaoParte
    const leituraPart = parts.find(p =>
        p.tipoParte === 'Leitura da Bíblia' || p.tipoParte === 'Leitura da Biblia'
    );
    if (leituraPart?.descricaoParte) {
        return leituraPart.descricaoParte;
    }
    // Fallback: extrair do weekDisplay ou retornar vazio
    return '';
}


// ============================================================================
// GERAÇÃO DE HTML
// ============================================================================

/**
 * Gera o HTML do S-140 para uma semana
 */
export function generateS140HTML(weekData: S140WeekData): string {
    const year = new Date().getFullYear();

    // Agrupar partes por seção
    const partsBySection: Record<string, S140Part[]> = {};
    weekData.parts.forEach(p => {
        if (!partsBySection[p.section]) {
            partsBySection[p.section] = [];
        }
        partsBySection[p.section].push(p);
    });

    // Ordem das seções
    const sectionOrder = [
        'Início da Reunião',
        'Tesouros da Palavra de Deus', 'Tesouros',
        'Faça Seu Melhor no Ministério', 'Ministério',
        'Nossa Vida Cristã', 'Vida Cristã',
        'Final da Reunião'
    ];

    // Gerar HTML das partes agrupadas
    let partsHTML = '';
    const sectionsRendered = new Set<string>();

    sectionOrder.forEach(section => {
        const parts = partsBySection[section];
        if (!parts || sectionsRendered.has(section)) return;
        sectionsRendered.add(section);

        const colors = SECTION_COLORS[section] || { bg: '#E5E7EB', text: '#1f2937' };

        // Header da seção
        if (!['Início da Reunião', 'Final da Reunião'].includes(section)) {
            partsHTML += `
                <tr>
                    <td colspan="4" style="
                        background: ${colors.bg}; 
                        color: ${colors.text}; 
                        font-weight: bold; 
                        padding: 6px 10px;
                        font-size: 11px;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    ">
                        ${section.toUpperCase()}
                    </td>
                </tr>
            `;
        }

        // Linhas das partes
        parts.forEach(part => {
            const showAssignee = !HIDDEN_ASSIGNEE_PARTS.some(h => part.tipoParte.includes(h));
            const assigneeDisplay = showAssignee
                ? (part.assistant ? `${part.assignee} / ${part.assistant}` : part.assignee)
                : '';

            partsHTML += `
                <tr style="border-bottom: 1px solid #E5E7EB;">
                    <td style="padding: 4px 8px; font-size: 10px; color: #6B7280; width: 45px; text-align: center;">
                        ${part.duration > 0 ? part.time : ''}
                    </td>
                    <td style="padding: 4px 8px; font-size: 11px; color: #1f2937;">
                        ${part.title}
                    </td>
                    <td style="padding: 4px 8px; font-size: 10px; color: #6B7280; width: 80px; text-align: center;">
                        ${part.isStudentPart ? 'Estudante' : ''}
                    </td>
                    <td style="padding: 4px 8px; font-size: 11px; color: #1f2937; font-weight: 500; width: 150px;">
                        ${assigneeDisplay}
                    </td>
                </tr>
            `;
        });
    });

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: Arial, sans-serif; 
                    font-size: 11px;
                    line-height: 1.3;
                }
                .container {
                    width: 100%;
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 10px;
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                    padding-bottom: 8px;
                    border-bottom: 2px solid #4F46E5;
                }
                .header h1 {
                    font-size: 14px;
                    color: #1f2937;
                }
                .header .year {
                    font-size: 14px;
                    font-weight: bold;
                    color: #4F46E5;
                }
                .week-header {
                    display: flex;
                    justify-content: space-between;
                    background: #F3F4F6;
                    padding: 8px 12px;
                    margin-bottom: 8px;
                    border-radius: 4px;
                }
                .week-date {
                    font-weight: bold;
                    color: #1f2937;
                }
                .week-reading {
                    color: #6B7280;
                    font-style: italic;
                }
                .week-president {
                    color: #4F46E5;
                    font-weight: 500;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 11px;
                }
                th {
                    background: #4F46E5;
                    color: white;
                    padding: 6px 8px;
                    text-align: left;
                    font-size: 10px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>${CONGREGATION_NAME}</h1>
                    <span class="year">${year}</span>
                </div>

                <div class="week-header">
                    <span class="week-date">${weekData.weekDisplay.toUpperCase()}</span>
                    <span class="week-reading">${weekData.bibleReading}</span>
                    <span class="week-president">Presidente: ${weekData.president}</span>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 45px;">Hora</th>
                            <th>Programa</th>
                            <th style="width: 80px;">Sala B</th>
                            <th style="width: 150px;">Designado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${partsHTML}
                    </tbody>
                </table>

                <div style="margin-top: 10px; font-size: 10px; color: #9CA3AF; text-align: center;">
                    Oração Inicial: ${weekData.prayerOpening} | Oração Final: ${weekData.prayerClosing}
                </div>
            </div>
        </body>
        </html>
    `;
}

// ============================================================================
// GERAÇÃO DE PDF
// ============================================================================

/**
 * Gera o PDF do S-140 e aciona o download
 */
export async function generateS140PDF(weekData: S140WeekData): Promise<void> {
    const html = generateS140HTML(weekData);

    // Criar elemento temporário
    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    document.body.appendChild(container);

    try {
        const opt = {
            margin: 10,
            filename: `S-140_${weekData.weekId}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' as const }
        };

        // Usar querySelector para obter Element (não ChildNode)
        const content = container.querySelector('.container');
        if (content) {
            await html2pdf().set(opt).from(content).save();
        }
    } finally {
        document.body.removeChild(container);
    }
}

/**
 * Função de conveniência: prepara dados e gera PDF
 */
export async function downloadS140(parts: WorkbookPart[]): Promise<void> {
    const weekData = prepareS140Data(parts);
    await generateS140PDF(weekData);
}
