/**
 * Part Weights - RVM Designações v8.0
 * 
 * Pesos para cálculo de carga de participação.
 * Partes mais longas/complexas = maior peso.
 */

// ============================================================================
// PESOS POR TIPO DE PARTE (baseado em duração típica)
// ============================================================================

export const PART_WEIGHTS: Record<string, number> = {
    // Partes de alta carga (10-30 min)
    'Dirigente EBC': 15,
    'Dirigente de EBC': 15,
    'Dirigente do EBC': 15,

    'Discurso Tesouros': 10,
    'Discurso na Tesouros': 10,
    'Joias Espirituais': 10,
    'Necessidades Locais': 10,
    'Parte Vida Cristã': 10,
    'Parte na Vida Cristã': 10,

    // Partes de média carga (3-5 min)
    'Iniciando Conversas': 5,
    'Cultivando o Interesse': 5,
    'Fazendo Discípulos': 5,
    'Explicando Suas Crenças': 5,
    'Discurso de Estudante': 5,

    // Partes de baixa carga
    'Leitura da Bíblia': 3,
    'Leitor EBC': 3,
    'Leitor do EBC': 3,
    'Leitor de EBC': 3,

    // Presidência (distribuído ao longo da reunião)
    'Presidente': 8,
    'Presidente da Reunião': 8,
    'Comentários Iniciais': 0, // Parte da presidência, não conta separado
    'Comentários Finais': 0,

    // Ignorados (não contam na carga)
    'Oração Inicial': 0,
    'Oração Final': 0,
    'Cântico Inicial': 0,
    'Cântico do Meio': 0,
    'Cântico Final': 0,
    'Elogios e Conselhos': 0, // Conselheiro, não estudante
};

// Peso para função de Ajudante (sempre menor)
export const HELPER_WEIGHT = 2;

// Peso padrão quando tipo não é encontrado
export const DEFAULT_WEIGHT = 5;

/**
 * Obtém o peso de uma parte baseado no tipo e função.
 */
export function getPartWeight(tipoParte: string, funcao: string = 'Titular'): number {
    // Ajudante sempre tem peso fixo baixo
    if (funcao === 'Ajudante') {
        return HELPER_WEIGHT;
    }

    // Busca peso específico ou usa default
    return PART_WEIGHTS[tipoParte] ?? DEFAULT_WEIGHT;
}

/**
 * Obtém peso baseado na duração em minutos (fallback).
 */
export function getWeightFromDuration(durationMinutes: number): number {
    if (durationMinutes >= 25) return 15;
    if (durationMinutes >= 10) return 10;
    if (durationMinutes >= 5) return 5;
    if (durationMinutes >= 3) return 3;
    return 0;
}
