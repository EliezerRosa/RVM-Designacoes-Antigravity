/**
 * S-140 Generator Unificado - RVM Designações
 * 
 * Combina o melhor de todas as versões:
 * - Layout/Aparência: s140GeneratorRoomBA4 (A4 Retrato, fontes maiores)
 * - Eventos Especiais: s140GeneratorRoomBEvents (filtra canceladas, mostra eventos)
 * - Multi-semanas: s140Generator (gerar PDF com múltiplas semanas)
 * 
 * VERSÃO TEMPORÁRIA - Mantém versões anteriores intactas
 */

import html2pdf from 'html2pdf.js';
import type { WorkbookPart, SpecialEvent, Publisher } from '../types';
import { specialEventService, EVENT_TEMPLATES } from './specialEventService';

// Helper para resolver nome do publicador (ID -> Nome Atualizado -> Nome Cache -> Nome Bruto)
function resolveName(part: WorkbookPart | undefined, publishers?: Publisher[]): string {
    if (!part) return '';
    if (part.resolvedPublisherId && publishers) {
        const pub = publishers.find(p => p.id === part.resolvedPublisherId);
        if (pub) return pub.name;
    }
    return part.resolvedPublisherName || part.rawPublisherName || '';
}

// ============================================================================
// CONSTANTES DO TEMPLATE (copiadas do BA4)
// ============================================================================

const CONGREGATION_NAME = 'PARQUE JACARAÍPE';

const COLORS = {
    TESOUROS_BG: '#575A5D',
    MINISTERIO_BG: '#BE8900',
    VIDA_CRISTA_BG: '#7E0024',
    HEADER_TEXT: '#000000',
    LABEL_TEXT: '#575A5D',
    WHITE: '#FFFFFF',
    SEPARATOR: '#575A5D',
    EVENT_BG: '#E8F5E9',      // Verde claro para eventos
    CANCELLED_BG: '#FFEBEE',  // Vermelho claro para canceladas
};

const EXCLUDED_PARTS = ['Elogios e Conselhos', 'Elogios', 'Conselhos'];

// Partes que NÃO devem ter nome do designado impresso no S-140:
// - Cânticos: não têm designado (toda a congregação canta)
// - Oração Inicial: automática do Presidente
// - Comentários Iniciais/Finais: automáticos do Presidente
const HIDDEN_ASSIGNEE_PARTS = [
    'Comentários Iniciais', 'Comentários Finais',
    'Comentários iniciais', 'Comentários finais',
    'Oração Inicial', 'Oracao Inicial',
    'Cântico', 'Cantico'  // Qualquer cântico (inicial, do meio, final)
];
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
    return tipoParte?.toLowerCase().includes('cântico') || tipoParte?.toLowerCase().includes('cantico');
}

function isOracao(tipoParte: string): boolean {
    return tipoParte?.toLowerCase().includes('oração') || tipoParte?.toLowerCase().includes('oracao');
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
    // Campos de eventos
    isCancelled?: boolean;
    cancelReason?: string;
}

interface S140WeekDataUnified {
    weekId: string;
    year: number;
    weekDisplay: string;
    bibleReading: string;
    president: string;
    counselorRoomB: string;
    parts: S140Part[];
    openingPrayer: string;
    closingPrayer: string;
    // Eventos especiais
    events: SpecialEvent[];
    hasEvents: boolean;
    isWeekCancelled: boolean;
    cancelReason?: string;
}

// ============================================================================
// PREPARAÇÃO DE DADOS (com suporte a eventos)
// ============================================================================

export async function prepareS140UnifiedData(parts: WorkbookPart[], publishers?: Publisher[]): Promise<S140WeekDataUnified> {
    if (parts.length === 0) {
        throw new Error('Nenhuma parte fornecida para o S-140');
    }

    const sortedParts = [...parts].sort((a, b) => (a.seq || 0) - (b.seq || 0));
    const firstPart = sortedParts[0];
    const weekId = firstPart.weekId;

    // Extrair ano de forma robusta
    let year = firstPart.year;
    if (!year) {
        const yearMatch = weekId.match(/^(\d{4})/);
        year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
    }

    // Buscar eventos especiais da semana
    let events: SpecialEvent[] = [];
    try {
        events = await specialEventService.getEventsByWeek(weekId);
    } catch (err) {
        console.warn('[S140-Unified] Erro ao buscar eventos:', err);
    }

    // Verificar se a semana foi cancelada
    const cancelWeekEvent = events.find(e => {
        const template = EVENT_TEMPLATES.find(t => t.id === e.templateId);
        return template?.impact.action === 'CANCEL_WEEK';
    });

    const isWeekCancelled = !!cancelWeekEvent;
    const cancelReason = cancelWeekEvent?.theme || cancelWeekEvent?.observations;

    // Filtrar partes canceladas
    const activeParts = sortedParts.filter(p => p.status !== 'CANCELADA');

    // Encontrar partes especiais
    const presidentPart = activeParts.find(p =>
        p.tipoParte === 'Presidente' || p.tipoParte === 'Presidente da Reunião'
    );
    const presidentName = resolveName(presidentPart, publishers);

    const counselorPart = activeParts.find(p =>
        p.tipoParte?.includes('Conselheiro') || p.tipoParte?.includes('Dirigente Sala B')
    );
    const openingPrayerPart = activeParts.find(p =>
        p.tipoParte === 'Oração Inicial' || p.tipoParte === 'Oracao Inicial'
    );
    const closingPrayerPart = activeParts.find(p =>
        p.tipoParte === 'Oração Final' || p.tipoParte === 'Oracao Final'
    );

    // Separar titulares de ajudantes
    const titularParts = activeParts.filter(p => p.funcao === 'Titular');
    const ajudanteParts = activeParts.filter(p => p.funcao === 'Ajudante');

    const extractSeqNumber = (titulo: string): string => {
        const match = titulo.match(/^(\d+)\./);
        return match ? match[1] : titulo;
    };

    // Mapa de ajudantes por número de sequência
    const ajudanteBySeq = new Map<string, string>();
    ajudanteParts.forEach(a => {
        const name = resolveName(a, publishers);
        const titulo = a.tituloParte || a.tipoParte;
        const seqNum = extractSeqNumber(titulo);
        if (name && seqNum) {
            ajudanteBySeq.set(seqNum, name);
        }
    });

    // Preparar partes
    const preparedParts: S140Part[] = titularParts
        .filter(p => !EXCLUDED_PARTS.some(ex => p.tipoParte?.includes(ex)))
        .map(p => {
            const time = p.horaInicio || '';
            const isStudentPart = STUDENT_PARTS.some(sp =>
                p.tipoParte?.toLowerCase().includes(sp.toLowerCase())
            );
            const isInMinisterio = p.section?.includes('Ministério') || false;

            let mainHallAssignee = '';
            // Verificar se deve mostrar nome - usa HIDDEN_ASSIGNEE_PARTS
            const shouldHideName = HIDDEN_ASSIGNEE_PARTS.some(h => p.tipoParte?.includes(h));
            if (!shouldHideName) {
                mainHallAssignee = resolveName(p, publishers);
            }

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
                isCancelled: p.status === 'CANCELADA',
                cancelReason: p.cancelReason,
            };
        });

    const leituraPart = activeParts.find(p =>
        p.tipoParte === 'Leitura da Bíblia' || p.tipoParte === 'Leitura da Biblia'
    );

    return {
        weekId,
        year,
        weekDisplay: sortedParts[0].weekDisplay,
        bibleReading: leituraPart?.descricaoParte || '',
        president: presidentName,
        counselorRoomB: counselorPart?.resolvedPublisherName || '',
        parts: preparedParts,
        openingPrayer: openingPrayerPart?.resolvedPublisherName || '',
        closingPrayer: closingPrayerPart?.resolvedPublisherName || '',
        events,
        hasEvents: events.length > 0,
        isWeekCancelled,
        cancelReason,
    };
}

// ============================================================================
// GERAÇÃO DE HTML (baseado no BA4 com ajustes para eventos)
// ============================================================================

// ============================================================================
// GERAÇÃO DE HTML (baseado no BA4 com ajustes para eventos)
// ============================================================================

/**
 * Gera apenas o CONTEÚDO interno do S-140 (tabelas, header, eventos)
 * Sem as tags <html>, <head>, <body> envolvendo
 */
export function generateS140BodyContent(weekData: S140WeekDataUnified): string {
    const year = weekData.year;

    // Se semana cancelada, mostrar aviso simplificado
    if (weekData.isWeekCancelled) {
        return `
            <div style="text-align: center; padding: 40px; background: ${COLORS.CANCELLED_BG}; border-radius: 8px;">
                <h1 style="color: ${COLORS.VIDA_CRISTA_BG};">SEMANA CANCELADA</h1>
                <p style="font-size: 16pt;">${weekData.weekDisplay}</p>
                <p style="font-size: 14pt; color: #666;">${weekData.cancelReason || 'Sem motivo especificado'}</p>
            </div>
        `;
    }

    // Agrupar partes por seção
    const sectionOrder = ['Tesouros', 'Ministério', 'Vida Cristã'];
    const partsBySection: Map<string, S140Part[]> = new Map();
    const initialParts: S140Part[] = [];
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
            initialParts.push(p);
        } else {
            finalParts.push(p);
        }
    });

    // Banner de eventos especiais
    let eventBanner = '';
    if (weekData.hasEvents && weekData.events.length > 0) {
        const eventNames = weekData.events.map(e => {
            const template = EVENT_TEMPLATES.find(t => t.id === e.templateId);
            return template?.name || e.theme || 'Evento Especial';
        }).join(', ');

        eventBanner = `
            <div style="background: ${COLORS.EVENT_BG}; padding: 8px 12px; border-radius: 4px; margin-bottom: 10px; font-size: 11pt; color: #2E7D32;">
                📌 <strong>Evento Especial:</strong> ${eventNames}
            </div>
        `;
    }

    // === PARTES INICIAIS ===
    let initialHTML = '';
    initialParts.forEach(part => {
        const bulletColor = COLORS.TESOUROS_BG;
        const bullet = part.isCantico ? `<span style="color: ${bulletColor}; font-size: 18px;">●</span> ` : '';

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

        if (isVidaCrista) {
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

        parts.forEach(part => {
            const textColor = part.isCantico ? '#333333' : bgColor;
            const bullet = part.isCantico ? `<span style="color: ${bgColor}; font-size: 18px;">●</span> ` : '';

            const mainDisplay = part.mainHallAssistant
                ? `${part.mainHallAssignee} / ${part.mainHallAssistant}`
                : part.mainHallAssignee;

            const roomBDisplay = part.roomBAssistant
                ? `${part.roomBAssignee} / ${part.roomBAssistant}`
                : part.roomBAssignee || '';

            if (isVidaCrista) {
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
        <div class="header-row">
            <span class="congregation">${CONGREGATION_NAME}</span>
            <span class="title-year">Programação da reunião do meio de semana — <strong>${year}</strong></span>
        </div>

        ${eventBanner}

        <div class="week-info">
            <span class="week-date">${weekData.weekDisplay.toUpperCase()}</span>
            <span class="president-info">Presidente: ${weekData.president}</span>
            ${weekData.counselorRoomB ? `<span class="counselor-info">Conselheiro da sala B: ${weekData.counselorRoomB}</span>` : ''}
        </div>

        <table>
            <colgroup>
                <col style="width: 15%;"> <!-- Hora -->
                <col style="width: 38%;"> <!-- Parte/Tema -->
                <col style="width: 2%;">  <!-- Espaçador -->
                <col style="width: 20%;"> <!-- Sala B -->
                <col style="width: 25%;"> <!-- Salão Principal -->
            </colgroup>
            <tbody>
                ${initialHTML}
                ${sectionsHTML}
                ${finalHTML}
            </tbody>
        </table>
    `;
}

const S140_CSS = `
    .s140-wrapper * { margin: 0; padding: 0; box-sizing: border-box; }
    .s140-wrapper { 
        font-family: Calibri, 'Segoe UI', sans-serif; 
        font-size: 13pt;
        line-height: 1.4;
        padding: 0;
        margin: 0;
        background: white;
    }
    .s140-wrapper .container {
        width: 100%;
        max-width: 200mm;
        margin: 0 auto;
        padding: 3mm;
        background: white; 
        min-height: 290mm; /* Force A4 height */
    }
    .s140-wrapper .header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 2px solid ${COLORS.SEPARATOR};
        padding-bottom: 8px;
        margin-bottom: 10px;
    }
    .s140-wrapper .congregation {
        font-family: Calibri, sans-serif;
        font-size: 14pt;
        font-weight: bold;
        color: ${COLORS.HEADER_TEXT};
    }
    .s140-wrapper .title-year {
        font-family: Calibri, sans-serif;
        font-size: 13pt;
        color: ${COLORS.HEADER_TEXT};
    }
    .s140-wrapper .week-info {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
        padding: 6px 0;
    }
    .s140-wrapper .week-date {
        font-family: Calibri, sans-serif;
        font-size: 13pt;
        font-weight: bold;
        color: #333;
    }
    .s140-wrapper .president-info, 
    .s140-wrapper .counselor-info {
        font-family: Calibri, sans-serif;
        font-size: 10pt;
        font-weight: bold;
        color: ${COLORS.LABEL_TEXT};
    }
    .s140-wrapper table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
    }
    .s140-wrapper tr {
        border-bottom: 1px solid #E0E0E0;
    }
    .s140-wrapper .page-break {
        page-break-after: always;
        display: block; 
        min-height: 1px;
    }
`;

export function generateS140UnifiedHTML(weekData: S140WeekDataUnified): string {
    const bodyContent = generateS140BodyContent(weekData);

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                ${S140_CSS}
            </style>
        </head>
        <body>
            <div class="container">
                ${bodyContent}
            </div>
        </body>
        </html>
    `;
}

// ============================================================================
// GERAÇÃO DE PDF - SEMANA ÚNICA
// ============================================================================

export async function generateS140UnifiedPDF(weekData: S140WeekDataUnified): Promise<void> {
    console.log('[S140] Gerando PDF Único (Container Pattern)...', weekData.weekId);

    // Construção Segura do DOM
    const wrapper = document.createElement('div');
    wrapper.className = 's140-wrapper';

    // 1. Injetar Estilos
    const style = document.createElement('style');
    // Forçar cor preta no cabeçalho para garantir visibilidade
    const cssWithForcedColor = S140_CSS + `
        .s140-wrapper .congregation, 
        .s140-wrapper .title-year,
        .s140-wrapper .week-date {
            color: #000000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
    `;
    style.innerHTML = cssWithForcedColor;
    wrapper.appendChild(style);

    // 2. Construir Página
    const bodyContent = generateS140BodyContent(weekData);
    if (!bodyContent) console.error('[S140] Body Content vazio!');

    const pageDiv = document.createElement('div');
    pageDiv.className = 'container';
    pageDiv.innerHTML = bodyContent;
    wrapper.appendChild(pageDiv);

    // 3. Configurar Wrapper para Renderização "Visível"
    wrapper.style.position = 'fixed';
    wrapper.style.left = '0';
    wrapper.style.top = '0';
    wrapper.style.zIndex = '99999';
    wrapper.style.width = '100vw';
    wrapper.style.height = '100vh';
    wrapper.style.overflow = 'auto';
    wrapper.style.background = 'white';

    // Centralizar conteúdo
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = 'center';
    wrapper.style.alignItems = 'flex-start'; // Top alignment

    // Container interno para o PDF (A4)
    const contentContainer = document.createElement('div');
    contentContainer.className = 's140-wrapper'; // CRÍTICO: Restaurar a classe para o CSS funcionar
    contentContainer.style.width = '210mm';
    // contentContainer.style.minHeight = '297mm'; // Removido para evitar página extra em branco
    contentContainer.style.background = 'white';
    contentContainer.style.padding = '0';
    contentContainer.style.boxSizing = 'border-box';

    // Configurar .container interno para ocupar altura total se necessário, sem forçar overflow
    // Pega o estilo e o pageDiv filhos do wrapper antigo
    while (wrapper.firstChild) {
        contentContainer.appendChild(wrapper.firstChild);
    }

    // Limpar o wrapper original (agora é só um holder pro posicionamento)
    wrapper.innerHTML = '';
    wrapper.appendChild(contentContainer);

    document.body.appendChild(wrapper);

    // Delay de estabilização
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
        const opt = {
            margin: 0,
            filename: `S-140-Unified_${weekData.weekId}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                scrollY: 0,
                scrollX: 0,
                windowWidth: 800 // Reintroduzir windowWidth para sanidade
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
        };

        await html2pdf().set(opt).from(contentContainer).save();
    } finally {
        if (document.body.contains(wrapper)) {
            document.body.removeChild(wrapper);
        }
    }
}

// ============================================================================
// GERAÇÃO MULTI-SEMANAS (do s140Generator base)
// ============================================================================




export async function generateMultiWeekS140UnifiedPDF(weeksData: S140WeekDataUnified[]): Promise<void> {
    console.log('[S140] Gerando PDF Multi-Semanas (Container Pattern)...', weeksData.length);

    // Construção Segura do DOM
    const wrapper = document.createElement('div');
    wrapper.className = 's140-wrapper';

    // 1. Injetar Estilos
    const style = document.createElement('style');
    // Forçar cor preta no cabeçalho
    const cssWithForcedColor = S140_CSS + `
        .s140-wrapper .congregation, 
        .s140-wrapper .title-year,
        .s140-wrapper .week-date {
            color: #000000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
    `;
    style.innerHTML = cssWithForcedColor;
    wrapper.appendChild(style);

    // 2. Construir Páginas
    weeksData.forEach((weekData, index) => {
        const bodyContent = generateS140BodyContent(weekData);
        if (!bodyContent) console.error('[S140] Body Content vazio na semana', weekData.weekId);

        const pageDiv = document.createElement('div');
        pageDiv.className = 'container';

        if (index < weeksData.length - 1) {
            pageDiv.classList.add('page-break');
        }

        pageDiv.innerHTML = bodyContent;
        wrapper.appendChild(pageDiv);
    });

    // 3. Configurar Wrapper para Renderização (Visível)
    wrapper.style.position = 'fixed'; // Garantir que está na viewport
    wrapper.style.left = '0';
    wrapper.style.top = '0';
    wrapper.style.zIndex = '99999'; // Topo absoluto
    wrapper.style.width = '100vw'; // Ocupar viewport momentaneamente
    wrapper.style.height = '100vh';
    wrapper.style.overflow = 'auto'; // Permitir scroll interno se necessário
    wrapper.style.background = 'white';

    // Centralizar conteúdo para melhor visualização durante o flash (opcional, mas bom UX)
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = 'center';
    wrapper.style.alignItems = 'flex-start';

    // Container interno para o PDF em si (A4)
    const contentContainer = document.createElement('div');
    contentContainer.className = 's140-wrapper'; // CRÍTICO: Restaurar a classe
    contentContainer.style.width = '210mm';
    contentContainer.style.background = 'white';

    // Mover os filhos do wrapper para o contentContainer
    while (wrapper.firstChild) {
        contentContainer.appendChild(wrapper.firstChild);
    }

    wrapper.innerHTML = '';
    wrapper.appendChild(contentContainer);

    document.body.appendChild(wrapper);

    // Delay de estabilização
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
        const weekRange = weeksData.length > 1
            ? `${weeksData[0].weekId}_a_${weeksData[weeksData.length - 1].weekId}`
            : weeksData[0]?.weekId || 'unknown';

        const opt = {
            margin: 0,
            filename: `S-140-Unified_${weekRange}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                scrollY: 0,
                scrollX: 0
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
            pagebreak: { mode: ['css', 'legacy'] }
        };

        // Renderizar o contentContainer, não o wrapper full-screen
        await html2pdf().set(opt).from(contentContainer).save();
    } finally {
        if (document.body.contains(wrapper)) {
            document.body.removeChild(wrapper);
        }
    }
}

// ============================================================================
// FUNÇÕES DE CONVENIÊNCIA
// ============================================================================

/**
 * Download S-140 Unificado para uma semana
 */
export async function downloadS140Unified(parts: WorkbookPart[]): Promise<void> {
    const weekData = await prepareS140UnifiedData(parts);
    await generateS140UnifiedPDF(weekData);
}

/**
 * Download S-140 Unificado para múltiplas semanas
 * @param allParts Todas as partes (serão agrupadas por weekId)
 * @param weekIds IDs das semanas a incluir (em ordem)
 */
export async function downloadS140UnifiedMultiWeek(
    allParts: WorkbookPart[],
    weekIds: string[]
): Promise<void> {
    const weeksData: S140WeekDataUnified[] = [];

    for (const weekId of weekIds) {
        const weekParts = allParts.filter(p => p.weekId === weekId);
        if (weekParts.length > 0) {
            const weekData = await prepareS140UnifiedData(weekParts);
            weeksData.push(weekData);
        }
    }

    if (weeksData.length === 0) {
        throw new Error('Nenhuma semana encontrada para gerar o S-140');
    }

    await generateMultiWeekS140UnifiedPDF(weeksData);
}

export function renderS140ToElement(weekData: S140WeekDataUnified): HTMLElement {
    // Construção Segura do DOM (Padronizada)
    const wrapper = document.createElement('div');
    wrapper.className = 's140-wrapper';

    // 1. Injetar Estilos
    const style = document.createElement('style');
    style.innerHTML = S140_CSS;
    wrapper.appendChild(style);

    // 2. Construir Conteúdo
    const bodyContent = generateS140BodyContent(weekData);
    const container = document.createElement('div');
    container.className = 'container';
    container.innerHTML = bodyContent;

    // Ajustes específicos para o Preview/Agent
    container.style.backgroundColor = '#ffffff';
    container.style.width = '800px';
    container.style.padding = '20px';

    wrapper.appendChild(container);

    return wrapper;
}
