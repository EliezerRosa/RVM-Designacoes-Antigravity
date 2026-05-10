
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { WorkbookPart } from '../types';
import { resolveAppUrl } from '../utils/appUrl';
import { supabase } from '../lib/supabase';

// Configurações de layout (baseadas no generate_s89_forms.py original)
const POSITIONS = {
    NAME: { x: 60, y: 270 },
    ASSISTANT: { x: 86, y: 245 },
    DATE: { x: 60, y: 224 },
    PART: { x: 115, y: 200 }, // Corrigido: label "Número da parte:" é longo, x=115 fica logo após o ":"
    ROOM: { x: 70, y: 168 },
};

const FONT_SIZE = {
    NAME: 12,
    DEFAULT: 11,
    SMALL: 10
};

const DEFAULT_MEETING_DAY_OF_WEEK = 4;
const S89_MEETING_DAY_SETTING_KEY = 's89_meeting_day_by_week';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sabado'];

function normalizeMeetingDayOfWeek(value?: number): number {
    if (typeof value === 'number' && value >= 0 && value <= 6) return value;
    return DEFAULT_MEETING_DAY_OF_WEEK;
}

function capitalizeFirst(text: string): string {
    if (!text) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function resolveBaseDate(part: WorkbookPart): Date | null {
    const source = part.date || part.weekId;
    if (!source) return null;
    const dateParts = source.split('-');
    if (dateParts.length !== 3) return null;
    const [year, month, day] = dateParts.map(v => parseInt(v, 10));
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function resolveMeetingDate(baseDate: Date, meetingDayOfWeek?: number): Date {
    const targetDow = normalizeMeetingDayOfWeek(meetingDayOfWeek);
    const daysToTarget = (targetDow - baseDate.getDay() + 7) % 7;
    const targetDate = new Date(baseDate);
    targetDate.setDate(targetDate.getDate() + daysToTarget);
    return targetDate;
}

async function getMeetingDayOfWeekFromSettings(weekId?: string): Promise<number> {
    if (!weekId) return DEFAULT_MEETING_DAY_OF_WEEK;
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', S89_MEETING_DAY_SETTING_KEY)
            .maybeSingle();

        if (error || !data || typeof data.value !== 'object' || data.value === null) {
            return DEFAULT_MEETING_DAY_OF_WEEK;
        }

        const map = data.value as Record<string, number>;
        return normalizeMeetingDayOfWeek(map[weekId]);
    } catch {
        return DEFAULT_MEETING_DAY_OF_WEEK;
    }
}

/**
 * Gera o PDF do formulário S-89 preenchido
 */
export async function generateS89(part: WorkbookPart, assistantName?: string, meetingDayOfWeek?: number): Promise<Uint8Array> {
    const path = resolveAppUrl('S-89_T.pdf');

    const templateBytes = await fetch(path).then(res => {
        if (!res.ok) throw new Error(`Não foi possível carregar o template em ${path}. Verifique se S-89_T.pdf está na pasta public.`);
        return res.arrayBuffer();
    });

    const pdfDoc = await PDFDocument.load(templateBytes);
    const page = pdfDoc.getPages()[0];
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Nome do Estudante 
    const studentName = part.resolvedPublisherName || part.rawPublisherName || '';

    page.drawText(studentName, {
        x: POSITIONS.NAME.x,
        y: POSITIONS.NAME.y,
        size: FONT_SIZE.NAME,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    // Ajudante (Opcional)
    if (assistantName) {
        page.drawText(assistantName, {
            x: POSITIONS.ASSISTANT.x,
            y: POSITIONS.ASSISTANT.y,
            size: FONT_SIZE.DEFAULT,
            font: fontRegular,
            color: rgb(0, 0, 0),
        });
    }

    // Data da reunião da semana (default: quinta-feira), formato: "Dia-da-semana, D/mês/AAAA"
    const baseDate = resolveBaseDate(part);
    if (baseDate) {
        const meetingDate = resolveMeetingDate(baseDate, meetingDayOfWeek);
        const day = meetingDate.getDate();
        const month = MESES[meetingDate.getMonth()];
        const year = meetingDate.getFullYear();
        const dayLabel = capitalizeFirst(DIAS[meetingDate.getDay()] || 'quinta-feira');
        const displayDate = `${dayLabel}, ${day}/${month}/${year}`;

        page.drawText(displayDate, {
            x: POSITIONS.DATE.x,
            y: POSITIONS.DATE.y,
            size: FONT_SIZE.SMALL, // Texto mais longo, fonte menor
            font: fontRegular,
        });
    }

    // Número da Parte (User Request: Colocar Tema/Título, mesmo truncado)
    // Coordenada PART: x: 150. Se for muito longo, truncamos para evitar sair da folha.
    let partTitle = part.tituloParte || '';
    if (partTitle.length > 60) {
        partTitle = partTitle.substring(0, 57) + '...';
    }

    page.drawText(partTitle, {
        x: POSITIONS.PART.x,
        y: POSITIONS.PART.y,
        size: FONT_SIZE.DEFAULT, // Pode ser necessário diminuir se for muito comum textos longos
        font: fontRegular,
    });

    // Sala
    // Só escrevemos se for Sala B. Se for Principal, deixamos em branco (padrão).
    const room = part.modalidade?.toLowerCase().includes('b') ? 'Sala B' : '';
    if (room) {
        page.drawText(room, {
            x: POSITIONS.ROOM.x,
            y: POSITIONS.ROOM.y,
            size: FONT_SIZE.DEFAULT,
            font: fontRegular,
        });
    }

    return pdfDoc.save();
}

/**
 * Helper para baixar o PDF gerado
 */
export function downloadS89(bytes: Uint8Array, filename: string) {
    // Cast 'as any' para evitar conflito de tipagem entre ArrayBuffer e SharedArrayBuffer no TS
    const blob = new Blob([bytes as any], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Gera mensagem para WhatsApp
 * @param part A parte da reunião
 * @param recipientGender Gênero do destinatário ('brother' | 'sister')
 * @param partnerName Nome do parceiro (ajudante se titular, titular se ajudante)
 * @param partnerPhone Telefone do parceiro
 * @param isForAssistant Se true, a mensagem é para o ajudante
 */
export function generateWhatsAppMessage(
    part: WorkbookPart,
    recipientGender: 'brother' | 'sister' = 'brother',
    partnerName?: string,
    partnerPhone?: string,
    isForAssistant: boolean = false,
    srvmName?: string,
    srvmPhone?: string,
    confirmationUrl?: string,
    isSubstitution: boolean = false,
    meetingDayOfWeek?: number
): string {
    const studentName = part.resolvedPublisherName || part.rawPublisherName || 'Publicador';
    const salutation = recipientGender === 'sister' ? 'Prezada irmã' : 'Prezado irmão';

    // Calcular dia-alvo da reunião (default = quinta = 4). Override apenas para a mensagem.
    let displayDate = part.date || part.weekId || '';
    const dateParts = displayDate ? displayDate.split('-') : [];
    if (dateParts.length === 3) {
        const baseDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
        const dayOfWeek = baseDate.getDay();
        const targetDow = (typeof meetingDayOfWeek === 'number' && meetingDayOfWeek >= 0 && meetingDayOfWeek <= 6) ? meetingDayOfWeek : 4;
        const daysToTarget = (targetDow - dayOfWeek + 7) % 7;
        const targetDate = new Date(baseDate);
        targetDate.setDate(targetDate.getDate() + daysToTarget);

        const day = targetDate.getDate();
        const month = MESES[targetDate.getMonth()];
        const year = targetDate.getFullYear();
        const DIAS_WHATSAPP = ['domingo', 'segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sabado'];
        displayDate = `${DIAS_WHATSAPP[targetDate.getDay()]}, ${day} de ${month} de ${year}`;
    }

    let emoji = '📅';
    const pType = (part.tipoParte || '').toLowerCase();
    if (pType.includes('leitura')) emoji = '📖';
    if (pType.includes('iniciando') || pType.includes('conversa')) emoji = '🗣️';
    if (pType.includes('cultivando') || pType.includes('revisita')) emoji = '🌱';
    if (pType.includes('fazendo') || pType.includes('estudo')) emoji = '📚';
    if (pType.includes('presidente')) emoji = '👔';
    if (pType.includes('oração')) emoji = '🙏';

    // Determinar Sala
    const room = part.modalidade?.toLowerCase().includes('b') ? 'SALA B 🏛️' : 'SALÃO PRINCIPAL 🏟️';
    const time = part.horaInicio ? ` às *${part.horaInicio}*` : '';

    let msg = `Olá *${salutation} ${studentName}*! 👋\n`;
    // Determinar função em destaque (logo abaixo da saudação)
    let highlightFunction = 'TITULAR';
    if (isForAssistant) {
        highlightFunction = (part.tipoParte?.toLowerCase().includes('leitor') && part.tipoParte?.toLowerCase().includes('ebc'))
            ? 'LEITOR'
            : 'AJUDANTE';
    } else if (part.tipoParte?.toLowerCase().includes('dirigente') && part.tipoParte?.toLowerCase().includes('ebc')) {
        highlightFunction = 'DIRIGENTE';
    } else if (part.tipoParte?.toLowerCase().includes('presidente')) {
        highlightFunction = 'PRESIDENTE';
    } else if (part.tipoParte?.toLowerCase().includes('oração')) {
        highlightFunction = 'ORAÇÃO';
    }
    msg += `*SUA FUNÇÃO: ${highlightFunction}*\n\n`;
    if (isSubstitution) {
        msg += `🔄 *PEDIDO DE SUBSTITUIÇÃO*\n`;
        msg += `_Esta parte foi reatribuída a você. Pedimos a gentileza de avaliar e responder o quanto antes._\n\n`;
    }
    msg += `Aqui está sua designação para a reunião de *${displayDate}*:\n\n`;
    msg += `─────────────\n`;

    if (isForAssistant) {
        // Mensagem para o AJUDANTE / LEITOR
        let functionName = 'Ajudante';
        let mainRoleName = 'Titular';
        if (part.tipoParte?.toLowerCase().includes('leitor') && part.tipoParte?.toLowerCase().includes('ebc')) {
            functionName = 'Leitor';
            mainRoleName = 'Dirigente';
        }

        msg += `${emoji} *Sua função:* ${functionName}\n`;
        msg += `📝 *Tipo de Parte:* ${part.tipoParte}\n`;
        if (part.tituloParte) msg += `🎯 *Tema:* ${part.tituloParte}\n`;
        msg += `📍 *Local:* ${room}\n`;
        msg += `⏰ *Início:*${time}\n\n`;

        if (partnerName) {
            msg += `👤 *${mainRoleName}:* ${partnerName}\n`;
            if (partnerPhone) msg += `📱 *WhatsApp do ${mainRoleName}:* ${partnerPhone}\n\n`;
        }

        if (functionName === 'Ajudante') {
            msg += partnerName
                ? `Por favor, entre em contato com o titular para combinarem o ensaio. 🤝`
                : `Aguarde o contato do titular para combinarem o ensaio. 🤝`;
        } else {
            msg += `Lembre-se de revisar os parágrafos com antecedência. O dirigente poderá alinhar detalhes com você. 🤝`;
        }
    } else {
        // Mensagem para o TITULAR / DIRIGENTE
        msg += `${emoji} *Parte:* ${part.tipoParte}\n`;
        if (part.tituloParte) msg += `🎯 *Tema:* ${part.tituloParte}\n`;
        msg += `📍 *Local:* ${room}\n`;
        msg += `⏰ *Início:*${time}\n\n`;

        if (partnerName) {
            let roleName = 'Ajudante';
            if (part.tipoParte?.toLowerCase().includes('dirigente') && part.tipoParte?.toLowerCase().includes('ebc')) {
                roleName = 'Leitor';
            }

            msg += `👥 *${roleName}:* ${partnerName}\n`;
            if (partnerPhone) msg += `📱 *WhatsApp do ${roleName}:* ${partnerPhone}\n\n`;
            
            if (roleName === 'Ajudante') {
                msg += `Por favor, entre em contato com o ajudante para combinarem o ensaio. 🤝\n\n`;
            } else {
                msg += `Sinta-se à vontade para combinar os detalhes e andamento da leitura com ele. 📖\n\n`;
            }
        }

        msg += `Bom preparo! Que Jeová abençoe seu esforço. ✨`;
    }

    msg += `\n─────────────\n`;

    if (confirmationUrl) {
        msg += `\n👉 *CLIQUE AQUI PARA CONFIRMAR SE PODERÁ OU NÃO*\n${confirmationUrl}\n`;
    }

    msg += `\n*Por favor, confirme o recebimento desta mensagem.* 🙏\n`;

    if (srvmName && srvmPhone) {
        msg += `\n─────────────\n`;
        msg += `👤 *Responsável RVM:* ${srvmName} (${srvmPhone})\n`;
        // Formatar link wa.me
        let cleaned = srvmPhone.replace(/[^0-9]/g, '');
        if (cleaned && cleaned.length <= 11 && !cleaned.startsWith('55')) cleaned = '55' + cleaned;
        msg += `📱 *Falar com ele (Zap):* https://wa.me/${cleaned}`;
    }

    return msg;
}

/**
 * Formata número de telefone para WhatsApp (remove espaços e hífens, adiciona código do país)
 */
function formatPhoneForWhatsApp(phone: string): string {
    // Remove espaços, hífens, parênteses
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    // Se não começar com 55 (Brasil), adiciona
    if (!cleaned.startsWith('55') && cleaned.length <= 11) {
        cleaned = '55' + cleaned;
    }
    return cleaned;
}

export function openWhatsApp(
    part: WorkbookPart,
    recipientGender: 'brother' | 'sister' = 'brother',
    partnerName?: string,
    partnerPhone?: string,
    phone?: string,
    isForAssistant: boolean = false
) {
    const message = generateWhatsAppMessage(part, recipientGender, partnerName, partnerPhone, isForAssistant);
    const encoded = encodeURIComponent(message);

    // Se tiver telefone, abre direto para o número
    if (phone && phone.trim()) {
        const formattedPhone = formatPhoneForWhatsApp(phone);
        window.open(`https://wa.me/${formattedPhone}?text=${encoded}`, '_blank');
    } else {
        // Sem telefone: abre WhatsApp para escolher contato
        window.open(`https://wa.me/?text=${encoded}`, '_blank');
    }
}

/**
 * Fluxo Combinado: Baixa o S-89 e abre WhatsApp com mensagem pronta
 * O usuário só precisa arrastar o arquivo baixado para a conversa
 */
export async function sendS89ViaWhatsApp(
    part: WorkbookPart,
    recipientGender: 'brother' | 'sister' = 'brother',
    partnerName?: string,
    partnerPhone?: string,
    phone?: string,
    isForAssistant: boolean = false
): Promise<void> {
    try {
        // 1. Gerar e baixar o S-89
        const pdfBytes = await generateS89(part, (isForAssistant ? undefined : partnerName)); // Note: Assistant on card is assistantName
        const fileName = `S-89_${part.date}_${part.resolvedPublisherName || part.rawPublisherName}.pdf`;
        downloadS89(pdfBytes, fileName);

        // 2. Pequeno delay para garantir que o download iniciou
        await new Promise(resolve => setTimeout(resolve, 500));

        // 3. Abrir WhatsApp com mensagem pronta
        openWhatsApp(part, recipientGender, partnerName, partnerPhone, phone, isForAssistant);
    } catch (error) {
        console.error('Erro ao enviar S-89 via WhatsApp:', error);
        throw error;
    }
}

import * as pdfjsLib from 'pdfjs-dist';

// Configuração do Worker movida para main.tsx para garantir inicialização precoce

/**
 * Renderiza a primeira página de um PDF (bytes) para um Blob PNG (exato e fiel)
 */
async function renderPdfToPngBlob(pdfBytes: Uint8Array): Promise<Blob | null> {
    try {
        // 1. Carregar Documento
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
        const pdf = await loadingTask.promise;

        // 2. Pegar Página 1
        const page = await pdf.getPage(1);

        // 3. Configurar Viewport (Scale 2.0 para alta qualidade / Retina)
        const scale = 2.0;
        const viewport = page.getViewport({ scale });

        // 4. Preparar Canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas context not available');

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // 5. Renderizar
        const renderContext = {
            canvasContext: context,
            viewport: viewport,
            canvas: canvas, // Fix TS: require canvas property
        };

        await page.render(renderContext).promise;

        // 6. Exportar Blob
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png');
        });

    } catch (error) {
        console.error('Erro ao renderizar PDF para Imagem:', error);
        throw error;
    }
}

/**
 * Copia a imagem FIEL do cartão S-89 (renderizada do PDF) para a área de transferência
 */
export async function copyS89ToClipboard(part: WorkbookPart, assistantName?: string, meetingDayOfWeek?: number): Promise<boolean> {
    try {
        const resolvedMeetingDayOfWeek = typeof meetingDayOfWeek === 'number'
            ? normalizeMeetingDayOfWeek(meetingDayOfWeek)
            : await getMeetingDayOfWeekFromSettings(part.weekId);

        // 1. Gerar o PDF real (Fiel)
        const pdfBytes = await generateS89(part, assistantName, resolvedMeetingDayOfWeek);

        // 2. Renderizar PDF -> PNG (Fiel)
        const blob = await renderPdfToPngBlob(pdfBytes);

        if (!blob) return false;

        // 3. Copiar para Clipboard
        if (navigator.clipboard && navigator.clipboard.write) {
            await navigator.clipboard.write([
                new ClipboardItem({
                    [blob.type]: blob
                })
            ]);
            return true;
        } else {
            console.error('Clipboard API não suportada ou sem permissão');
            return false;
        }
    } catch (error) {
        console.error('Erro ao copiar S-89 para clipboard:', error);
        return false;
    }
}
