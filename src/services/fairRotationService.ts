/**
 * Fair Rotation Service - RVM Designações v7.1
 * 
 * Implementa rotação justa LINEAR por grupo com índices persistidos.
 * 
 * v7.1: Usa groupService como fonte de verdade para definição de grupos.
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
import type { Publisher } from '../types';
import { getGroupMembers as getGroupMembersFromService, type PublisherGroup } from './groupService';
import { loadRotationQueues } from './queueBalancerService';

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

// ===== Funções de Persistência =====

const ROTATION_SETTING_KEY = 'rotation_indices_v7';

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
        console.warn('[FairRotation] Erro ao carregar índices:', e);
        return defaultIndices;
    }
}

/**
 * Salva todos os índices de rotação no Supabase
 */
async function saveRotationIndices(indices: Record<RotationGroup, number>): Promise<void> {
    try {
        await api.setSetting(ROTATION_SETTING_KEY, indices);
    } catch (e) {
        console.error('[FairRotation] Erro ao salvar índices:', e);
    }
}

// ===== Funções de Grupo (delegam para groupService) =====

/**
 * Obtém lista de publicadores elegíveis para um grupo.
 * DELEGA para groupService como fonte de verdade.
 * 
 * @deprecated Preferir importar diretamente de groupService
 */
export function getGroupMembers(publishers: Publisher[], group: RotationGroup): Publisher[] {
    return getGroupMembersFromService(publishers, group as PublisherGroup);
}

// ===== Função Principal de Rotação =====

export interface RotationResult {
    publisher: Publisher | null;
    newIndex: number;
    skipped: string[]; // Nomes dos que foram pulados
}

/**
 * Obtém o próximo publicador na rotação para um grupo.
 * 
 * @param publishers Lista completa de publicadores
 * @param group Grupo de rotação
 * @param excludeNames Nomes a excluir (já designados na semana)
 * @param additionalFilter Filtro adicional (ex: disponibilidade)
 * @returns O publicador selecionado e o novo índice
 */
export async function getNextInRotation(
    publishers: Publisher[],
    group: RotationGroup,
    excludeNames: Set<string>,
    additionalFilter?: (p: Publisher) => boolean
): Promise<RotationResult> {
    const indices = await loadRotationIndices();
    let members = getGroupMembers(publishers, group);

    // v8.3: Carregar Fila Inteligente (se houver)
    const queues = await loadRotationQueues();
    const queueIds = queues[group];

    if (queueIds && queueIds.length > 0) {
        // Reordenar membros baseado na fila salva
        // Membros NA fila vêm primeiro (na ordem da fila)
        // Membros FORA da fila vêm depois (alfabético)
        const idToIndex = new Map(queueIds.map((id, index) => [id, index]));

        members.sort((a, b) => {
            const indexA = idToIndex.has(a.id) ? idToIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
            const indexB = idToIndex.has(b.id) ? idToIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;

            if (indexA !== indexB) return indexA - indexB;
            return a.name.localeCompare(b.name); // Desempate alfabético pros novos
        });

        console.log(`[FairRotation] Usando Fila Inteligente para ${group} (${queueIds.length} IDs conhecidos)`);
    }

    if (members.length === 0) {
        return { publisher: null, newIndex: 0, skipped: [] };
    }

    let currentIndex = indices[group] % members.length;
    const startIndex = currentIndex;
    const skipped: string[] = [];

    // Tentar encontrar alguém elegível, fazendo no máximo uma volta completa
    let attempts = 0;
    while (attempts < members.length) {
        const candidate = members[currentIndex];

        // Verificar exclusões
        if (!excludeNames.has(candidate.name)) {
            // Verificar filtro adicional (ex: disponibilidade)
            if (!additionalFilter || additionalFilter(candidate)) {
                // Encontrou! Avançar índice para próxima vez
                const newIndex = (currentIndex + 1) % members.length;
                indices[group] = newIndex;
                await saveRotationIndices(indices);

                console.log(`[FairRotation] ${group}: ${candidate.name} (idx ${currentIndex}→${newIndex})`);
                return { publisher: candidate, newIndex, skipped };
            }
        }

        skipped.push(candidate.name);
        currentIndex = (currentIndex + 1) % members.length;
        attempts++;

        // Se voltou ao início, não há candidatos
        if (currentIndex === startIndex && attempts > 0) {
            break;
        }
    }

    console.log(`[FairRotation] ${group}: Nenhum candidato disponível (pulados: ${skipped.join(', ')})`);
    return { publisher: null, newIndex: indices[group], skipped };
}

/**
 * Obtém múltiplos publicadores em sequência para o mesmo grupo.
 * Útil para preencher várias partes do mesmo tipo de uma vez.
 * 
 * @param publishers Lista completa de publicadores
 * @param group Grupo de rotação
 * @param count Quantas partes preencher
 * @param baseExcludeNames Nomes a excluir inicialmente
 * @param additionalFilter Filtro adicional
 * @returns Lista de publicadores na ordem de rotação
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

    for (let i = 0; i < count; i++) {
        const { publisher } = await getNextInRotation(
            publishers,
            group,
            excludeNames,
            additionalFilter
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
