/**
 * Fair Rotation Service - RVM Designações v7.0
 * 
 * Implementa rotação justa LINEAR por grupo com índices persistidos.
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

// ===== Tipos =====

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

// ===== Funções de Grupo =====

/**
 * Obtém lista de publicadores elegíveis para um grupo, ordenados por ID (ordem de cadastro)
 */
export function getGroupMembers(publishers: Publisher[], group: RotationGroup): Publisher[] {
    let members: Publisher[];

    switch (group) {
        case 'presidentes':
            members = publishers.filter(p =>
                (p.condition === 'Ancião' || p.condition === 'Anciao') ||
                (p.condition === 'Servo Ministerial' && p.privileges?.canPreside)
            );
            break;

        case 'ensino':
            members = publishers.filter(p =>
                p.condition === 'Ancião' ||
                p.condition === 'Anciao' ||
                p.condition === 'Servo Ministerial'
            );
            break;

        case 'estudante':
            members = publishers.filter(p => p.isServing);
            break;

        case 'ajudante_m':
            members = publishers.filter(p =>
                p.isServing &&
                p.gender === 'brother' &&
                !p.isHelperOnly // Se isHelperOnly, já está no ajudante
            );
            break;

        case 'ajudante_f':
            members = publishers.filter(p =>
                p.isServing &&
                p.gender === 'sister'
            );
            break;

        case 'oracao_final':
            members = publishers.filter(p =>
                p.isBaptized &&
                p.gender === 'brother' &&
                p.privileges?.canPray
            );
            break;

        default:
            members = [];
    }

    // Ordenar por ID (ordem de cadastro) - IDs menores primeiro
    return members.sort((a, b) => {
        const idA = parseInt(a.id) || 0;
        const idB = parseInt(b.id) || 0;
        return idA - idB;
    });
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
    const members = getGroupMembers(publishers, group);

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
