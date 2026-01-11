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
    'Necessidades Locais': EnumModalidade.DISCURSO_ENSINO,
    'Dirigente EBC': EnumModalidade.DIRIGENTE_EBC,
    'Leitor EBC': EnumModalidade.LEITOR_EBC,
};

/**
 * Obtém a modalidade para um tipo de parte.
 * Retorna DEMONSTRACAO como fallback se não encontrado.
 */
export function getModalidadeFromTipo(tipoParte: string): string {
    return TIPO_TO_MODALIDADE[tipoParte] || EnumModalidade.DEMONSTRACAO;
}
