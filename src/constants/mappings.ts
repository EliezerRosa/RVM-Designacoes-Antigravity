/**
 * Part Type Mappings - RVM Designações
 * 
 * CENTRAL: Mapeamento de tipoParte → modalidade
 * Substitui duplicações em WorkbookManager e PublisherSelect.
 */

import { EnumModalidade } from '../types';

/**
 * Mapeamento de tipo de parte para modalidade de elegibilidade.
 * Esta é a ÚNICA fonte de verdade para este mapeamento.
 */
export const TIPO_TO_MODALIDADE: Record<string, string> = {
    // Presidência
    'Presidente da Reunião': EnumModalidade.PRESIDENCIA,
    'Presidente': EnumModalidade.PRESIDENCIA,
    'Comentários Iniciais': EnumModalidade.PRESIDENCIA,
    'Comentários Finais': EnumModalidade.PRESIDENCIA,

    // Oração
    'Oração Inicial': EnumModalidade.ORACAO,
    'Oração Final': EnumModalidade.ORACAO,

    // Tesouros da Palavra de Deus
    'Discurso Tesouros': EnumModalidade.DISCURSO_ENSINO,
    'Joias Espirituais': EnumModalidade.DISCURSO_ENSINO,
    'Leitura da Bíblia': EnumModalidade.LEITURA_ESTUDANTE,

    // Faça Seu Melhor no Ministério (Demonstrações)
    'Iniciando Conversas': EnumModalidade.DEMONSTRACAO,
    'Cultivando o Interesse': EnumModalidade.DEMONSTRACAO,
    'Fazendo Discípulos': EnumModalidade.DEMONSTRACAO,
    'Explicando Suas Crenças': EnumModalidade.DEMONSTRACAO,
    'Discurso de Estudante': EnumModalidade.DISCURSO_ESTUDANTE,

    // Nossa Vida Cristã
    'Necessidades Locais': EnumModalidade.NECESSIDADES_LOCAIS,
    'Dirigente EBC': EnumModalidade.DIRIGENTE_EBC,
    'Leitor EBC': EnumModalidade.LEITOR_EBC,
};

/**
 * Obtém a modalidade para um tipo de parte.
 * v8.3: Busca case-insensitive e flexível para lidar com variações da apostila.
 */
export function getModalidadeFromTipo(tipoParte: string): string {
    if (!tipoParte) return EnumModalidade.DEMONSTRACAO;

    const normalized = tipoParte.toLowerCase().trim();

    // 1. Match exato (normalizado)
    for (const [key, value] of Object.entries(TIPO_TO_MODALIDADE)) {
        if (key.toLowerCase() === normalized) return value;
    }

    // 2. Procura por palavras-chave em partes de estudante (Demonstrações)
    if (normalized.includes('conversas') ||
        normalized.includes('interesse') ||
        normalized.includes('discípulos') ||
        normalized.includes('crenças') ||
        normalized.includes('demonstração')) {
        return EnumModalidade.DEMONSTRACAO;
    }

    // 3. Casos especiais
    if (normalized.includes('leitura')) return EnumModalidade.LEITURA_ESTUDANTE;
    if (normalized.includes('discurso de estudante')) return EnumModalidade.DISCURSO_ESTUDANTE;
    if (normalized.includes('oração')) return EnumModalidade.ORACAO;
    if (normalized.includes('presidente') || normalized.includes('comentários')) return EnumModalidade.PRESIDENCIA;

    return EnumModalidade.DEMONSTRACAO; // Fallback seguro para estudantes
}
