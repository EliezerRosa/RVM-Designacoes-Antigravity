/**
 * S-140 Generator com Sala B - Versão Completa
 * Gera PDF do formulário S-140 com colunas para Salão Principal e Sala B
 */

import html2pdf from 'html2pdf.js';
import type { WorkbookPart } from '../types';

// ============================================================================
// TIPOS
// ============================================================================

export interface S140RoomBWeekData {
    weekId: string;
    weekDisplay: string;
    bibleReading: string;
    president: string;
    counselorRoomB: string;
    parts: S140RoomBPart[];
}

export interface S140RoomBPart {
    seq: number;
    section: string;
    time: string;
    title: string;
    duration: number;
    // Salão Principal
    mainHallAssignee: string;
    mainHallAssistant?: string;
    // Sala B
    roomBAssignee?: string;
    roomBAssistant?: string;
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
    'Faça Seu Melhor no Ministério': { bg: '#c4a03c', text: '#000000' },
    'Ministério': { bg: '#c4a03c', text: '#000000' },
    'Nossa Vida Cristã': { bg: '#942a39', text: '#ffffff' },
    'Vida Cristã': { bg: '#942a39', text: '#ffffff' },
};

// Partes que não precisam de assignee visível
const HIDDEN_ASSIGNEE_PARTS = [
    'Cântico Inicial', 'Cântico do Meio', 'Cântico Final',
    'Comentários Iniciais', 'Comentários Finais'
];

// Partes de estudante (podem ter Sala B)
const STUDENT_PARTS = [
    'Leitura da Bíblia', 'Leitura da Biblia', 'Leitura',
    'Iniciando Conversas', 'Cultivando o Interesse',
    'Fazendo Discípulos', 'Explicando Suas Crenças',
    'Discurso de Estudante'
];

// ============================================================================
// FUNÇÕES DE PREPARAÇÃO DE DADOS
// ============================================================================

/**
 * Função para normalizar tipoParte
 */
function normalizeTipoParte(tipo: string): string {
    return tipo
        .replace(/\s*\(Ajudante\)\s*/gi, '')
        .replace(/\s*\(\d+\s*min\)\s*/gi, '')
        .trim();
}

/**
 * Prepara os dados do S-140 com Sala B
 */
export function prepareS140RoomBData(parts: WorkbookPart[]): S140RoomBWeekData {
    if (parts.length === 0) {
        throw new Error('Nenhuma parte fornecida para o S-140');
    }

    // Ordenar por seq
    const sortedParts = [...parts].sort((a, b) => (a.seq || 0) - (b.seq || 0));

    // Encontrar presidente e conselheiro Sala B
    const presidentPart = sortedParts.find(p => p.tipoParte === 'Presidente' || p.tipoParte === 'Presidente da Reunião');
    // Para conselheiro da Sala B, podemos usar uma parte específica ou deixar configurável
    const counselorPart = sortedParts.find(p => p.tipoParte?.includes('Conselheiro') || p.tipoParte?.includes('Dirigente Sala B'));

    // Separar titulares de ajudantes
    const titularParts = sortedParts.filter(p => p.funcao === 'Titular');
    const ajudanteParts = sortedParts.filter(p => p.funcao === 'Ajudante');

    // Mapa de ajudantes por tipoParte normalizado
    const ajudanteByTipo = new Map<string, string>();
    ajudanteParts.forEach(a => {
        const name = a.resolvedPublisherName || a.rawPublisherName || '';
        const normalizedTipo = normalizeTipoParte(a.tipoParte);
        if (name && normalizedTipo) {
            ajudanteByTipo.set(normalizedTipo, name);
        }
    });

    // Partes que mostram assignee
    const PARTS_WITH_ASSIGNEE = [
        'Presidente', 'Presidente da Reunião',
        'Tesouros', 'Tesouros da Palavra de Deus', 'Discurso Tesouros', 'Joias', 'Joias Espirituais',
        'Leitura da Bíblia', 'Leitura da Biblia', 'Leitura',
        'Iniciando Conversas', 'Cultivando o Interesse', 'Fazendo Discípulos', 'Explicando Suas Crenças',
        'Discurso de Estudante', 'Discurso',
        'Necessidades Locais', 'Necessidades da Congregação', 'Necessidades',
        'Dirigente EBC', 'Leitor EBC', 'Estudo Bíblico de Congregação', 'Dirigente', 'Leitor',
        'Oração Inicial', 'Oracao Inicial', 'Oração Final', 'Oracao Final',
        'Lembre-se', 'Tire tempo', 'Parte Vida Cristã'
    ];

    const preparedParts: S140RoomBPart[] = titularParts.map(p => {
        const time = p.horaInicio || '';
        const isStudentPart = STUDENT_PARTS.some(sp =>
            p.tipoParte.toLowerCase().includes(sp.toLowerCase())
        );

        let mainHallAssignee = '';
        const showsAssignee = PARTS_WITH_ASSIGNEE.some(pa =>
            p.tipoParte.includes(pa) || (p.tituloParte && p.tituloParte.includes(pa))
        );

        if (showsAssignee) {
            mainHallAssignee = p.resolvedPublisherName || p.rawPublisherName || '';
        }

        // Buscar ajudante pelo tipoParte normalizado
        const normalizedTipo = normalizeTipoParte(p.tipoParte);
        const mainHallAssistant = ajudanteByTipo.get(normalizedTipo);

        // TODO: Implementar lógica para Sala B quando tivermos dados separados
        // Por enquanto, deixamos vazio (pode ser preenchido manualmente ou via outra fonte)
        const roomBAssignee = '';
        const roomBAssistant = '';

        let title = p.tituloParte || p.tipoParte;
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
            mainHallAssignee,
            mainHallAssistant,
            roomBAssignee,
            roomBAssistant,
            isStudentPart,
            tipoParte: p.tipoParte,
        };
    });

    // Extrair leitura bíblica
    const leituraPart = sortedParts.find(p =>
        p.tipoParte === 'Leitura da Bíblia' || p.tipoParte === 'Leitura da Biblia'
    );
    const bibleReading = leituraPart?.descricaoParte || '';

    return {
        weekId: sortedParts[0].weekId,
        weekDisplay: sortedParts[0].weekDisplay,
        bibleReading,
        president: presidentPart?.resolvedPublisherName || presidentPart?.rawPublisherName || '',
        counselorRoomB: counselorPart?.resolvedPublisherName || counselorPart?.rawPublisherName || '',
        parts: preparedParts,
    };
}

// ============================================================================
// GERAÇÃO DE HTML
// ============================================================================

/**
 * Gera o HTML do S-140 com Sala B
 */
export function generateS140RoomBHTML(weekData: S140RoomBWeekData): string {
    const year = new Date().getFullYear();

    // Agrupar partes por seção
    const partsBySection: Record<string, S140RoomBPart[]> = {};
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

    // Gerar HTML das partes
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
                    <td colspan="5" style="
                        background: ${colors.bg}; 
                        color: ${colors.text}; 
                        font-weight: bold; 
                        padding: 8px 12px;
                        font-size: 13px;
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

            // Formato: Nome / Ajudante
            const mainHallDisplay = showAssignee
                ? (part.mainHallAssistant ? `${part.mainHallAssignee} / ${part.mainHallAssistant}` : part.mainHallAssignee)
                : '';

            const roomBDisplay = showAssignee && part.isStudentPart
                ? (part.roomBAssistant ? `${part.roomBAssignee} / ${part.roomBAssistant}` : part.roomBAssignee || '')
                : '';

            partsHTML += `
                <tr style="border-bottom: 1px solid #E5E7EB;">
                    <td style="padding: 6px 10px; font-size: 13px; color: #6B7280; width: 55px; text-align: center;">
                        ${part.duration > 0 ? part.time : ''}
                    </td>
                    <td style="padding: 6px 10px; font-size: 14px; color: #1f2937;">
                        ${part.title}
                    </td>
                    <td style="padding: 6px 10px; font-size: 12px; color: #6B7280; width: 80px; text-align: center;">
                        ${part.isStudentPart ? 'Estudante' : ''}
                    </td>
                    <td style="padding: 6px 10px; font-size: 14px; color: #1f2937; font-weight: 600; width: 180px; background: #fafafa;">
                        ${mainHallDisplay}
                    </td>
                    <td style="padding: 6px 10px; font-size: 14px; color: #1f2937; font-weight: 600; width: 180px; background: #f0f9ff;">
                        ${roomBDisplay}
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
                    font-family: 'Segoe UI', Arial, sans-serif; 
                    font-size: 13px;
                    line-height: 1.4;
                    -webkit-font-smoothing: antialiased;
                }
                .container {
                    width: 100%;
                    max-width: 950px;
                    margin: 0 auto;
                    padding: 10px;
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                    padding-bottom: 8px;
                    border-bottom: 3px solid #4F46E5;
                }
                .header h1 {
                    font-size: 20px;
                    font-weight: 700;
                    color: #1f2937;
                }
                .header .year {
                    font-size: 20px;
                    font-weight: bold;
                    color: #4F46E5;
                }
                .week-header {
                    display: flex;
                    justify-content: space-between;
                    background: #F3F4F6;
                    padding: 10px 14px;
                    margin-bottom: 10px;
                    border-radius: 6px;
                }
                .week-date {
                    font-size: 15px;
                    font-weight: bold;
                    color: #1f2937;
                }
                .week-president {
                    font-size: 14px;
                    color: #4F46E5;
                    font-weight: 600;
                }
                .counselor-info {
                    font-size: 13px;
                    color: #059669;
                    font-weight: 500;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 13px;
                }
                th {
                    background: #4F46E5;
                    color: white;
                    padding: 10px 12px;
                    text-align: left;
                    font-size: 12px;
                    font-weight: 600;
                }
                th.room-b {
                    background: #0284c7;
                }
                th.main-hall {
                    background: #6366f1;
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
                    <span class="week-president">Presidente: ${weekData.president}</span>
                    ${weekData.counselorRoomB ? `<span class="counselor-info">Sala B: ${weekData.counselorRoomB}</span>` : ''}
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 55px;">Hora</th>
                            <th>Programa</th>
                            <th style="width: 80px;">Tipo</th>
                            <th class="main-hall" style="width: 180px;">Salão Principal</th>
                            <th class="room-b" style="width: 180px;">Sala B</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${partsHTML}
                    </tbody>
                </table>
            </div>
        </body>
        </html>
    `;
}

// ============================================================================
// GERAÇÃO DE PDF
// ============================================================================

/**
 * Gera o PDF do S-140 com Sala B
 */
export async function generateS140RoomBPDF(weekData: S140RoomBWeekData): Promise<void> {
    const html = generateS140RoomBHTML(weekData);

    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    document.body.appendChild(container);

    try {
        const opt = {
            margin: 8,
            filename: `S-140-SalaB_${weekData.weekId}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' as const }
        };

        const content = container.querySelector('.container');
        if (content) {
            await html2pdf().set(opt).from(content).save();
        }
    } finally {
        document.body.removeChild(container);
    }
}

/**
 * Função de conveniência: prepara dados e gera PDF com Sala B
 */
export async function downloadS140RoomB(parts: WorkbookPart[]): Promise<void> {
    const weekData = prepareS140RoomBData(parts);
    await generateS140RoomBPDF(weekData);
}
