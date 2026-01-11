/**
 * Sections - RVM Designações v8.0
 * 
 * Definições de seções da reunião, incluindo Escola Teocrática (virtual).
 */

import { EnumSecao } from '../types';

// ============================================================================
// SEÇÕES FÍSICAS (ordem temporal da reunião)
// ============================================================================

export const PHYSICAL_SECTIONS = [
    EnumSecao.INICIO_REUNIAO,
    EnumSecao.TESOUROS,
    EnumSecao.MINISTERIO,
    EnumSecao.VIDA_CRISTA,
    EnumSecao.FINAL_REUNIAO,
] as const;

// ============================================================================
// ESCOLA TEOCRÁTICA (seção virtual/conceitual)
// ============================================================================

/**
 * Escola Teocrática: Camada conceitual sobre Tesouros e Ministério.
 * Inclui partes de estudantes que recebem treinamento/aconselhamento.
 */
export const ESCOLA_TEOCRATICA = {
    name: 'Escola Teocrática',
    description: 'Partes de estudantes sob orientação do conselheiro',

    // Seções físicas que compõem a Escola
    includedSections: [
        EnumSecao.TESOUROS,
        EnumSecao.MINISTERIO,
    ] as const,

    // Tipos de parte da Escola Teocrática
    partTypes: [
        // De Tesouros
        'Leitura da Bíblia',

        // De Ministério (todas demonstrações)
        'Iniciando Conversas',
        'Cultivando o Interesse',
        'Fazendo Discípulos',
        'Explicando Suas Crenças',
        'Discurso de Estudante',
    ] as const,
} as const;

/**
 * Verifica se uma parte pertence à Escola Teocrática.
 */
export function isEscolaTeocrática(tipoParte: string): boolean {
    return ESCOLA_TEOCRATICA.partTypes.some(t =>
        tipoParte.includes(t) || t.includes(tipoParte)
    );
}

// ============================================================================
// REGRAS POR SEÇÃO
// ============================================================================

export const SECTION_RULES = {
    [EnumSecao.INICIO_REUNIAO]: {
        allowedGenders: ['brother'] as const,
        description: 'Apenas presidente (irmão)',
    },
    [EnumSecao.TESOUROS]: {
        allowedGenders: ['brother'] as const,
        description: 'Apenas irmãos (sexo masculino)',
    },
    [EnumSecao.MINISTERIO]: {
        allowedGenders: ['brother', 'sister'] as const,
        description: 'Todos elegíveis (priorizar irmãs em demonstrações)',
        preferSisters: true,
    },
    [EnumSecao.VIDA_CRISTA]: {
        allowedGenders: ['brother', 'sister'] as const,
        description: 'Todos elegíveis',
    },
    [EnumSecao.FINAL_REUNIAO]: {
        allowedGenders: ['brother'] as const,
        description: 'Apenas presidente e oração (irmãos)',
    },
} as const;
