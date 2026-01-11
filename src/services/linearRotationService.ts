/**
 * Linear Rotation Service - RVM Designações v6.2
 * 
 * v6.2: Limpo - apenas validações e aliases deprecados.
 * 
 * FUNÇÕES MANTIDAS:
 * - validatePartsBeforeGeneration: Validação de partes
 * - getGrupo*: Aliases deprecados para groupService
 */

import type { Publisher } from '../types';
import { getGroupMembers } from './groupService';

// ===== Funções de Grupo (aliases para groupService) =====

/**
 * @deprecated Use getGroupMembers from groupService instead
 */
export function getGrupoPresidentes(publishers: Publisher[]): Publisher[] {
    return getGroupMembers(publishers, 'presidentes');
}

/**
 * @deprecated Use getGroupMembers from groupService instead
 */
export function getGrupoEnsino(publishers: Publisher[]): Publisher[] {
    return getGroupMembers(publishers, 'ensino');
}

/**
 * @deprecated Use getGroupMembers from groupService instead
 */
export function getGrupoEnsinoExpandido(publishers: Publisher[]): Publisher[] {
    return getGroupMembers(publishers, 'ensino_expandido');
}

/**
 * @deprecated Use getGroupMembers from groupService instead
 */
export function getGrupoEstudante(publishers: Publisher[]): Publisher[] {
    return getGroupMembers(publishers, 'estudante');
}

// ===== Validações =====

export interface ValidationWarning {
    type: 'MISSING_DURATION' | 'MISSING_TITULAR';
    partId: string;
    weekDisplay: string;
    partTitle: string;
    message: string;
}

/**
 * Valida partes antes de gerar designações.
 * Retorna avisos para partes de titular sem duração definida.
 */
export function validatePartsBeforeGeneration(
    parts: Array<{
        id: string;
        funcao: string;
        duracao?: number | string;
        weekDisplay: string;
        tituloParte: string;
        resolvedPublisherName?: string;
    }>
): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    parts.forEach(part => {
        // Aviso: Parte de Titular sem duração
        if (part.funcao === 'Titular') {
            const duracao = typeof part.duracao === 'string' ? parseInt(part.duracao) : part.duracao;
            if (!duracao || duracao <= 0) {
                warnings.push({
                    type: 'MISSING_DURATION',
                    partId: part.id,
                    weekDisplay: part.weekDisplay,
                    partTitle: part.tituloParte,
                    message: `⚠️ Parte "${part.tituloParte}" (${part.weekDisplay}) não tem duração definida`
                });
            }
        }
    });

    return warnings;
}
