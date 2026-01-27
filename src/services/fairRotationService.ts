/**
 * Fair Rotation Service - RVM Designações v9.0
 * 
 * Implementa rotação justa LINEAR por grupo com índices persistidos.
 * 
 * v9.0: Adiciona BLOQUEIO real por cooldown (não apenas penalização).
 *       Remove dependência do queueBalancerService (Fila IA).
 * v8.3: Consulta seleções manuais (Dropdown) para evitar duplicatas.
 * 
 * Grupos:
 * - presidentes: Anciãos (+ SM aprovados)
 * - ensino: A's + SM
 * - estudante: Todos elegíveis
 * - ajudante_m: Ajudantes masculinos (separado)
 * - ajudante_f: Ajudantes femininos (separado)
 * - oracao_final: Irmãos batizados
 */

import { api } from './api';
import type { Publisher, HistoryRecord } from '../types';
import { getGroupMembers as getGroupMembersFromService, type PublisherGroup } from './groupService';
import { getRecentManualSelections } from './manualSelectionTracker';
import { isBlocked } from './cooldownService';
import { loadCompletedParticipations } from './historyAdapter';

// ===== Tipos =====

// RotationGroup é subset de PublisherGroup (exclui ensino_expandido que não tem rotação)
export type RotationGroup =
    | 'presidentes'
    | 'ensino'
    | 'estudante'
    | 'ajudante_m'
    | 'ajudante_f'
    | 'oracao_final';

export interface RotationIndex {
    group: RotationGroup;
    currentIndex: number;
    updatedAt: string;
}

export interface RotationResult {
    publisher: Publisher | null;
    newIndex: number;
    skipped: string[];
}

// ===== Funções de Persistência =====

const ROTATION_SETTING_KEY = 'rotation_indices_v9';

/**
 * Carrega todos os índices de rotação do Supabase
 */
async function loadRotationIndices(): Promise<Record<RotationGroup, number>> {
    const defaultIndices: Record<RotationGroup, number> = {
        presidentes: 0,
        ensino: 0,
        estudante: 0,
        ajudante_m: 0,
        ajudante_f: 0,
        oracao_final: 0
    };

    try {
        const saved = await api.getSetting<Record<RotationGroup, number>>(ROTATION_SETTING_KEY, defaultIndices);
        return { ...defaultIndices, ...saved };
    } catch (e) {
        console.warn('[FairRotation] Erro ao carregar índices, usando defaults:', e);
        return defaultIndices;
    }
}

/**
 * Salva os índices de rotação no Supabase
 */
async function saveRotationIndices(indices: Record<RotationGroup, number>): Promise<void> {
    try {
        await api.setSetting(ROTATION_SETTING_KEY, indices);
    } catch (e) {
        console.error('[FairRotation] Erro ao salvar índices:', e);
    }
}

// ===== Funções de Grupo =====

/**
 * Obtém os membros de um grupo ordenados alfabeticamente.
 * v7.1: Usa groupService como fonte autoritativa
 */
function getGroupMembers(publishers: Publisher[], group: RotationGroup): Publisher[] {
    // Mapear RotationGroup para PublisherGroup (são iguais neste caso)
    const members = getGroupMembersFromService(publishers, group as PublisherGroup);

    // Ordenar alfabeticamente para consistência entre reloads
    return members.sort((a, b) => a.name.localeCompare(b.name));
}

// ===== Funções de Rotação =====

/**
 * v9.0: Obtém o próximo publicador na rotação para um grupo.
 * 
 * MUDANÇAS v9.0:
 * - Verifica bloqueio por cooldown (isBlocked) e PULA publicadores bloqueados
 * - Remove lógica de Fila Inteligente (queueBalancer)
 * - Mantém consulta de seleções manuais para evitar duplicatas
 * 
 * @param publishers Lista completa de publicadores
 * @param group Grupo de rotação
 * @param excludeNames Nomes a excluir (já designados na semana)
 * @param additionalFilter Filtro adicional (ex: disponibilidade)
 * @param history Histórico de participações (para verificar bloqueio)
 * @returns O publicador selecionado e o novo índice
 */
export async function getNextInRotation(
    publishers: Publisher[],
    group: RotationGroup,
    excludeNames: Set<string>,
    additionalFilter?: (p: Publisher) => boolean,
    history?: HistoryRecord[]
): Promise<RotationResult> {
    const indices = await loadRotationIndices();
    const members = getGroupMembers(publishers, group);

    if (members.length === 0) {
        return { publisher: null, newIndex: 0, skipped: [] };
    }

    // v9.0: Carregar histórico para verificar bloqueio (se não fornecido)
    let historyRecords = history;
    if (!historyRecords) {
        try {
            historyRecords = await loadCompletedParticipations();
        } catch (e) {
            console.warn('[FairRotation] Erro ao carregar histórico, bloqueio desabilitado:', e);
            historyRecords = [];
        }
    }

    // v8.3: Carregar seleções manuais recentes e adicionar às exclusões
    const manualSelections = await getRecentManualSelections(30);
    for (const ms of manualSelections) {
        excludeNames.add(ms.publisherName);
    }
    if (manualSelections.length > 0) {
        console.log(`[FairRotation] v9.0: ${manualSelections.length} seleções manuais excluídas`);
    }

    let currentIndex = indices[group] % members.length;
    const skipped: string[] = [];
    const today = new Date();

    // Tentar encontrar alguém elegível, fazendo no máximo uma volta completa
    let attempts = 0;
    while (attempts < members.length) {
        const candidate = members[currentIndex];

        // Verificar exclusões
        if (excludeNames.has(candidate.name)) {
            skipped.push(candidate.name + ' (excluído)');
            currentIndex = (currentIndex + 1) % members.length;
            attempts++;
            continue;
        }

        // v9.0: Verificar bloqueio por cooldown
        if (isBlocked(candidate.name, historyRecords, today)) {
            skipped.push(candidate.name + ' (bloqueado)');
            currentIndex = (currentIndex + 1) % members.length;
            attempts++;
            continue;
        }

        // Verificar filtro adicional (ex: disponibilidade)
        if (additionalFilter && !additionalFilter(candidate)) {
            skipped.push(candidate.name + ' (filtro)');
            currentIndex = (currentIndex + 1) % members.length;
            attempts++;
            continue;
        }

        // Encontrou! Avançar índice para próxima vez
        const newIndex = (currentIndex + 1) % members.length;
        indices[group] = newIndex;
        await saveRotationIndices(indices);

        console.log(`[FairRotation] ${group}: ${candidate.name} (idx ${currentIndex}→${newIndex})`);
        return { publisher: candidate, newIndex, skipped };
    }

    console.log(`[FairRotation] ${group}: Nenhum candidato disponível (pulados: ${skipped.join(', ')})`);
    return { publisher: null, newIndex: indices[group], skipped };
}

/**
 * Obtém múltiplos publicadores em sequência para o mesmo grupo.
 * Útil para preencher várias partes do mesmo tipo de uma vez.
 */
export async function getMultipleInRotation(
    publishers: Publisher[],
    group: RotationGroup,
    count: number,
    baseExcludeNames: Set<string>,
    additionalFilter?: (p: Publisher) => boolean
): Promise<Publisher[]> {
    const result: Publisher[] = [];
    const excludeNames = new Set(baseExcludeNames);

    // Carregar histórico uma vez para todas as chamadas
    let history: HistoryRecord[] = [];
    try {
        history = await loadCompletedParticipations();
    } catch (e) {
        console.warn('[FairRotation] Erro ao carregar histórico:', e);
    }

    for (let i = 0; i < count; i++) {
        const { publisher } = await getNextInRotation(
            publishers,
            group,
            excludeNames,
            additionalFilter,
            history
        );

        if (publisher) {
            result.push(publisher);
            excludeNames.add(publisher.name);
        } else {
            break; // Sem mais candidatos
        }
    }

    return result;
}

/**
 * Reseta todos os índices de rotação para 0
 */
export async function resetAllIndices(): Promise<void> {
    const indices: Record<RotationGroup, number> = {
        presidentes: 0,
        ensino: 0,
        estudante: 0,
        ajudante_m: 0,
        ajudante_f: 0,
        oracao_final: 0
    };
    await saveRotationIndices(indices);
    console.log('[FairRotation] Todos os índices resetados para 0');
}

/**
 * Obtém os índices atuais (para debug/visualização)
 */
export async function getCurrentIndices(): Promise<Record<RotationGroup, number>> {
    return await loadRotationIndices();
}
