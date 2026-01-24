/**
 * S-140 Generator Sala B A4 - Versão IMPRESSÃO em A4 Retrato
 * CÓPIA EXATA do s140GeneratorRoomB.ts com ajustes:
 * - Formato: A4 Retrato (210x297mm)
 * - Margem: Mínima (3mm)
 * - Fontes: Maiores (escala ~1.3x)
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
// PREPARAÇÃO DE DADOS (IDÊNTICO AO s140GeneratorRoomB.ts)
// ============================================================================

export function prepareS140RoomBA4Data(parts: WorkbookPart[]): S140WeekData {
    console.log('[S140-A4] Initializing Room B A4 Data Preparation');
    if (parts.length === 0) {
        throw new Error('Nenhuma parte fornecida para o S-140');
    }

    const sortedParts = [...parts].sort((a, b) => (a.seq || 0) - (b.seq || 0));

    // Encontrar partes especiais
    const presidentPart = sortedParts.find(p =>
        p.tipoParte === 'Presidente' || p.tipoParte === 'Presidente da Reunião'
    );
    const presidentName = presidentPart?.resolvedPublisherName || presidentPart?.rawPublisherName || '';

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

    // NORMALIZAÇÃO: Extrair apenas o número de sequência do título
    const extractSeqNumber = (titulo: string): string => {
        const match = titulo.match(/^(\d+)\./);
        return match ? match[1] : titulo;
    };

    // Mapa de ajudantes por número de sequência
    const ajudanteBySeq = new Map<string, string>();
    ajudanteParts.forEach(a => {
        const name = a.resolvedPublisherName || a.rawPublisherName || '';
        const titulo = a.tituloParte || a.tipoParte;
        const seqNum = extractSeqNumber(titulo);
        if (name && seqNum) {
            ajudanteBySeq.set(seqNum, name);
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

                // Ocultar nome do Presidente em partes implícitas
                const isImpliedRole = isCantico(p.tipoParte) || isOracao(p.tipoParte) || p.tipoParte?.toLowerCase().includes('comentários');
                if (mainHallAssignee === presidentName && isImpliedRole && !p.tipoParte?.includes('Presidente')) {
                    mainHallAssignee = '';
                }
            }

            // Buscar ajudante pelo número de sequência extraído do título
            const titulo = p.tituloParte || p.tipoParte;
            const seqNum = extractSeqNumber(titulo);
            const mainHallAssistant = ajudanteBySeq.get(seqNum);

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
// GERAÇÃO DE HTML (IDÊNTICO AO s140GeneratorRoomB.ts, MAS COM FONTES MAIORES)
// ============================================================================

export function generateS140RoomBA4HTML(weekData: S140WeekData): string {
    // Extrair ano da semana (weekId format: YYYY-MM-DD) ou usar atual como fallback
    const year = weekData.weekId.split('-')[0] || new Date().getFullYear();

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
        const bullet = part.isCantico ? `<span style="color: ${bulletColor}; font-size: 18px;">●</span> ` : '';

        // 5 colunas para alinhar com cabeçalhos das seções
        initialHTML += `
            <tr>
                <td style="padding: 6px 10px; font-family: Calibri, sans-serif; font-size: 12pt; color: #666; width: 55px; text-align: center;">
                    ${part.time}
                </td>
                <td colspan="2" style="padding: 6px 10px; font-family: Calibri, sans-serif; font-size: 13pt; color: #333;">
                    ${bullet}${part.title}
                </td>
                <td style="padding: 6px 10px;"></td>
                <td style="padding: 6px 10px; font-family: Calibri, sans-serif; font-size: 13pt; font-weight: 500; color: #333333; text-align: right;">
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
        const isVidaCrista = sectionKey === 'Vida Cristã';

        // Header da seção - Sala B e Salão principal SÓ em Tesouros e Ministério (não em Vida Cristã)
        if (isVidaCrista) {
            // Vida Cristã: apenas barra de título, sem colunas Sala B / Salão
            sectionsHTML += `
                <tr>
                    <td colspan="5" style="
                        background: ${bgColor}; 
                        color: ${COLORS.WHITE}; 
                        font-family: Calibri, sans-serif;
                        font-size: 13pt;
                        font-weight: bold;
                        padding: 8px 12px;
                    ">
                        ${sectionName}
                    </td>
                </tr>
            `;
        } else {
            // Tesouros e Ministério: barra de título + colunas Sala B e Salão principal
            sectionsHTML += `
                <tr>
                    <td colspan="3" style="
                        background: ${bgColor}; 
                        color: ${COLORS.WHITE}; 
                        font-family: Calibri, sans-serif;
                        font-size: 13pt;
                        font-weight: bold;
                        padding: 8px 12px;
                    ">
                        ${sectionName}
                    </td>
                    <td style="
                        background: #E3F2FD; 
                        color: ${COLORS.LABEL_TEXT};
                        font-family: Calibri, sans-serif;
                        font-size: 11pt;
                        font-weight: bold;
                        text-align: center;
                        padding: 6px;
                    ">
                        Sala B
                    </td>
                    <td style="
                        background: #F5F5F5; 
                        color: ${COLORS.LABEL_TEXT};
                        font-family: Calibri, sans-serif;
                        font-size: 11pt;
                        font-weight: bold;
                        text-align: center;
                        padding: 6px;
                    ">
                        Salão principal
                    </td>
                </tr>
            `;
        }

        // Linhas das partes
        parts.forEach(part => {
            // Cânticos SEMPRE têm texto preto (não colorido)
            const textColor = part.isCantico ? '#333333' : bgColor;
            const bullet = part.isCantico ? `<span style="color: ${bgColor}; font-size: 18px;">●</span> ` : '';

            const mainDisplay = part.mainHallAssistant
                ? `${part.mainHallAssignee} / ${part.mainHallAssistant}`
                : part.mainHallAssignee;

            const roomBDisplay = part.roomBAssistant
                ? `${part.roomBAssignee} / ${part.roomBAssistant}`
                : part.roomBAssignee || '';

            if (isVidaCrista) {
                // Vida Cristã: sem colunas de sala separadas
                sectionsHTML += `
                    <tr>
                        <td style="padding: 6px 10px; font-family: Calibri, sans-serif; font-size: 12pt; color: #666; width: 55px; text-align: center;">
                            ${part.duration > 0 ? part.time : ''}
                        </td>
                        <td colspan="3" style="padding: 6px 10px; font-family: Calibri, sans-serif; font-size: 13pt; color: ${textColor};">
                            ${bullet}${part.title}
                        </td>
                        <td style="padding: 6px 10px; font-family: Calibri, sans-serif; font-size: 13pt; font-weight: 500; color: #333333; text-align: right;">
                            ${mainDisplay}
                        </td>
                    </tr>
                `;
            } else {
                // Tesouros e Ministério: 5 colunas (Hora, Título, Sala B, Salão Principal)
                sectionsHTML += `
                    <tr>
                        <td style="padding: 6px 10px; font-family: Calibri, sans-serif; font-size: 12pt; color: #666; width: 55px; text-align: center;">
                            ${part.duration > 0 ? part.time : ''}
                        </td>
                        <td colspan="2" style="padding: 6px 10px; font-family: Calibri, sans-serif; font-size: 13pt; color: ${textColor};">
                            ${bullet}${part.title}
                        </td>
                        <td style="padding: 6px 10px; font-family: Calibri, sans-serif; font-size: 13pt; color: #333333; text-align: center; background: ${part.isStudentPart ? '#FAFEFF' : 'transparent'};">
                            ${part.isStudentPart ? roomBDisplay : ''}
                        </td>
                        <td style="padding: 6px 10px; font-family: Calibri, sans-serif; font-size: 13pt; font-weight: 500; color: #333333; text-align: right; background: ${part.isStudentPart ? '#FAFAFA' : 'transparent'};">
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
        const bullet = part.isCantico ? `<span style="color: ${bulletColor}; font-size: 18px;">●</span> ` : '';

        // 5 colunas para alinhar com cabeçalhos das seções
        finalHTML += `
            <tr>
                <td style="padding: 6px 10px; font-family: Calibri, sans-serif; font-size: 12pt; color: #666; width: 55px; text-align: center;">
                    ${part.time}
                </td>
                <td colspan="2" style="padding: 6px 10px; font-family: Calibri, sans-serif; font-size: 13pt; color: #333;">
                    ${bullet}${part.title}
                </td>
                <td style="padding: 6px 10px;"></td>
                <td style="padding: 6px 10px; font-family: Calibri, sans-serif; font-size: 13pt; font-weight: 500; color: #333333; text-align: right;">
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
                    font-size: 13pt;
                    line-height: 1.4;
                }
                .container {
                    width: 100%;
                    max-width: 200mm;
                    margin: 0 auto;
                    padding: 3mm;
                }
                .header-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 2px solid ${COLORS.SEPARATOR};
                    padding-bottom: 8px;
                    margin-bottom: 10px;
                }
                .congregation {
                    font-family: Calibri, sans-serif;
                    font-size: 14pt;
                    font-weight: bold;
                    color: ${COLORS.HEADER_TEXT};
                }
                .title-year {
                    font-family: Calibri, sans-serif;
                    font-size: 13pt;
                    color: ${COLORS.HEADER_TEXT};
                }
                .title-year strong {
                    font-weight: bold;
                }
                .week-info {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                    padding: 6px 0;
                }
                .week-date {
                    font-family: Calibri, sans-serif;
                    font-size: 13pt;
                    font-weight: bold;
                    color: #333;
                }
                .president-info {
                    font-family: Calibri, sans-serif;
                    font-size: 10pt;
                    font-weight: bold;
                    color: ${COLORS.LABEL_TEXT};
                }
                .counselor-info {
                    font-family: Calibri, sans-serif;
                    font-size: 10pt;
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
// GERAÇÃO DE PDF - A4 RETRATO COM MARGEM MÍNIMA
// ============================================================================

export async function generateS140RoomBA4PDF(weekData: S140WeekData): Promise<void> {
    const html = generateS140RoomBA4HTML(weekData);

    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    document.body.appendChild(container);

    try {
        const opt = {
            margin: 3, // Margem mínima: 3mm
            filename: `S-140-SalaB-A4_${weekData.weekId}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
        };

        const content = container.querySelector('.container');
        if (content) {
            await html2pdf().set(opt).from(content).save();
        }
    } finally {
        document.body.removeChild(container);
    }
}

export async function downloadS140RoomBA4(parts: WorkbookPart[]): Promise<void> {
    const weekData = prepareS140RoomBA4Data(parts);
    await generateS140RoomBA4PDF(weekData);
}
