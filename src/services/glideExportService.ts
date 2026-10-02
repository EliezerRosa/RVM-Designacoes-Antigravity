import JSZip from 'jszip';
import { generateS140ImageBase64 } from './s140GeneratorUnified';
import type { WorkbookPart, Publisher } from '../types';
import { getWeekMondayId } from './eligibilityService';

export async function exportGlideSyncZip(parts: WorkbookPart[], publishers: Publisher[]) {
    // 1. Identificar a semana corrente (ou a próxima disponível se estiver no fim de semana)
    const todayStr = new Date().toISOString().slice(0, 10);
    const currentMonday = getWeekMondayId(todayStr);

    // Pegar as semanas únicas
    const allWeekIds = [...new Set(parts.map(p => p.weekId))].sort();
    
    // Filtrar da semana atual em diante
    let targetWeeks = allWeekIds.filter(wId => wId >= currentMonday);
    
    // Se não tiver semana corrente exata, pega as próximas 4
    if (targetWeeks.length === 0) {
        throw new Error('Não há semanas futuras suficientes para exportar.');
    }

    // Limitar a 4 semanas (corrente + 3)
    targetWeeks = targetWeeks.slice(0, 4);

    if (targetWeeks.length === 0) {
        throw new Error('Nenhuma semana encontrada para a exportação do Glide.');
    }

    const zip = new JSZip();

    for (let i = 0; i < targetWeeks.length; i++) {
        const weekId = targetWeeks[i];
        const weekParts = parts.filter(p => p.weekId === weekId);
        
        if (weekParts.length > 0) {
            // Gera a imagem em base64 (Formato PNG por padrão do html2canvas)
            const base64DataUrl = await generateS140ImageBase64(weekParts, publishers);
            
            if (base64DataUrl) {
                // Remover prefixo "data:image/png;base64,"
                const base64Data = base64DataUrl.split(',')[1];
                
                // Nomear como week1.png, week2.png, etc para o robô achar fácil
                const filename = `week${i + 1}_${weekId}.png`;
                zip.file(filename, base64Data, { base64: true });
            }
        }
    }

    // Gerar o ZIP e fazer download
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(zipBlob);
    link.download = `Glide_S140_Export_${currentMonday}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export async function exportGlideInvisible(parts: WorkbookPart[], publishers: Publisher[]): Promise<boolean> {
    const todayStr = new Date().toISOString().slice(0, 10);
    const currentMonday = getWeekMondayId(todayStr);
    const allWeekIds = [...new Set(parts.map(p => p.weekId))].sort();
    let targetWeeks = allWeekIds.filter(wId => wId >= currentMonday).slice(0, 4);

    if (targetWeeks.length === 0) throw new Error('Nenhuma semana futura encontrada.');

    const imagesPayload = [];

    for (let i = 0; i < targetWeeks.length; i++) {
        const weekId = targetWeeks[i];
        const weekParts = parts.filter(p => p.weekId === weekId);
        
        if (weekParts.length > 0) {
            const base64DataUrl = await generateS140ImageBase64(weekParts, publishers);
            if (base64DataUrl) {
                imagesPayload.push({
                    filename: `week${i + 1}_${weekId}.png`,
                    base64: base64DataUrl
                });
            }
        }
    }

    return new Promise((resolve, reject) => {
        // Envia mensagem pro Content Script da Extensão
        window.postMessage({ type: 'RVM_SYNC_GLIDE', payload: imagesPayload }, '*');

        // Escuta a resposta da extensão
        const listener = (event: MessageEvent) => {
            if (event.source !== window) return;
            if (event.data.type === 'RVM_SYNC_GLIDE_RESPONSE') {
                window.removeEventListener('message', listener);
                if (event.data.response?.success) {
                    resolve(true);
                } else {
                    reject(new Error(event.data.response?.error || 'Erro na extensão.'));
                }
            }
        };
        
        window.addEventListener('message', listener);
        
        // Timeout de segurança (60s)
        setTimeout(() => {
            window.removeEventListener('message', listener);
            reject(new Error('Timeout aguardando a Extensão do Chrome RVM Sync. Ela está instalada?'));
        }, 60000);
    });
}

