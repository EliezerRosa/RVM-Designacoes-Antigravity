
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
 * @param assistantName Nome do ajudante (quando a parte é de titular)
 * @param isForAssistant Se true, a mensagem é para o ajudante (não para o titular)
 * @param titularName Nome do titular (quando a mensagem é para o ajudante)
 */
export function generateWhatsAppMessage(
    part: WorkbookPart,
    assistantName?: string,
    isForAssistant: boolean = false,
    titularName?: string
): string {
    const studentName = part.resolvedPublisherName || part.rawPublisherName || 'Publicador';

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
        displayDate = `Quinta-feira, ${day}/${month}/${year}`;
    }

    let emoji = '📅';
    if (part.tipoParte.toLowerCase().includes('leitura')) emoji = '📖';
    if (part.tipoParte.toLowerCase().includes('iniciando')) emoji = '🗣️';
    if (part.tipoParte.toLowerCase().includes('cultivando')) emoji = '🌱';
    if (part.tipoParte.toLowerCase().includes('fazendo')) emoji = '📚';

    let msg: string;

    if (isForAssistant && titularName) {
        // Mensagem para o AJUDANTE
        msg = `Olá *${studentName}*! 👋\n\nVocê foi designado(a) como *ajudante* para a reunião de *${displayDate}*:\n\n${emoji} *Parte:* ${part.tipoParte}`;
        if (part.tituloParte) msg += `\n📝 *Tema:* ${part.tituloParte}`;
        msg += `\n👤 *Titular:* ${titularName}`;
        msg += `\n\nPor favor, entre em contato com o titular para ensaiar.`;
    } else {
        // Mensagem para o TITULAR
        msg = `Olá *${studentName}*! 👋\n\nSegue sua designação para a reunião de *${displayDate}*:\n\n${emoji} *Parte:* ${part.tipoParte}`;
        if (part.tituloParte) msg += `\n📝 *Tema:* ${part.tituloParte}`;
        if (assistantName) msg += `\n👥 *Ajudante:* ${assistantName}`;
        msg += `\n\nPor favor, confirme o recebimento.\nBom preparo!`;
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
    assistantName?: string,
    phone?: string,
    isForAssistant: boolean = false,
    titularName?: string
) {
    const message = generateWhatsAppMessage(part, assistantName, isForAssistant, titularName);
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
    assistantName?: string,
    phone?: string,
    isForAssistant: boolean = false,
    titularName?: string
): Promise<void> {
    try {
        // 1. Gerar e baixar o S-89
        const pdfBytes = await generateS89(part, assistantName);
        const fileName = `S-89_${part.date}_${part.resolvedPublisherName || part.rawPublisherName}.pdf`;
        downloadS89(pdfBytes, fileName);

        // 2. Pequeno delay para garantir que o download iniciou
        await new Promise(resolve => setTimeout(resolve, 500));

        // 3. Abrir WhatsApp com mensagem pronta
        openWhatsApp(part, assistantName, phone, isForAssistant, titularName);
    } catch (error) {
        console.error('Erro ao enviar S-89 via WhatsApp:', error);
        throw error;
    }
}

// ============================================================================
// S-89 Digital Card (Clipboard)
// ============================================================================

/**
 * Cria uma imagem (Blob) de um cartão digital estilo S-89
 */
async function createS89CardBlob(part: WorkbookPart, assistantName?: string): Promise<Blob | null> {
    // 1. Preparar dados
    const studentName = part.resolvedPublisherName || part.rawPublisherName || 'Publicador';

    // Data
    let displayDate = part.date;
    const dateParts = part.date.split('-');
    if (dateParts.length === 3) {
        const baseDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
        // Lógica de pegar a próxima quinta-feira (ou dia da reunião)
        const dayOfWeek = baseDate.getDay();
        const daysToThursday = (4 - dayOfWeek + 7) % 7;
        const thursdayDate = new Date(baseDate);
        thursdayDate.setDate(thursdayDate.getDate() + daysToThursday);

        const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
            'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        const day = thursdayDate.getDate();
        const month = MESES[thursdayDate.getMonth()];
        const year = thursdayDate.getFullYear();
        displayDate = `${day} de ${month} de ${year}`;
    }

    const room = part.modalidade?.toLowerCase().includes('b') ? 'Sala B' : 'Sala Principal';

    // 2. Criar SVG String
    // Layout simples inspirado no S-89: Fundo branco, Header azul/cinza, Campos
    const svgWidth = 400;
    const svgHeight = 300;

    const svgString = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
        <!-- Background -->
        <rect width="100%" height="100%" fill="#ffffff"/>
        
        <!-- Header / Logo Area -->
        <rect x="0" y="0" width="100%" height="60" fill="#4B5563"/>
        <text x="20" y="38" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#ffffff">Designação - Nossa Vida Cristã</text>
        
        <!-- Border -->
        <rect x="0" y="0" width="100%" height="100%" fill="none" stroke="#E5E7EB" stroke-width="2"/>

        <!-- Content -->
        <g transform="translate(20, 90)">
            <!-- Nome -->
            <text x="0" y="0" font-family="Arial, sans-serif" font-size="12" fill="#6B7280">Nome:</text>
            <text x="0" y="20" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#111827">${studentName}</text>
            
            ${assistantName ? `
            <!-- Ajudante (Se houver) -->
            <text x="0" y="55" font-family="Arial, sans-serif" font-size="12" fill="#6B7280">Ajudante:</text>
            <text x="0" y="75" font-family="Arial, sans-serif" font-size="16" fill="#111827">${assistantName}</text>
            ` : ''}

            <!-- Data -->
            <text x="0" y="${assistantName ? 110 : 60}" font-family="Arial, sans-serif" font-size="12" fill="#6B7280">Data:</text>
            <text x="0" y="${assistantName ? 130 : 80}" font-family="Arial, sans-serif" font-size="16" fill="#111827">${displayDate}</text>

            <!-- Parte -->
            <text x="0" y="${assistantName ? 165 : 115}" font-family="Arial, sans-serif" font-size="12" fill="#6B7280">Parte/Tema:</text>
            <text x="0" y="${assistantName ? 185 : 135}" font-family="Arial, sans-serif" font-size="14" fill="#111827" width="360">
                ${(part.tituloParte || part.tipoParte).substring(0, 45)}${(part.tituloParte || part.tipoParte).length > 45 ? '...' : ''}
            </text>

            <!-- Sala -->
            <text x="250" y="${assistantName ? 130 : 80}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#4F46E5">${room}</text>
        </g>
        
        <!-- Footer Code -->
        <text x="380" y="290" font-family="Arial, sans-serif" font-size="10" fill="#9CA3AF" text-anchor="end">S-89-T</text>
    </svg>
    `;

    // 3. Converter SVG para Blob (PNG) via Canvas
    return new Promise((resolve, reject) => {
        const img = new Image();
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = svgWidth;
            canvas.height = svgHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Canvas context not supported'));
                return;
            }

            // Desenhar fundo branco explícito (clipboard pode ser transparente)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.drawImage(img, 0, 0);

            canvas.toBlob((blob) => {
                URL.revokeObjectURL(url);
                resolve(blob);
            }, 'image/png');
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Erro ao carregar imagem SVG'));
        };

        img.src = url;
    });
}

/**
 * Copia a imagem do cartão S-89 para a área de transferência
 */
export async function copyS89ToClipboard(part: WorkbookPart, assistantName?: string): Promise<boolean> {
    try {
        const blob = await createS89CardBlob(part, assistantName);
        if (!blob) return false;

        // Verifica suporte a ClipboardItem e png
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
