/**
 * S-140 Generator com Sala B - Versão baseada no template oficial
 * Layout exato conforme S-140_T Sala B Template.docx
 * 
 * Especificações extraídas do template:
 * - Fonte: Calibri
 * - Cabeçalho congregação: 11pt BOLD preto
 * - Labels (Presidente, Conselheiro): 8pt BOLD #575A5D
 * - Seções: 10pt BOLD branco
 *   - Tesouros: Background #575A5D
 *   - Ministério: Background #BE8F00 (dourado)
 *   - Vida Cristã: Background #7E0024 (vermelho escuro)
 * - Colunas nas partes de estudante: Sala B + Salão Principal
 */

import html2pdf from 'html2pdf.js';
import type { WorkbookPart } from '../types';

// ============================================================================
// CONSTANTES DO TEMPLATE
// ============================================================================

const CONGREGATION_NAME = 'PARQUE JACARAÍPE';

// Cores exatas do template
const COLORS = {
    // Seções
    TESOUROS_BG: '#575A5D',
    MINISTERIO_BG: '#BE8F00',
    VIDA_CRISTA_BG: '#7E0024',
    // Texto
    HEADER_TEXT: '#000000',
    LABEL_TEXT: '#575A5D',
    WHITE: '#FFFFFF',
    // Backgrounds
    SALA_B_HEADER: '#E8F4FD',
    SALAO_PRINCIPAL_HEADER: '#F0F0F0',
};

// Partes que não mostram nome
const HIDDEN_ASSIGNEE_PARTS = [
    'Cântico Inicial', 'Cântico do Meio', 'Cântico Final', 'Cântico',
    'Comentários Iniciais', 'Comentários Finais'
];

// Partes de estudante (mostram Sala B)
const STUDENT_PARTS = [
    'Leitura da Bíblia', 'Leitura da Biblia', 'Leitura',
    'Iniciando Conversas', 'Cultivando o Interesse',
    'Fazendo Discípulos', 'Explicando Suas Crenças',
    'Discurso de Estudante'
];

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

function normalizeTipoParte(tipo: string): string {
    return tipo
        .replace(/\s*\(Ajudante\)\s*/gi, '')
        .replace(/\s*\(\d+\s*min\)\s*/gi, '')
        .trim();
}

function getSectionColor(section: string): string {
    if (section.includes('Tesouros')) return COLORS.TESOUROS_BG;
    if (section.includes('Ministério')) return COLORS.MINISTERIO_BG;
    if (section.includes('Vida Cristã')) return COLORS.VIDA_CRISTA_BG;
    return COLORS.TESOUROS_BG;
}

function getSectionName(section: string): string {
    if (section.includes('Tesouros')) return 'TESOUROS DA PALAVRA DE DEUS';
    if (section.includes('Ministério')) return 'FAÇA SEU MELHOR NO MINISTÉRIO';
    if (section.includes('Vida Cristã')) return 'NOSSA VIDA CRISTÃ';
    return section.toUpperCase();
}

// ============================================================================
// PREPARAÇÃO DE DADOS
// ============================================================================

interface S140RoomBPart {
    seq: number;
    section: string;
    time: string;
    title: string;
    duration: number;
    mainHallAssignee: string;
    mainHallAssistant?: string;
    roomBAssignee?: string;
    roomBAssistant?: string;
    isStudentPart: boolean;
    tipoParte: string;
    showRoomColumns: boolean;
}

interface S140RoomBWeekData {
    weekId: string;
    weekDisplay: string;
    bibleReading: string;
    president: string;
    counselorRoomB: string;
    parts: S140RoomBPart[];
}

export function prepareS140RoomBData(parts: WorkbookPart[]): S140RoomBWeekData {
    if (parts.length === 0) {
        throw new Error('Nenhuma parte fornecida para o S-140');
    }

    const sortedParts = [...parts].sort((a, b) => (a.seq || 0) - (b.seq || 0));

    const presidentPart = sortedParts.find(p =>
        p.tipoParte === 'Presidente' || p.tipoParte === 'Presidente da Reunião'
    );
    const counselorPart = sortedParts.find(p =>
        p.tipoParte?.includes('Conselheiro') || p.tipoParte?.includes('Dirigente Sala B')
    );

    const titularParts = sortedParts.filter(p => p.funcao === 'Titular');
    const ajudanteParts = sortedParts.filter(p => p.funcao === 'Ajudante');

    const ajudanteByTipo = new Map<string, string>();
    ajudanteParts.forEach(a => {
        const name = a.resolvedPublisherName || a.rawPublisherName || '';
        const normalizedTipo = normalizeTipoParte(a.tipoParte);
        if (name && normalizedTipo) {
            ajudanteByTipo.set(normalizedTipo, name);
        }
    });

    const preparedParts: S140RoomBPart[] = titularParts.map(p => {
        const time = p.horaInicio || '';
        const isStudentPart = STUDENT_PARTS.some(sp =>
            p.tipoParte.toLowerCase().includes(sp.toLowerCase())
        );

        // Só mostra colunas Sala B/Salão na seção Ministério
        const showRoomColumns = p.section?.includes('Ministério') && isStudentPart;

        let mainHallAssignee = '';
        if (!HIDDEN_ASSIGNEE_PARTS.some(h => p.tipoParte.includes(h))) {
            mainHallAssignee = p.resolvedPublisherName || p.rawPublisherName || '';
        }

        const normalizedTipo = normalizeTipoParte(p.tipoParte);
        const mainHallAssistant = ajudanteByTipo.get(normalizedTipo);

        let title = p.tituloParte || p.tipoParte;
        if (p.tipoParte.startsWith('Cântico')) {
            title = `Cântico ${title.replace(/[^0-9]/g, '')}`;
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
            roomBAssignee: '', // TODO: implementar quando tiver dados de Sala B
            roomBAssistant: '',
            isStudentPart,
            tipoParte: p.tipoParte,
            showRoomColumns,
        };
    });

    const leituraPart = sortedParts.find(p =>
        p.tipoParte === 'Leitura da Bíblia' || p.tipoParte === 'Leitura da Biblia'
    );

    return {
        weekId: sortedParts[0].weekId,
        weekDisplay: sortedParts[0].weekDisplay,
        bibleReading: leituraPart?.descricaoParte || '',
        president: presidentPart?.resolvedPublisherName || presidentPart?.rawPublisherName || '',
        counselorRoomB: counselorPart?.resolvedPublisherName || counselorPart?.rawPublisherName || '',
        parts: preparedParts,
    };
}

// ============================================================================
// GERAÇÃO DE HTML
// ============================================================================

export function generateS140RoomBHTML(weekData: S140RoomBWeekData): string {
    const year = new Date().getFullYear();

    // Agrupar partes por seção
    const partsBySection: Record<string, S140RoomBPart[]> = {};
    weekData.parts.forEach(p => {
        const sectionKey = p.section || 'Outros';
        if (!partsBySection[sectionKey]) {
            partsBySection[sectionKey] = [];
        }
        partsBySection[sectionKey].push(p);
    });

    // Ordem das seções
    const sectionOrder = [
        'Tesouros da Palavra de Deus',
        'Faça Seu Melhor no Ministério',
        'Nossa Vida Cristã',
    ];

    let partsHTML = '';
    const sectionsRendered = new Set<string>();

    sectionOrder.forEach(section => {
        // Encontrar seção que corresponde
        const matchingSection = Object.keys(partsBySection).find(s =>
            s.includes(section.split(' ')[0]) || section.includes(s.split(' ')[0])
        );
        if (!matchingSection || sectionsRendered.has(matchingSection)) return;
        sectionsRendered.add(matchingSection);

        const parts = partsBySection[matchingSection];
        const bgColor = getSectionColor(matchingSection);
        const sectionName = getSectionName(matchingSection);
        const isMinisterio = matchingSection.includes('Ministério');

        // Header da seção
        if (isMinisterio) {
            // Seção Ministério tem cabeçalhos Sala B e Salão Principal
            partsHTML += `
                <tr>
                    <td colspan="3" style="
                        background: ${bgColor}; 
                        color: ${COLORS.WHITE}; 
                        font-family: Calibri, sans-serif;
                        font-size: 10pt;
                        font-weight: bold;
                        padding: 6px 10px;
                        border: 1px solid #ccc;
                    ">
                        ${sectionName}
                    </td>
                    <td style="
                        background: ${COLORS.SALA_B_HEADER}; 
                        color: ${COLORS.LABEL_TEXT};
                        font-family: Calibri, sans-serif;
                        font-size: 9pt;
                        font-weight: bold;
                        text-align: center;
                        padding: 6px 8px;
                        border: 1px solid #ccc;
                    ">
                        Sala B
                    </td>
                    <td style="
                        background: ${COLORS.SALAO_PRINCIPAL_HEADER}; 
                        color: ${COLORS.LABEL_TEXT};
                        font-family: Calibri, sans-serif;
                        font-size: 9pt;
                        font-weight: bold;
                        text-align: center;
                        padding: 6px 8px;
                        border: 1px solid #ccc;
                    ">
                        Salão principal
                    </td>
                </tr>
            `;
        } else {
            // Outras seções sem colunas de sala
            partsHTML += `
                <tr>
                    <td colspan="5" style="
                        background: ${bgColor}; 
                        color: ${COLORS.WHITE}; 
                        font-family: Calibri, sans-serif;
                        font-size: 10pt;
                        font-weight: bold;
                        padding: 6px 10px;
                        border: 1px solid #ccc;
                    ">
                        ${sectionName}
                    </td>
                </tr>
            `;
        }

        // Linhas das partes
        parts.forEach(part => {
            const mainDisplay = part.mainHallAssistant
                ? `${part.mainHallAssignee} / ${part.mainHallAssistant}`
                : part.mainHallAssignee;

            const roomBDisplay = part.roomBAssistant
                ? `${part.roomBAssignee} / ${part.roomBAssistant}`
                : part.roomBAssignee || '';

            if (isMinisterio && part.isStudentPart) {
                // Parte com colunas Sala B e Salão Principal
                partsHTML += `
                    <tr style="border: 1px solid #ddd;">
                        <td style="padding: 5px 8px; font-family: Calibri, sans-serif; font-size: 9pt; color: #666; width: 45px; text-align: center; border: 1px solid #ddd;">
                            ${part.time}
                        </td>
                        <td colspan="2" style="padding: 5px 8px; font-family: Calibri, sans-serif; font-size: 10pt; color: #333; border: 1px solid #ddd;">
                            ${part.title}
                        </td>
                        <td style="padding: 5px 8px; font-family: Calibri, sans-serif; font-size: 10pt; color: #333; text-align: center; background: #fafeff; border: 1px solid #ddd; max-width: 130px; overflow: hidden; text-overflow: ellipsis;">
                            ${roomBDisplay}
                        </td>
                        <td style="padding: 5px 8px; font-family: Calibri, sans-serif; font-size: 10pt; color: #333; font-weight: 500; text-align: center; background: #fafafa; border: 1px solid #ddd; max-width: 130px; overflow: hidden; text-overflow: ellipsis;">
                            ${mainDisplay}
                        </td>
                    </tr>
                `;
            } else {
                // Parte normal sem colunas de sala
                partsHTML += `
                    <tr style="border: 1px solid #ddd;">
                        <td style="padding: 5px 8px; font-family: Calibri, sans-serif; font-size: 9pt; color: #666; width: 45px; text-align: center; border: 1px solid #ddd;">
                            ${part.duration > 0 ? part.time : ''}
                        </td>
                        <td colspan="3" style="padding: 5px 8px; font-family: Calibri, sans-serif; font-size: 10pt; color: #333; border: 1px solid #ddd;">
                            ${part.title}
                        </td>
                        <td style="padding: 5px 8px; font-family: Calibri, sans-serif; font-size: 10pt; color: #333; font-weight: 500; border: 1px solid #ddd; max-width: 150px; overflow: hidden; text-overflow: ellipsis;">
                            ${mainDisplay}
                        </td>
                    </tr>
                `;
            }
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
                    font-family: Calibri, 'Segoe UI', sans-serif; 
                    font-size: 10pt;
                    line-height: 1.3;
                    -webkit-font-smoothing: antialiased;
                }
                .container {
                    width: 100%;
                    max-width: 750px;
                    margin: 0 auto;
                    padding: 15px;
                }
                .header-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }
                .congregation {
                    font-family: Calibri, sans-serif;
                    font-size: 11pt;
                    font-weight: bold;
                    color: ${COLORS.HEADER_TEXT};
                }
                .year {
                    font-family: Calibri, sans-serif;
                    font-size: 11pt;
                    font-weight: bold;
                    color: ${COLORS.HEADER_TEXT};
                }
                .week-info {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 10px;
                    padding: 6px 10px;
                    background: #f5f5f5;
                    border-radius: 4px;
                }
                .week-date {
                    font-family: Calibri, sans-serif;
                    font-size: 10pt;
                    font-weight: bold;
                    color: #333;
                }
                .president-info, .counselor-info {
                    font-family: Calibri, sans-serif;
                    font-size: 8pt;
                    font-weight: bold;
                    color: ${COLORS.LABEL_TEXT};
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    table-layout: fixed;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header-row">
                    <span class="congregation">${CONGREGATION_NAME}</span>
                    <span class="year">${year}</span>
                </div>

                <div class="week-info">
                    <span class="week-date">${weekData.weekDisplay.toUpperCase()}</span>
                    <span class="president-info">Presidente: ${weekData.president}</span>
                    ${weekData.counselorRoomB ? `<span class="counselor-info">Conselheiro da sala B: ${weekData.counselorRoomB}</span>` : ''}
                </div>

                <table>
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
