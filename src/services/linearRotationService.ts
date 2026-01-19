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

// ===== Tipos de Partes sem Duração Obrigatória =====

/**
 * Lista de tipos de partes que NÃO precisam de duração definida.
 * Esses tipos têm tempo fixo ou estão incluídos no tempo de outras partes.
 */
export const PARTS_WITHOUT_DURATION: string[] = [
    // Cânticos (tempo fixo ~4 min cada)
    'Cântico Inicial',
    'Cântico do Meio',
    'Cântico Final',
    'Cantico Inicial',
    'Cantico do Meio',
    'Cantico Final',

    // Orações (tempo curto, incluídas no Presidente)
    'Oração Inicial',
    'Oração Final',
    'Oracao Inicial',
    'Oracao Final',

    // Comentários do Presidente (tempo curto)
    'Comentários Iniciais',
    'Comentários Finais',
    'Comentarios Iniciais',
    'Comentarios Finais',

    // Elogios e Conselhos (~1 min por estudante)
    'Elogios e Conselhos',

    // Presidente da Reunião (gerencia o tempo, não tem duração própria)
    'Presidente',
    'Presidente da Reunião',
];

/**
 * Verifica se um tipo de parte NÃO precisa de duração definida.
 * Usa correspondência parcial (contém) para lidar com variações.
 */
export function isPartWithoutDuration(tituloParte: string): boolean {
    const tituloLower = tituloParte.toLowerCase();
    return PARTS_WITHOUT_DURATION.some(type =>
        tituloLower.includes(type.toLowerCase())
    );
}

/**
 * Valida partes antes de gerar designações.
 * Retorna avisos para partes de titular sem duração definida,
 * EXCETO para tipos que não precisam de duração (cânticos, orações, etc.)
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
        // Aviso: Parte de Titular sem duração (exceto tipos que não precisam)
        if (part.funcao === 'Titular') {
            // Ignorar partes que não precisam de duração
            if (isPartWithoutDuration(part.tituloParte)) {
                return; // Skip esta parte
            }

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
