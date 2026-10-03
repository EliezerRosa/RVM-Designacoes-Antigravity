import JSZip from 'jszip';
import { generateS140ImageBase64 } from './s140GeneratorUnified';
import type { WorkbookPart, Publisher } from '../types';
import { getWeekMondayId } from './eligibilityService';
import { isWeekPublished } from './weekPublishService';
import { api } from './api';

const S89_MEETING_DAY_SETTING_KEY = 's89_meeting_day_by_week';
const DEFAULT_MEETING_DAY_OF_WEEK = 4; // Quinta-feira

async function getMeetingDayOfWeek(weekId: string): Promise<number> {
    try {
        const map = await api.getSetting<Record<string, number>>(S89_MEETING_DAY_SETTING_KEY, {});
        const val = map[weekId];
        if (typeof val === 'number' && val >= 0 && val <= 6) return val;
        return DEFAULT_MEETING_DAY_OF_WEEK;
    } catch {
        return DEFAULT_MEETING_DAY_OF_WEEK;
    }
}

async function getTargetWeeks(parts: WorkbookPart[]): Promise<string[]> {
    const todayStr = new Date().toISOString().slice(0, 10);
    const currentMonday = getWeekMondayId(todayStr);

    const allWeekIds = [...new Set(parts.map(p => p.weekId))].sort();
    let candidateWeeks = allWeekIds.filter(wId => wId >= currentMonday);

    if (candidateWeeks.length > 0) {
        const currentWeekId = candidateWeeks[0];
        if (currentWeekId === currentMonday) {
            // Verifica se a reunião desta semana já passou com base no dia definido no banco
            const meetingDayOfWeek = await getMeetingDayOfWeek(currentWeekId);
            const [y, m, d] = currentWeekId.split('-').map(Number);
            const weekDate = new Date(y, m - 1, d);
            
            // Monday is 1, so days to add is (day + 6) % 7
            const daysToAdd = (meetingDayOfWeek + 6) % 7;
            const meetingDate = new Date(weekDate);
            meetingDate.setDate(weekDate.getDate() + daysToAdd);
            
            const meetingDateStr = meetingDate.toISOString().slice(0, 10);
            
            // Se o dia de hoje for MAIOR que o dia da reunião, ela já passou.
            if (todayStr > meetingDateStr) {
                // Remove a semana atual, avançando para a próxima disponível
                candidateWeeks = candidateWeeks.slice(1);
            }
        }
    }

    // Filtrar apenas semanas publicadas
    const publishedChecks = await Promise.all(candidateWeeks.map(wId => isWeekPublished(wId)));
    const targetWeeks = candidateWeeks.filter((_, idx) => publishedChecks[idx]);
    
    // Limitar a no máximo 4 semanas (Semana de partida + 3)
    return targetWeeks.slice(0, 4);
}

export async function exportGlideSyncZip(parts: WorkbookPart[], publishers: Publisher[]) {
    const targetWeeks = await getTargetWeeks(parts);

    if (targetWeeks.length === 0) {
        throw new Error('Não há semanas futuras publicadas suficientes para exportar.');
    }

    const zip = new JSZip();

    for (let i = 0; i < targetWeeks.length; i++) {
        const weekId = targetWeeks[i];
        const weekParts = parts.filter(p => p.weekId === weekId);
        
        if (weekParts.length > 0) {
            const base64DataUrl = await generateS140ImageBase64(weekParts, publishers);
            
            if (base64DataUrl) {
                const base64Data = base64DataUrl.split(',')[1];
                const filename = `week${i + 1}_${weekId}.png`;
                zip.file(filename, base64Data, { base64: true });
            }
        }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(zipBlob);
    
    const todayStr = new Date().toISOString().slice(0, 10);
    const currentMonday = getWeekMondayId(todayStr);
    link.download = `Glide_S140_Export_${currentMonday}.zip`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export async function exportGlideInvisible(parts: WorkbookPart[], publishers: Publisher[]): Promise<boolean> {
    const targetWeeks = await getTargetWeeks(parts);

    if (targetWeeks.length === 0) throw new Error('Nenhuma semana publicada encontrada.');

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
        window.postMessage({ type: 'RVM_SYNC_GLIDE', payload: imagesPayload }, '*');

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
        
        setTimeout(() => {
            window.removeEventListener('message', listener);
            reject(new Error('Timeout aguardando a Extensão do Chrome RVM Sync (esperou 120s). Ela está instalada e o Glide está aberto?'));
        }, 120000);
    });
}
