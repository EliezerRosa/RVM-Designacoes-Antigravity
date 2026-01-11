/**
 * Group Service - RVM Designações
 * 
 * CENTRAL: Definições de grupos de publicadores.
 * Substitui duplicações em fairRotationService e linearRotationService.
 * 
 * Grupos disponíveis:
 * - presidentes: Anciãos (+ SM aprovados)
 * - ensino: Anciãos + SMs
 * - ensino_expandido: Anciãos + SMs + Irmãos batizados (para Leitor EBC)
 * - estudante: Todos elegíveis (isServing)
 * - ajudante_m: Irmãos elegíveis para ajudante
 * - ajudante_f: Irmãs elegíveis para ajudante
 * - oracao_final: Irmãos batizados com canPray
 */

import type { Publisher } from '../types';

// ============================================================================
// TIPOS
// ============================================================================

export type PublisherGroup =
    | 'presidentes'
    | 'ensino'
    | 'ensino_expandido'
    | 'estudante'
    | 'ajudante_m'
    | 'ajudante_f'
    | 'oracao_final';

// ============================================================================
// FUNÇÕES DE GRUPO
// ============================================================================

/**
 * Obtém lista de publicadores elegíveis para um grupo.
 * Esta é a ÚNICA fonte de verdade para definição de grupos.
 * 
 * @param publishers Lista completa de publicadores
 * @param group Tipo de grupo
 * @returns Lista de publicadores do grupo, ordenados por ID (ordem de cadastro)
 */
export function getGroupMembers(publishers: Publisher[], group: PublisherGroup): Publisher[] {
    let members: Publisher[];

    switch (group) {
        case 'presidentes':
            // Anciãos + Servos Ministeriais aprovados para presidir
            members = publishers.filter(p =>
                p.isServing && (
                    p.condition === 'Ancião' ||
                    p.condition === 'Anciao' ||
                    (p.condition === 'Servo Ministerial' && p.privileges?.canPreside)
                )
            );
            break;

        case 'ensino':
            // Anciãos + Servos Ministeriais (Tesouros, Joias, Dirigente EBC)
            members = publishers.filter(p =>
                p.isServing && (
                    p.condition === 'Ancião' ||
                    p.condition === 'Anciao' ||
                    p.condition === 'Servo Ministerial'
                )
            );
            break;

        case 'ensino_expandido':
            // Anciãos + SMs + Irmãos batizados elegíveis (para Leitor EBC)
            members = publishers.filter(p =>
                p.isServing && (
                    p.condition === 'Ancião' ||
                    p.condition === 'Anciao' ||
                    p.condition === 'Servo Ministerial' ||
                    (p.gender === 'brother' && p.isBaptized)
                )
            );
            break;

        case 'estudante':
            // Todos elegíveis (batizados + não-batizados em serviço)
            members = publishers.filter(p => p.isServing);
            break;

        case 'ajudante_m':
            // Irmãos elegíveis para ajudante (exceto helperOnly)
            members = publishers.filter(p =>
                p.isServing &&
                p.gender === 'brother' &&
                !p.isHelperOnly
            );
            break;

        case 'ajudante_f':
            // Irmãs elegíveis para ajudante
            members = publishers.filter(p =>
                p.isServing &&
                p.gender === 'sister'
            );
            break;

        case 'oracao_final':
            // Irmãos batizados com privilégio de orar
            members = publishers.filter(p =>
                p.isServing &&
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

/**
 * Verifica se um publicador pertence a um grupo específico.
 */
export function isInGroup(publisher: Publisher, group: PublisherGroup): boolean {
    switch (group) {
        case 'presidentes':
            return publisher.isServing && (
                publisher.condition === 'Ancião' ||
                publisher.condition === 'Anciao' ||
                (publisher.condition === 'Servo Ministerial' && publisher.privileges?.canPreside === true)
            );

        case 'ensino':
            return publisher.isServing && (
                publisher.condition === 'Ancião' ||
                publisher.condition === 'Anciao' ||
                publisher.condition === 'Servo Ministerial'
            );

        case 'ensino_expandido':
            return publisher.isServing && (
                publisher.condition === 'Ancião' ||
                publisher.condition === 'Anciao' ||
                publisher.condition === 'Servo Ministerial' ||
                (publisher.gender === 'brother' && publisher.isBaptized)
            );

        case 'estudante':
            return publisher.isServing;

        case 'ajudante_m':
            return publisher.isServing && publisher.gender === 'brother' && !publisher.isHelperOnly;

        case 'ajudante_f':
            return publisher.isServing && publisher.gender === 'sister';

        case 'oracao_final':
            return publisher.isServing &&
                publisher.isBaptized &&
                publisher.gender === 'brother' &&
                publisher.privileges?.canPray === true;

        default:
            return false;
    }
}

/**
 * Retorna estatísticas de membros por grupo.
 */
export function getGroupStats(publishers: Publisher[]): Record<PublisherGroup, number> {
    const groups: PublisherGroup[] = [
        'presidentes', 'ensino', 'ensino_expandido',
        'estudante', 'ajudante_m', 'ajudante_f', 'oracao_final'
    ];

    const stats: Record<string, number> = {};
    for (const group of groups) {
        stats[group] = getGroupMembers(publishers, group).length;
    }

    return stats as Record<PublisherGroup, number>;
}
