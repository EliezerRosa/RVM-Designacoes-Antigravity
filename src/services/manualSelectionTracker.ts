/**
 * Manual Selection Tracker - RVM Designações v8.3
 * 
 * Rastreia seleções manuais feitas via Dropdown para evitar duplicatas
 * na próxima geração automática.
 * 
 * Quando o usuário seleciona um publicador manualmente, esta seleção é
 * registrada e consultada pelo fairRotationService antes de avançar o índice.
 * 
 * Isso resolve o problema de:
 * - Usuário seleciona João via Dropdown
 * - Motor gera e seleciona João novamente (porque índice não avançou)
 */

import { api } from './api';

// ===== Tipos =====

export interface ManualSelection {
    publisherName: string;
    tipoParte: string;
    weekId: string;
    date: string;
    timestamp: string;
}

// ===== Constantes =====

const SETTING_KEY = 'manual_selections_v1';
const MAX_SELECTIONS_STORED = 200; // Limite para evitar crescimento infinito
const DAYS_TO_KEEP = 60; // Manter seleções dos últimos 60 dias

// ===== Funções Públicas =====

/**
 * Registra uma seleção manual feita via Dropdown.
 */
export async function markManualSelection(
    publisherName: string,
    tipoParte: string,
    weekId: string,
    date: string
): Promise<void> {
    try {
        const selections = await loadSelections();

        // Adicionar nova seleção
        selections.push({
            publisherName,
            tipoParte,
            weekId,
            date,
            timestamp: new Date().toISOString()
        });

        // Limpar antigas e salvar
        const cleaned = cleanOldSelections(selections);
        await saveSelections(cleaned);

        console.log(`[ManualTracker] Registrada seleção manual: ${publisherName} → ${tipoParte} (${weekId})`);
    } catch (e) {
        console.warn('[ManualTracker] Erro ao registrar seleção:', e);
    }
}

/**
 * Retorna seleções manuais recentes (dentro de N dias).
 * O fairRotationService usa isso para excluir publicadores já selecionados manualmente.
 */
export async function getRecentManualSelections(days: number = 30): Promise<ManualSelection[]> {
    try {
        const selections = await loadSelections();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        return selections.filter(s => new Date(s.timestamp) >= cutoff);
    } catch (e) {
        console.warn('[ManualTracker] Erro ao carregar seleções:', e);
        return [];
    }
}

/**
 * Retorna seleções manuais de uma semana específica.
 * Usado para verificar se um publicador já foi selecionado manualmente para aquela semana.
 */
export async function getSelectionsForWeek(weekId: string): Promise<ManualSelection[]> {
    try {
        const selections = await loadSelections();
        return selections.filter(s => s.weekId === weekId);
    } catch (e) {
        console.warn('[ManualTracker] Erro ao carregar seleções da semana:', e);
        return [];
    }
}

/**
 * Remove seleções antigas para manter o armazenamento enxuto.
 */
export async function clearOldSelections(): Promise<number> {
    try {
        const selections = await loadSelections();
        const cleaned = cleanOldSelections(selections);
        const removed = selections.length - cleaned.length;

        if (removed > 0) {
            await saveSelections(cleaned);
            console.log(`[ManualTracker] Removidas ${removed} seleções antigas`);
        }

        return removed;
    } catch (e) {
        console.warn('[ManualTracker] Erro ao limpar seleções:', e);
        return 0;
    }
}

/**
 * Limpa todas as seleções (reset completo).
 */
export async function clearAllSelections(): Promise<void> {
    try {
        await api.setSetting(SETTING_KEY, []);
        console.log('[ManualTracker] Todas as seleções limpas');
    } catch (e) {
        console.warn('[ManualTracker] Erro ao limpar todas as seleções:', e);
    }
}

// ===== Funções Internas =====

async function loadSelections(): Promise<ManualSelection[]> {
    return await api.getSetting<ManualSelection[]>(SETTING_KEY, []);
}

async function saveSelections(selections: ManualSelection[]): Promise<void> {
    // Limitar tamanho máximo
    const limited = selections.slice(-MAX_SELECTIONS_STORED);
    await api.setSetting(SETTING_KEY, limited);
}

function cleanOldSelections(selections: ManualSelection[]): ManualSelection[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DAYS_TO_KEEP);

    return selections.filter(s => new Date(s.timestamp) >= cutoff);
}
