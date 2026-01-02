/**
 * S-140 Generator com Sala B - Versão baseada EXATAMENTE no template oficial
 * Layout: S-140_T Sala B Template.docx
 * 
 * Especificações do template:
 * - Fonte: Calibri
 * - Cabeçalho: [CONGREGAÇÃO] | Programação da reunião do meio de semana — [ANO]
 * - Labels: 8pt BOLD #575A5D
 * - Seções: 10pt BOLD branco
 *   - Tesouros: #575A5D (cinza)
 *   - Ministério: #BE8900 (dourado)  
 *   - Vida Cristã: #7E0024 (vermelho escuro)
 * - Cânticos: com bolinha colorida da seção
 * - Colunas Sala B / Salão Principal apenas no Ministério
 * - Excluir: "Elogios e Conselhos"
 */

import html2pdf from 'html2pdf.js';
import type { WorkbookPart } from '../types';

// ============================================================================
// CONSTANTES DO TEMPLATE
// ============================================================================

const CONGREGATION_NAME = 'PARQUE JACARAÍPE';

// Cores exatas do template (extraídas do DOCX)
const COLORS = {
    // Seções - cores de fundo
    TESOUROS_BG: '#575A5D',
    MINISTERIO_BG: '#BE8900',
    VIDA_CRISTA_BG: '#7E0024',
    // Texto
    HEADER_TEXT: '#000000',
    LABEL_TEXT: '#575A5D',
    WHITE: '#FFFFFF',
    // Linha separadora
    SEPARATOR: '#575A5D',
};

// Partes a EXCLUIR do S-140
const EXCLUDED_PARTS = [
    'Elogios e Conselhos',
    'Elogios',
    'Conselhos',
];

// Partes que não mostram nome de designado
const HIDDEN_ASSIGNEE_PARTS = [
    'Comentários Iniciais', 'Comentários Finais',
    'Comentários iniciais', 'Comentários finais',
];

// Partes de estudante (mostram Sala B no Ministério)
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
    if (section?.includes('Tesouros')) return COLORS.TESOUROS_BG;
    if (section?.includes('Ministério')) return COLORS.MINISTERIO_BG;
    if (section?.includes('Vida Cristã')) return COLORS.VIDA_CRISTA_BG;
    return COLORS.TESOUROS_BG;
}

function getSectionName(section: string): string {
    if (section?.includes('Tesouros')) return 'TESOUROS DA PALAVRA DE DEUS';
    if (section?.includes('Ministério')) return 'FAÇA SEU MELHOR NO MINISTÉRIO';
    if (section?.includes('Vida Cristã')) return 'NOSSA VIDA CRISTÃ';
    return section?.toUpperCase() || '';
}

function isCantico(tipoParte: string): boolean {
    return tipoParte?.toLowerCase().includes('cântico') ||
        tipoParte?.toLowerCase().includes('cantico');
}

function isOracao(tipoParte: string): boolean {
    return tipoParte?.toLowerCase().includes('oração') ||
        tipoParte?.toLowerCase().includes('oracao');
}

// ============================================================================
// TIPOS
// ============================================================================

interface S140Part {
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
    isInMinisterio: boolean;
    isCantico: boolean;
    isOracao: boolean;
}

interface S140WeekData {
    weekId: string;
    weekDisplay: string;
    bibleReading: string;
    president: string;
    counselorRoomB: string;
    parts: S140Part[];
    openingPrayer: string;
    closingPrayer: string;
}

// ============================================================================
// PREPARAÇÃO DE DADOS
// ============================================================================

export function prepareS140RoomBData(parts: WorkbookPart[]): S140WeekData {
    if (parts.length === 0) {
        throw new Error('Nenhuma parte fornecida para o S-140');
    }

    const sortedParts = [...parts].sort((a, b) => (a.seq || 0) - (b.seq || 0));

    // Encontrar partes especiais
    const presidentPart = sortedParts.find(p =>
        p.tipoParte === 'Presidente' || p.tipoParte === 'Presidente da Reunião'
    );
    const counselorPart = sortedParts.find(p =>
        p.tipoParte?.includes('Conselheiro') || p.tipoParte?.includes('Dirigente Sala B')
    );
    const openingPrayerPart = sortedParts.find(p =>
        p.tipoParte === 'Oração Inicial' || p.tipoParte === 'Oracao Inicial'
    );
    const closingPrayerPart = sortedParts.find(p =>
        p.tipoParte === 'Oração Final' || p.tipoParte === 'Oracao Final'
    );

    // Separar titulares de ajudantes
    const titularParts = sortedParts.filter(p => p.funcao === 'Titular');
    const ajudanteParts = sortedParts.filter(p => p.funcao === 'Ajudante');

    // Mapa de ajudantes
    const ajudanteByTipo = new Map<string, string>();
    ajudanteParts.forEach(a => {
        const name = a.resolvedPublisherName || a.rawPublisherName || '';
        const normalizedTipo = normalizeTipoParte(a.tipoParte);
        if (name && normalizedTipo) {
            ajudanteByTipo.set(normalizedTipo, name);
        }
    });

    // Preparar partes (excluindo as que devem ser excluídas)
    const preparedParts: S140Part[] = titularParts
        .filter(p => !EXCLUDED_PARTS.some(ex => p.tipoParte?.includes(ex)))
        .map(p => {
            const time = p.horaInicio || '';
            const isStudentPart = STUDENT_PARTS.some(sp =>
                p.tipoParte?.toLowerCase().includes(sp.toLowerCase())
            );
            const isInMinisterio = p.section?.includes('Ministério') || false;

            let mainHallAssignee = '';
            if (!HIDDEN_ASSIGNEE_PARTS.some(h => p.tipoParte?.includes(h))) {
                mainHallAssignee = p.resolvedPublisherName || p.rawPublisherName || '';
            }

            const normalizedTipo = normalizeTipoParte(p.tipoParte);
            const mainHallAssistant = ajudanteByTipo.get(normalizedTipo);

            let title = p.tituloParte || p.tipoParte;
            const duration = typeof p.duracao === 'string' ? parseInt(p.duracao, 10) || 0 : (p.duracao || 0);

            return {
                seq: p.seq || 0,
                section: p.section || '',
                time,
                title,
                duration,
                mainHallAssignee,
                mainHallAssistant,
                roomBAssignee: '',
                roomBAssistant: '',
                isStudentPart,
                tipoParte: p.tipoParte,
                isInMinisterio,
                isCantico: isCantico(p.tipoParte),
                isOracao: isOracao(p.tipoParte),
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
        openingPrayer: openingPrayerPart?.resolvedPublisherName || openingPrayerPart?.rawPublisherName || '',
        closingPrayer: closingPrayerPart?.resolvedPublisherName || closingPrayerPart?.rawPublisherName || '',
    };
}

// ============================================================================
// GERAÇÃO DE HTML
// ============================================================================

export function generateS140RoomBHTML(weekData: S140WeekData): string {
    const year = new Date().getFullYear();

    // Agrupar partes por seção preservando ordem
    const sectionOrder = ['Tesouros', 'Ministério', 'Vida Cristã'];
    const partsBySection: Map<string, S140Part[]> = new Map();

    // Partes iniciais (antes de Tesouros)
    const initialParts: S140Part[] = [];
    // Partes finais (depois de Vida Cristã)  
    const finalParts: S140Part[] = [];

    weekData.parts.forEach(p => {
        const section = p.section || '';
        const matchedSection = sectionOrder.find(s => section.includes(s));

        if (matchedSection) {
            if (!partsBySection.has(matchedSection)) {
                partsBySection.set(matchedSection, []);
            }
            partsBySection.get(matchedSection)!.push(p);
        } else if (p.seq <= 3 || p.isCantico && p.seq <= 5) {
            // Partes iniciais: cântico inicial, oração
            initialParts.push(p);
        } else {
            // Partes finais: comentários finais, cântico final, oração
            finalParts.push(p);
        }
    });

    // Gerar HTML

    // === PARTES INICIAIS ===
    let initialHTML = '';
    initialParts.forEach(part => {
        const bulletColor = COLORS.TESOUROS_BG;
        const bullet = part.isCantico ? `<span style="color: ${bulletColor}; font-size: 14px;">●</span> ` : '';

        initialHTML += `
            <tr>
                <td style="padding: 4px 8px; font-family: Calibri, sans-serif; font-size: 9pt; color: #666; width: 45px; text-align: center;">
                    ${part.time}
                </td>
                <td colspan="3" style="padding: 4px 8px; font-family: Calibri, sans-serif; font-size: 10pt; color: #333;">
                    ${bullet}${part.title}
                </td>
                <td style="padding: 4px 8px; font-family: Calibri, sans-serif; font-size: 10pt; font-weight: 500;">
                    ${part.mainHallAssignee}
                </td>
            </tr>
        `;
    });

    // === SEÇÕES PRINCIPAIS ===
    let sectionsHTML = '';
    sectionOrder.forEach(sectionKey => {
        const parts = partsBySection.get(sectionKey);
        if (!parts || parts.length === 0) return;

        const bgColor = getSectionColor(sectionKey);
        const sectionName = getSectionName(sectionKey);
        const isMinisterio = sectionKey === 'Ministério';

        // Header da seção
        if (isMinisterio) {
            sectionsHTML += `
                <tr>
                    <td colspan="3" style="
                        background: ${bgColor}; 
                        color: ${COLORS.WHITE}; 
                        font-family: Calibri, sans-serif;
                        font-size: 10pt;
                        font-weight: bold;
                        padding: 6px 10px;
                    ">
                        ${sectionName}
                    </td>
                    <td style="
                        background: #E3F2FD; 
                        color: ${COLORS.LABEL_TEXT};
                        font-family: Calibri, sans-serif;
                        font-size: 9pt;
                        font-weight: bold;
                        text-align: center;
                        padding: 4px;
                    ">
                        Sala B
                    </td>
                    <td style="
                        background: #F5F5F5; 
                        color: ${COLORS.LABEL_TEXT};
                        font-family: Calibri, sans-serif;
                        font-size: 9pt;
                        font-weight: bold;
                        text-align: center;
                        padding: 4px;
                    ">
                        Salão principal
                    </td>
                </tr>
            `;
        } else {
            sectionsHTML += `
                <tr>
                    <td colspan="5" style="
                        background: ${bgColor}; 
                        color: ${COLORS.WHITE}; 
                        font-family: Calibri, sans-serif;
                        font-size: 10pt;
                        font-weight: bold;
                        padding: 6px 10px;
                    ">
                        ${sectionName}
                    </td>
                </tr>
            `;
        }

        // Linhas das partes
        parts.forEach(part => {
            const bullet = part.isCantico ? `<span style="color: ${bgColor}; font-size: 14px;">●</span> ` : '';
            const textColor = bgColor; // Títulos com cor da seção

            const mainDisplay = part.mainHallAssistant
                ? `${part.mainHallAssignee} / ${part.mainHallAssistant}`
                : part.mainHallAssignee;

            const roomBDisplay = part.roomBAssistant
                ? `${part.roomBAssignee} / ${part.roomBAssistant}`
                : part.roomBAssignee || '';

            if (isMinisterio && part.isStudentPart) {
                sectionsHTML += `
                    <tr>
                        <td style="padding: 4px 8px; font-family: Calibri, sans-serif; font-size: 9pt; color: #666; width: 45px; text-align: center;">
                            ${part.time}
                        </td>
                        <td colspan="2" style="padding: 4px 8px; font-family: Calibri, sans-serif; font-size: 10pt; color: ${textColor};">
                            ${bullet}${part.title}
                        </td>
                        <td style="padding: 4px 8px; font-family: Calibri, sans-serif; font-size: 10pt; text-align: center; background: #FAFEFF;">
                            ${roomBDisplay}
                        </td>
                        <td style="padding: 4px 8px; font-family: Calibri, sans-serif; font-size: 10pt; font-weight: 500; text-align: center; background: #FAFAFA;">
                            ${mainDisplay}
                        </td>
                    </tr>
                `;
            } else {
                sectionsHTML += `
                    <tr>
                        <td style="padding: 4px 8px; font-family: Calibri, sans-serif; font-size: 9pt; color: #666; width: 45px; text-align: center;">
                            ${part.duration > 0 ? part.time : ''}
                        </td>
                        <td colspan="3" style="padding: 4px 8px; font-family: Calibri, sans-serif; font-size: 10pt; color: ${textColor};">
                            ${bullet}${part.title}
                        </td>
                        <td style="padding: 4px 8px; font-family: Calibri, sans-serif; font-size: 10pt; font-weight: 500;">
                            ${mainDisplay}
                        </td>
                    </tr>
                `;
            }
        });
    });

    // === PARTES FINAIS ===
    let finalHTML = '';
    finalParts.forEach(part => {
        const bulletColor = COLORS.VIDA_CRISTA_BG;
        const bullet = part.isCantico ? `<span style="color: ${bulletColor}; font-size: 14px;">●</span> ` : '';

        finalHTML += `
            <tr>
                <td style="padding: 4px 8px; font-family: Calibri, sans-serif; font-size: 9pt; color: #666; width: 45px; text-align: center;">
                    ${part.time}
                </td>
                <td colspan="3" style="padding: 4px 8px; font-family: Calibri, sans-serif; font-size: 10pt; color: #333;">
                    ${bullet}${part.title}
                </td>
                <td style="padding: 4px 8px; font-family: Calibri, sans-serif; font-size: 10pt; font-weight: 500;">
                    ${part.mainHallAssignee}
                </td>
            </tr>
        `;
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
                }
                .container {
                    width: 100%;
                    max-width: 720px;
                    margin: 0 auto;
                    padding: 12px;
                }
                .header-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 2px solid ${COLORS.SEPARATOR};
                    padding-bottom: 6px;
                    margin-bottom: 8px;
                }
                .congregation {
                    font-family: Calibri, sans-serif;
                    font-size: 11pt;
                    font-weight: bold;
                    color: ${COLORS.HEADER_TEXT};
                }
                .title-year {
                    font-family: Calibri, sans-serif;
                    font-size: 10pt;
                    color: ${COLORS.HEADER_TEXT};
                }
                .title-year strong {
                    font-weight: bold;
                }
                .week-info {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 6px;
                    padding: 4px 0;
                }
                .week-date {
                    font-family: Calibri, sans-serif;
                    font-size: 10pt;
                    font-weight: bold;
                    color: #333;
                }
                .president-info {
                    font-family: Calibri, sans-serif;
                    font-size: 8pt;
                    font-weight: bold;
                    color: ${COLORS.LABEL_TEXT};
                }
                .counselor-info {
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
                tr {
                    border-bottom: 1px solid #E0E0E0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header-row">
                    <span class="congregation">${CONGREGATION_NAME}</span>
                    <span class="title-year">Programação da reunião do meio de semana — <strong>${year}</strong></span>
                </div>

                <div class="week-info">
                    <span class="week-date">${weekData.weekDisplay.toUpperCase()}</span>
                    <span class="president-info">Presidente: ${weekData.president}</span>
                    ${weekData.counselorRoomB ? `<span class="counselor-info">Conselheiro da sala B: ${weekData.counselorRoomB}</span>` : ''}
                </div>

                <table>
                    <tbody>
                        ${initialHTML}
                        ${sectionsHTML}
                        ${finalHTML}
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

export async function generateS140RoomBPDF(weekData: S140WeekData): Promise<void> {
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

export async function downloadS140RoomB(parts: WorkbookPart[]): Promise<void> {
    const weekData = prepareS140RoomBData(parts);
    await generateS140RoomBPDF(weekData);
}
