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

    // Fix: Ensure Teaching Talks are strict (Brother Only)
    'Discurso de Ensino': EnumModalidade.DISCURSO_ENSINO,
    'Parte Vida Cristã': EnumModalidade.DISCURSO_ENSINO,
    'Parte Vida Crista': EnumModalidade.DISCURSO_ENSINO,
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

    // FIX: Stronger check for Teaching Talks / Life and Ministry parts
    if (normalized.includes('vida cristã') || normalized.includes('vida crista') || normalized.includes('discurso de ensino')) {
        return EnumModalidade.DISCURSO_ENSINO;
    }

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
 * Determina se uma parte deve ter seu publicador LIMPO (Null/Blank).
 * Ex: Cânticos.
 */
export function isCleanablePart(tipoParte: string): boolean {
    if (!tipoParte) return false;
    const n = tipoParte.toLowerCase().trim();
    return (
        n.includes('cântico') || n.includes('cantico')
    );
}

/**
 * Determina se uma parte é atribuída automaticamente ao Presidente da Reunião.
 * Ex: Oração Inicial, Comentários, Elogios.
 */
export function isAutoAssignedToChairman(tipoParte: string): boolean {
    if (!tipoParte) return false;
    const n = tipoParte.toLowerCase().trim();
    return (
        n.includes('comentários iniciais') || n.includes('comentarios iniciais') ||
        n.includes('comentários finais') || n.includes('comentarios finais') ||
        n.includes('elogios') || n.includes('elogio') ||
        n.includes('oração inicial') || n.includes('oracao inicial')
    );
}

/**
 * Determina se uma parte NÃO deve receber designação MANUAL via algoritmo de rotação.
 * Combina partes limpáveis (Cânticos) e auto-atribuídas (Presidente).
 */
export function isNonDesignatablePart(tipoParte: string): boolean {
    return isCleanablePart(tipoParte) || isAutoAssignedToChairman(tipoParte);
}

// Ordem lógica de uma reunião (para ordenar dropdown e relatórios)
export const TIPO_ORDER = [
    'Presidente',
    'Tesouros da Palavra de Deus', 'Discurso Tesouros', 'Joias Espirituais',
    'Leitura da Bíblia', 'Leitura da Biblia',
    'Iniciando Conversas', 'Cultivando o Interesse', 'Fazendo Discípulos', 'Explicando Suas Crenças',
    'Discurso de Estudante', // Genérico ou legado
    'Necessidades Locais', 'Necessidades da Congregação',
    'Dirigente EBC', 'Leitor EBC', 'Estudo Bíblico de Congregação',
    'Oração Final', 'Oracao Final'
];

// Tipos que geralmente são "ocultos" da visão principal ou estatísticas
// Usado para filtros de UI "Mostrar Ocultos"
export const HIDDEN_VIEW_TYPES = [
    'Comentários Iniciais', 'Comentarios Iniciais',
    'Comentários Finais', 'Comentarios Finais',
    'Cântico Inicial', 'Cântico do Meio', 'Cântico Final', 'Cântico', 'Cantico',
    'Oração Inicial', 'Oracao Inicial',
    'Elogios e Conselhos', 'Elogios e conselhos',
];
