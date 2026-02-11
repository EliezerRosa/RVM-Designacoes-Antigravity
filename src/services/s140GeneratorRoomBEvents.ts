/**
 * S-140 Sala B EV Generator - Com Suporte a Eventos Especiais
 * Versão com ajustes automáticos quando há eventos especiais na semana
 * 
 * Melhorias sobre o S-140 Sala B padrão:
 * - Filtra partes CANCELADAS automaticamente
 * - Exibe banner de evento especial quando aplicável
 * - Usa A4 retrato para melhor visualização
 * - Mostra informações do evento (tema, responsável)
 */

import html2pdf from 'html2pdf.js';
import type { WorkbookPart, SpecialEvent } from '../types';
import { specialEventService, EVENT_TEMPLATES } from './specialEventService';

// ============================================================================
// CONSTANTES
// ============================================================================

const CONGREGATION_NAME = 'PARQUE JACARAÍPE';

const COLORS = {
    TESOUROS_BG: '#575A5D',
    MINISTERIO_BG: '#BE8900',
    VIDA_CRISTA_BG: '#7E0024',
    EVENT_BG: '#7c3aed',      // Roxo para eventos especiais
    HEADER_TEXT: '#000000',
    LABEL_TEXT: '#575A5D',
    WHITE: '#FFFFFF',
    SEPARATOR: '#575A5D',
};

const EXCLUDED_PARTS = ['Elogios e Conselhos', 'Elogios', 'Conselhos'];
const HIDDEN_ASSIGNEE_PARTS = ['Comentários Iniciais', 'Comentários Finais'];
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
    isCancelled?: boolean;
    cancelReason?: string;
}

interface S140WeekDataEV {
    weekId: string;
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
// PREPARAÇÃO DE DADOS COM EVENTOS
// ============================================================================

export async function prepareS140RoomBDataEV(parts: WorkbookPart[]): Promise<S140WeekDataEV> {
    if (parts.length === 0) {
        throw new Error('Nenhuma parte fornecida para o S-140');
    }

    const sortedParts = [...parts].sort((a, b) => (a.seq || 0) - (b.seq || 0));
    const weekId = sortedParts[0].weekId;

    // Buscar eventos especiais da semana
    let events: SpecialEvent[] = [];
    try {
        events = await specialEventService.getEventsByWeek(weekId);
    } catch (err) {
        console.warn('[S140-EV] Erro ao buscar eventos:', err);
    }

    // Verificar se a semana foi cancelada
    const cancelWeekEvent = events.find(e => {
        const template = EVENT_TEMPLATES.find(t => t.id === e.templateId);
        return template?.impact.action === 'CANCEL_WEEK';
    });
    const isWeekCancelled = !!cancelWeekEvent;
    const cancelReason = cancelWeekEvent ?
        EVENT_TEMPLATES.find(t => t.id === cancelWeekEvent.templateId)?.name : undefined;

    // Filtrar partes CANCELADAS (não exibir no S-140)
    const activeParts = sortedParts.filter(p => p.status !== 'CANCELADA');

    // Encontrar partes especiais
    const presidentPart = activeParts.find(p =>
        p.tipoParte === 'Presidente' || p.tipoParte === 'Presidente da Reunião'
    );
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

    // Mapa de ajudantes
    const ajudanteByTipo = new Map<string, string>();
    ajudanteParts.forEach(a => {
        const name = a.resolvedPublisherName || '';
        const normalizedTipo = normalizeTipoParte(a.tipoParte);
        if (name && normalizedTipo) {
            ajudanteByTipo.set(normalizedTipo, name);
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
            if (!HIDDEN_ASSIGNEE_PARTS.some(h => p.tipoParte?.includes(h))) {
                mainHallAssignee = p.resolvedPublisherName || '';
            }

            const normalizedTipo = normalizeTipoParte(p.tipoParte);
            const mainHallAssistant = ajudanteByTipo.get(normalizedTipo);

            const title = p.tituloParte || p.tipoParte;
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

    const leituraPart = activeParts.find(p =>
        p.tipoParte === 'Leitura da Bíblia' || p.tipoParte === 'Leitura da Biblia'
    );

    return {
        weekId,
        weekDisplay: sortedParts[0].weekDisplay,
        bibleReading: leituraPart?.descricaoParte || '',
        president: presidentPart?.resolvedPublisherName || '',
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
// GERAÇÃO DE HTML COM EVENTOS
// ============================================================================

export function generateS140RoomBHTMLEV(weekData: S140WeekDataEV): string {
    const year = new Date().getFullYear();

    // Se a semana foi cancelada, exibir mensagem especial
    if (weekData.isWeekCancelled) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Calibri', Arial, sans-serif; }
                    .container { width: 100%; max-width: 210mm; margin: 0 auto; padding: 20px; }
                    .cancelled-notice {
                        text-align: center;
                        padding: 60px 20px;
                        background: linear-gradient(135deg, ${COLORS.EVENT_BG}, #5b21b6);
                        color: white;
                        border-radius: 12px;
                        margin: 40px 0;
                    }
                    .cancelled-icon { font-size: 48px; margin-bottom: 16px; }
                    .cancelled-title { font-size: 24px; font-weight: bold; margin-bottom: 8px; }
                    .cancelled-reason { font-size: 18px; opacity: 0.9; }
                    .week-display { font-size: 14px; margin-top: 16px; opacity: 0.8; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h1 style="font-size: 16px; color: ${COLORS.HEADER_TEXT};">${CONGREGATION_NAME}</h1>
                        <p style="font-size: 12px; color: ${COLORS.LABEL_TEXT};">
                            Programação da reunião do meio de semana — ${year}
                        </p>
                    </div>
                    <div class="cancelled-notice">
                        <div class="cancelled-icon">📅</div>
                        <div class="cancelled-title">Reunião Cancelada</div>
                        <div class="cancelled-reason">${weekData.cancelReason || 'Evento Especial'}</div>
                        <div class="week-display">${weekData.weekDisplay}</div>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    // Agrupar partes por seção
    const sections: { name: string; color: string; parts: S140Part[] }[] = [];
    let currentSection = '';
    let currentParts: S140Part[] = [];

    weekData.parts.forEach(p => {
        if (p.section !== currentSection) {
            if (currentParts.length > 0) {
                sections.push({
                    name: getSectionName(currentSection),
                    color: getSectionColor(currentSection),
                    parts: currentParts
                });
            }
            currentSection = p.section;
            currentParts = [];
        }
        currentParts.push(p);
    });
    if (currentParts.length > 0) {
        sections.push({
            name: getSectionName(currentSection),
            color: getSectionColor(currentSection),
            parts: currentParts
        });
    }

    // Gerar banner de eventos
    let eventBannerHTML = '';
    if (weekData.hasEvents) {
        const eventList = weekData.events.map(e => {
            const template = EVENT_TEMPLATES.find(t => t.id === e.templateId);
            return `<div style="margin: 4px 0;">
                <strong>⚡ ${template?.name || e.templateId}</strong>
                ${e.theme ? `<br><span style="font-size: 11px; opacity: 0.9;">Tema: ${e.theme}</span>` : ''}
                ${e.responsible ? `<br><span style="font-size: 11px; opacity: 0.9;">Responsável: ${e.responsible}</span>` : ''}
            </div>`;
        }).join('');

        eventBannerHTML = `
            <div style="
                background: linear-gradient(135deg, ${COLORS.EVENT_BG}, #5b21b6);
                color: white;
                padding: 12px 16px;
                border-radius: 8px;
                margin-bottom: 16px;
                font-size: 12px;
            ">
                <div style="font-weight: bold; margin-bottom: 8px; font-size: 13px;">
                    📌 EVENTOS ESPECIAIS NESTA SEMANA
                </div>
                ${eventList}
            </div>
        `;
    }

    // Gerar HTML das seções
    let sectionsHTML = '';
    sections.forEach(section => {
        const isMinisterio = section.name.includes('MINISTÉRIO');

        // Header da seção
        sectionsHTML += `
            <tr>
                <td colspan="${isMinisterio ? 4 : 3}" style="
                    background: ${section.color};
                    color: white;
                    font-weight: bold;
                    padding: 8px 12px;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                ">
                    ${section.name}
                </td>
            </tr>
        `;

        // Sub-header com colunas (apenas no Ministério)
        if (isMinisterio) {
            sectionsHTML += `
                <tr style="background: #f5f5f5;">
                    <td style="width: 50px; padding: 4px 8px; font-size: 9px; color: ${COLORS.LABEL_TEXT}; font-weight: bold;">Hora</td>
                    <td style="padding: 4px 8px; font-size: 9px; color: ${COLORS.LABEL_TEXT}; font-weight: bold;">Parte</td>
                    <td style="width: 130px; padding: 4px 8px; font-size: 9px; color: ${COLORS.LABEL_TEXT}; font-weight: bold; text-align: center;">Salão Principal</td>
                    <td style="width: 130px; padding: 4px 8px; font-size: 9px; color: ${COLORS.LABEL_TEXT}; font-weight: bold; text-align: center;">Sala B</td>
                </tr>
            `;
        }

        // Linhas das partes
        section.parts.forEach(part => {
            const assigneeDisplay = part.mainHallAssistant
                ? `${part.mainHallAssignee}<br><span style="font-size: 10px; color: #666;">c/ ${part.mainHallAssistant}</span>`
                : part.mainHallAssignee;

            if (isMinisterio) {
                sectionsHTML += `
                    <tr style="border-bottom: 1px solid #e5e5e5;">
                        <td style="padding: 6px 8px; font-size: 11px; color: #666; vertical-align: top;">${part.time}</td>
                        <td style="padding: 6px 8px; font-size: 12px; color: #1f2937;">
                            ${part.isCantico ? `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${section.color}; margin-right: 6px;"></span>` : ''}
                            ${part.title}
                        </td>
                        <td style="padding: 6px 8px; font-size: 12px; color: #1f2937; text-align: center; font-weight: 600;">
                            ${assigneeDisplay}
                        </td>
                        <td style="padding: 6px 8px; font-size: 12px; color: #1f2937; text-align: center; font-weight: 600; background: #fafafa;">
                            ${part.isStudentPart ? (part.roomBAssignee || '<span style="color: #999;">—</span>') : ''}
                        </td>
                    </tr>
                `;
            } else {
                sectionsHTML += `
                    <tr style="border-bottom: 1px solid #e5e5e5;">
                        <td style="padding: 6px 8px; font-size: 11px; color: #666; width: 50px; vertical-align: top;">${part.time}</td>
                        <td style="padding: 6px 8px; font-size: 12px; color: #1f2937;">
                            ${part.isCantico ? `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${section.color}; margin-right: 6px;"></span>` : ''}
                            ${part.title}
                        </td>
                        <td style="padding: 6px 8px; font-size: 12px; color: #1f2937; font-weight: 600; width: 160px;">
                            ${assigneeDisplay}
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
                body { font-family: 'Calibri', Arial, sans-serif; font-size: 12px; line-height: 1.4; }
                .container { width: 100%; max-width: 210mm; margin: 0 auto; padding: 12px; }
                table { width: 100%; border-collapse: collapse; }
            </style>
        </head>
        <body>
            <div class="container">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid ${COLORS.SEPARATOR};">
                    <div>
                        <h1 style="font-size: 16px; font-weight: bold; color: ${COLORS.HEADER_TEXT};">${CONGREGATION_NAME}</h1>
                        <p style="font-size: 11px; color: ${COLORS.LABEL_TEXT};">
                            Programação da reunião do meio de semana — ${year}
                        </p>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 14px; font-weight: bold; color: ${COLORS.HEADER_TEXT};">${weekData.weekDisplay}</div>
                        ${weekData.bibleReading ? `<div style="font-size: 10px; color: ${COLORS.LABEL_TEXT};">${weekData.bibleReading}</div>` : ''}
                    </div>
                </div>

                <!-- Info Row -->
                <div style="display: flex; justify-content: space-between; background: #f5f5f5; padding: 8px 12px; margin-bottom: 12px; border-radius: 4px; font-size: 11px;">
                    <div>
                        <span style="color: ${COLORS.LABEL_TEXT}; font-weight: bold;">Presidente:</span>
                        <span style="color: ${COLORS.HEADER_TEXT}; font-weight: 600;">${weekData.president}</span>
                    </div>
                    <div>
                        <span style="color: ${COLORS.LABEL_TEXT}; font-weight: bold;">Oração Inicial:</span>
                        <span style="color: ${COLORS.HEADER_TEXT};">${weekData.openingPrayer}</span>
                    </div>
                    <div>
                        <span style="color: ${COLORS.LABEL_TEXT}; font-weight: bold;">Oração Final:</span>
                        <span style="color: ${COLORS.HEADER_TEXT};">${weekData.closingPrayer}</span>
                    </div>
                </div>

                <!-- Event Banner -->
                ${eventBannerHTML}

                <!-- Parts Table -->
                <table>
                    <tbody>
                        ${sectionsHTML}
                    </tbody>
                </table>

                ${weekData.counselorRoomB ? `
                <div style="margin-top: 12px; padding: 8px 12px; background: #f5f5f5; border-radius: 4px; font-size: 11px;">
                    <span style="color: ${COLORS.LABEL_TEXT}; font-weight: bold;">Conselheiro Sala B:</span>
                    <span style="color: ${COLORS.HEADER_TEXT}; font-weight: 600;">${weekData.counselorRoomB}</span>
                </div>
                ` : ''}
            </div>
        </body>
        </html>
    `;
}

// ============================================================================
// GERAÇÃO DE PDF (A4 RETRATO)
// ============================================================================

export async function generateS140RoomBPDFEV(weekData: S140WeekDataEV): Promise<void> {
    const html = generateS140RoomBHTMLEV(weekData);

    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    document.body.appendChild(container);

    try {
        const opt = {
            margin: 10,
            filename: `S-140-SalaB-EV_${weekData.weekId}.pdf`,
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

// ============================================================================
// FUNÇÃO DE CONVENIÊNCIA
// ============================================================================

export async function downloadS140RoomBEV(parts: WorkbookPart[]): Promise<void> {
    const weekData = await prepareS140RoomBDataEV(parts);
    await generateS140RoomBPDFEV(weekData);
}
