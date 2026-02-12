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
    'Comentarios Iniciais': EnumModalidade.PRESIDENCIA,
    'Comentarios Finais': EnumModalidade.PRESIDENCIA,

    // Cânticos (NÃO designáveis — elegibilidade retorna false)
    'Cântico Inicial': EnumModalidade.CANTICO,
    'Cântico do Meio': EnumModalidade.CANTICO,
    'Cântico Final': EnumModalidade.CANTICO,
    'Cantico Inicial': EnumModalidade.CANTICO,
    'Cantico do Meio': EnumModalidade.CANTICO,
    'Cantico Final': EnumModalidade.CANTICO,

    // Oração
    'Oração Inicial': EnumModalidade.ORACAO,
    'Oração Final': EnumModalidade.ORACAO,

    // Elogios e Conselhos (NÃO designável — é do Presidente)
    'Elogios e Conselhos': EnumModalidade.ACONSELHAMENTO,

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
 * v8.5: Fallback baseado na seção — partes Vida Cristã → DISCURSO_ENSINO (só irmãos).
 */
export function getModalidadeFromTipo(tipoParte: string, section?: string): string {
    if (!tipoParte) return EnumModalidade.DEMONSTRACAO;

    const normalized = tipoParte.toLowerCase().trim();

    // 1. Match exato (normalizado)
    for (const [key, value] of Object.entries(TIPO_TO_MODALIDADE)) {
        if (key.toLowerCase() === normalized) return value;
    }

    // 2. Partes NÃO designáveis (devem retornar modalidade que bloqueia)
    if (normalized.includes('cântico') || normalized.includes('cantico')) {
        return EnumModalidade.CANTICO;
    }
    if (normalized.includes('elogio') || normalized.includes('conselho')) {
        return EnumModalidade.ACONSELHAMENTO;
    }
    if (normalized.includes('comentário') || normalized.includes('comentarios') || normalized.includes('comentários')) {
        return EnumModalidade.PRESIDENCIA;
    }

    // 3. Procura por palavras-chave em partes de estudante (Demonstrações)
    if (normalized.includes('conversas') ||
        normalized.includes('interesse') ||
        normalized.includes('discípulos') ||
        normalized.includes('crenças') ||
        normalized.includes('demonstração')) {
        return EnumModalidade.DEMONSTRACAO;
    }

    // 4. Outros casos conhecidos
    if (normalized.includes('leitura')) return EnumModalidade.LEITURA_ESTUDANTE;
    if (normalized.includes('discurso de estudante')) return EnumModalidade.DISCURSO_ESTUDANTE;
    if (normalized.includes('oração') || normalized.includes('oracao')) return EnumModalidade.ORACAO;
    if (normalized.includes('presidente')) return EnumModalidade.PRESIDENCIA;
    if (normalized.includes('necessidades locais')) return EnumModalidade.NECESSIDADES_LOCAIS;

    // 5. Fallback baseado na SEÇÃO da parte
    // Partes da Vida Cristã e Tesouros são discursos de ensino (só irmãos Anciãos/SMs).
    // Partes do Ministério são demonstrações (aberto a todos).
    if (section) {
        const sec = section.toLowerCase();
        if (sec.includes('vida cristã') || sec.includes('vida crista') || sec.includes('tesouros')) {
            console.warn(`[Mappings] tipoParte desconhecido: "${tipoParte}" — seção "${section}" → DISCURSO_ENSINO`);
            return EnumModalidade.DISCURSO_ENSINO;
        }
    }

    console.warn(`[Mappings] tipoParte desconhecido: "${tipoParte}" seção: "${section || 'N/A'}" — fallback para DEMONSTRACAO`);
    return EnumModalidade.DEMONSTRACAO; // Fallback para estudantes (seção Ministério ou desconhecida)
}

/**
 * Determina se uma parte NÃO deve receber designação automática.
 * Cânticos, Comentários Iniciais/Finais, e Elogios e Conselhos são do Presidente
 * ou partes coletivas — nunca recebem designação separada.
 */
export function isNonDesignatablePart(tipoParte: string): boolean {
    if (!tipoParte) return false;
    const n = tipoParte.toLowerCase().trim();
    return (
        n.includes('cântico') || n.includes('cantico') ||
        n.includes('comentários iniciais') || n.includes('comentarios iniciais') ||
        n.includes('comentários finais') || n.includes('comentarios finais') ||
        n.includes('elogios') ||
        n.includes('elogio')
    );
}
