/**
 * Queue Balancer Service - RVM Designações v8.3
 * 
 * Responsável por "curar" a fila de rotação, reordenando os publicadores
 * com base no Score de Justiça (o mesmo usado no Dropdown Manual).
 * 
 * Objetivo:
 * Transformar a "Fila Indiana Cega" do Robô em uma "Fila Inteligente".
 */

import type { Publisher } from '../types';
import { calculateRotationPriority } from './cooldownService';
import { resetAllIndices, type RotationGroup } from './fairRotationService';
import { loadCompletedParticipations } from './historyAdapter';
import { getGroupMembers } from './groupService';
import { api } from './api';

const ROTATION_QUEUES_KEY = 'rotation_queues_v8';

interface RotationQueueMap {
    [group: string]: string[]; // Array de IDs de publicadores
}

/**
 * Salva as filas reordenadas no Supabase
 */
export async function saveRotationQueues(queues: RotationQueueMap): Promise<void> {
    await api.setSetting(ROTATION_QUEUES_KEY, queues);
}

/**
 * Carrega as filas salvas
 */
export async function loadRotationQueues(): Promise<RotationQueueMap> {
    try {
        return await api.getSetting<RotationQueueMap>(ROTATION_QUEUES_KEY, {});
    } catch (e) {
        console.warn('[QueueBalancer] Erro ao carregar filas:', e);
        return {};
    }
}

/**
 * Rebalancea TODAS as filas de rotação com base no Score de Justiça.
 * 
 * Passo a passo:
 * 1. Carrega histórico completo (12 meses).
 * 2. Para cada grupo (Presidentes, Ensino, etc):
 *    a. Calcula Score de cada membro.
 *    b. Ordena: Maior Score (mais tempo sem fazer) -> Menor Score.
 *    c. Gera lista de IDs.
 * 3. Salva as novas filas.
 * 4. Reseta os índices do Robô para 0 (para começar do topo da nova fila).
 */
export async function rebalanceAllQueues(publishers: Publisher[]): Promise<void> {
    console.log('[QueueBalancer] Iniciando rebalanceamento inteligente...');

    // 1. Carregar histórico (Fonte da Verdade)
    const history = await loadCompletedParticipations();
    const today = new Date();

    const groups: RotationGroup[] = [
        'presidentes',
        'ensino',
        'estudante',
        'ajudante_m',
        'ajudante_f',
        'oracao_final'
    ];

    const newQueues: RotationQueueMap = {};

    // 2. Processar cada grupo
    for (const group of groups) {
        const members = getGroupMembers(publishers, group);

        if (members.length === 0) {
            newQueues[group] = [];
            continue;
        }

        // Calcular Scores e Ordenar
        // Score MAIOR = Mais prioridade (mais tempo sem fazer)
        const rankedMembers = members.map(p => {
            const score = calculateRotationPriority(
                p.name,
                history,
                '', // Tipo genérico
                'Titular',
                today
            );
            return { id: p.id, name: p.name, score };
        }).sort((a, b) => b.score - a.score); // Decrescente (Melhores primeiro)

        // Extrair IDs ordenados
        newQueues[group] = rankedMembers.map(m => m.id);

        console.log(`[QueueBalancer] Grupo ${group}: Reordenado (${rankedMembers.length} membros). Topo: ${rankedMembers[0].name}`);
    }

    // 3. Salvar filas
    await saveRotationQueues(newQueues);

    // 4. Resetar índices do Robô
    // Como mudamos a fila, o ponteiro antigo não faz mais sentido.
    // Devemos começar do #1 da nova fila (que é o mais prioritário).
    await resetAllIndices();

    console.log('[QueueBalancer] Rebalanceamento concluído com sucesso!');
}
