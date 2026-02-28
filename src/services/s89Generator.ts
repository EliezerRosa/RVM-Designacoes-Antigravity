
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { WorkbookPart } from '../types';

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

/**
 * Gera o PDF do formulário S-89 preenchido
 */
export async function generateS89(part: WorkbookPart, assistantName?: string): Promise<Uint8Array> {
    const baseUrl = import.meta.env.BASE_URL || '/';
    // Remove barra duplicada se existir
    const path = `${baseUrl.replace(/\/$/, '')}/S-89_T.pdf`;

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

    // Data (Quinta-feira da semana, formato: "Quinta-feira, D/mês/AAAA")
    if (part.date) {
        const dateParts = part.date.split('-');
        if (dateParts.length === 3) {
            const baseDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
            const dayOfWeek = baseDate.getDay(); // 0=Dom, 1=Seg, ..., 4=Qui
            const daysToThursday = (4 - dayOfWeek + 7) % 7;
            const thursdayDate = new Date(baseDate);
            thursdayDate.setDate(thursdayDate.getDate() + daysToThursday);

            const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
            const day = thursdayDate.getDate();
            const month = MESES[thursdayDate.getMonth()];
            const year = thursdayDate.getFullYear();
            const displayDate = `Quinta-feira, ${day}/${month}/${year}`;

            page.drawText(displayDate, {
                x: POSITIONS.DATE.x,
                y: POSITIONS.DATE.y,
                size: FONT_SIZE.SMALL, // Texto mais longo, fonte menor
                font: fontRegular,
            });
        }
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
    srvmPhone?: string
): string {
    const studentName = part.resolvedPublisherName || part.rawPublisherName || 'Publicador';
    const salutation = recipientGender === 'sister' ? 'Prezada irmã' : 'Prezado irmão';

    // Calcular quinta-feira da semana (igual ao S-89)
    let displayDate = part.date;
    const dateParts = part.date.split('-');
    if (dateParts.length === 3) {
        const baseDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
        const dayOfWeek = baseDate.getDay();
        const daysToThursday = (4 - dayOfWeek + 7) % 7;
        const thursdayDate = new Date(baseDate);
        thursdayDate.setDate(thursdayDate.getDate() + daysToThursday);

        const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
            'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        const day = thursdayDate.getDate();
        const month = MESES[thursdayDate.getMonth()];
        const year = thursdayDate.getFullYear();
        displayDate = `quinta-feira, ${day} de ${month} de ${year}`;
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

    let msg = `Olá *${salutation} ${studentName}*! 👋\n\n`;
    msg += `Aqui está sua designação para a reunião de *${displayDate}*:\n\n`;
    msg += `─────────────\n`;

    if (isForAssistant && partnerName) {
        // Mensagem para o AJUDANTE
        msg += `${emoji} *Sua função:* Ajudante\n`;
        msg += `📝 *Tipo de Parte:* ${part.tipoParte}\n`;
        if (part.tituloParte) msg += `🎯 *Tema:* ${part.tituloParte}\n`;
        msg += `📍 *Local:* ${room}\n`;
        msg += `⏰ *Início:*${time}\n\n`;
        msg += `👤 *Titular:* ${partnerName}\n`;
        if (partnerPhone) msg += `📱 *WhatsApp do Titular:* ${partnerPhone}\n\n`;
        msg += `Por favor, entre em contato com o titular para combinarem o ensaio. 🤝`;
    } else {
        // Mensagem para o TITULAR
        msg += `${emoji} *Parte:* ${part.tipoParte}\n`;
        if (part.tituloParte) msg += `🎯 *Tema:* ${part.tituloParte}\n`;
        msg += `📍 *Local:* ${room}\n`;
        msg += `⏰ *Início:*${time}\n\n`;

        if (partnerName) {
            msg += `👥 *Ajudante:* ${partnerName}\n`;
            if (partnerPhone) msg += `📱 *WhatsApp do Ajudante:* ${partnerPhone}\n\n`;
            msg += `Por favor, entre em contato com o ajudante para combinarem o ensaio. 🤝\n\n`;
        }

        msg += `Bom preparo! Que Jeová abençoe seu esforço. ✨`;
    }

    msg += `\n─────────────\n`;

    // Link de confirmação (Portal Público)
    const baseOrigin = window.location.origin;
    const basePath = import.meta.env.BASE_URL || '/';
    // Garantir que não haja barras duplas entre origin e path, mas que path comece com /
    const normalizedPath = basePath.startsWith('/') ? basePath : `/${basePath}`;
    const baseUrl = `${baseOrigin}${normalizedPath}`.replace(/\/+$/, '');

    // Portal de confirmação
    const confirmUrl = `${baseUrl}/?portal=confirm&id=${part.id}`;
    msg += `\n👉 *Confirme sua participação aqui:* ${confirmUrl}\n`;

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
export async function copyS89ToClipboard(part: WorkbookPart, assistantName?: string): Promise<boolean> {
    try {
        // 1. Gerar o PDF real (Fiel)
        const pdfBytes = await generateS89(part, assistantName);

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
