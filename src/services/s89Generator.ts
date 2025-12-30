
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { WorkbookPart } from '../types';

// Configurações de layout (baseadas no generate_s89_forms.py original)
const POSITIONS = {
    NAME: { x: 60, y: 270 },
    ASSISTANT: { x: 86, y: 245 },
    DATE: { x: 60, y: 224 },
    PART: { x: 150, y: 200 },
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

    // Data (DD/MM/YYYY)
    if (part.date) {
        const dateParts = part.date.split('-');
        if (dateParts.length === 3) {
            const displayDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
            page.drawText(displayDate, {
                x: POSITIONS.DATE.x,
                y: POSITIONS.DATE.y,
                size: FONT_SIZE.DEFAULT,
                font: fontRegular,
            });
        }
    }

    // Número da Parte (User Request: Colocar Tema/Título, mesmo truncado)
    // Coordenada PART: x: 150. Se for muito longo, truncamos para evitar sair da folha.
    let partTitle = part.tituloParte || '';
    if (partTitle.length > 55) {
        partTitle = partTitle.substring(0, 52) + '...';
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
 */
export function generateWhatsAppMessage(part: WorkbookPart, assistantName?: string): string {
    const studentName = part.resolvedPublisherName || part.rawPublisherName || 'Publicador';
    const dateParts = part.date.split('-');
    const displayDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : part.date;

    let emoji = '📅';
    if (part.tipoParte.toLowerCase().includes('leitura')) emoji = '📖';
    if (part.tipoParte.toLowerCase().includes('iniciando')) emoji = '🗣️';

    let msg = `Olá *${studentName}*! 👋\n\nSegue sua designação para a reunião de *${displayDate}*:\n\n${emoji} *Parte:* ${part.tipoParte}`;

    if (part.tituloParte) msg += `\n📝 *Tema:* ${part.tituloParte}`;

    if (assistantName) msg += `\n👥 *Ajudante:* ${assistantName}`;

    msg += `\n\nPor favor, confirme o recebimento.\nBom preparo!`;

    return msg;
}

export function openWhatsApp(part: WorkbookPart, assistantName?: string) {
    const message = generateWhatsAppMessage(part, assistantName);
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
}
