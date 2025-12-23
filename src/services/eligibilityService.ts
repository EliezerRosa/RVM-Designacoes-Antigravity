/**
 * Eligibility Service - RVM Designações
 * Determina elegibilidade de publicadores para diferentes tipos de partes
 * Baseado em: initialRules.ts + Prompt de Especificação
 * 
 * REGRAS IMPLEMENTADAS:
 * 1. isServing = false → BLOQUEADO
 * 2. isAvailable = false para data → BLOQUEADO
 * 3. isHelperOnly + partType ≠ AJUDANTE → BLOQUEADO
 * 4. Presidente requer canPreside
 * 5. Dirigente EBC requer condition = Ancião
 * 6. Oração requer isBaptized + gender = brother
 * 7. Oração inicial requer canPreside
 * 8. Leitor EBC requer gender = brother
 * 9. Irmãs não podem fazer Discursos
 * 10. Irmãs só participam em Ministério ou Ajudante
 * 11. Publicadores em Tesouros só na Leitura da Bíblia
 */

import type { Publisher } from '../types';
import { EnumModalidade, EnumTipoParte, EnumFuncao, EnumSecao } from '../types';

type Modalidade = typeof EnumModalidade[keyof typeof EnumModalidade];
type TipoParte = typeof EnumTipoParte[keyof typeof EnumTipoParte];
type Funcao = typeof EnumFuncao[keyof typeof EnumFuncao];

export interface EligibilityContext {
    date?: string;           // Data da reunião (para verificar disponibilidade)
    secao?: string;          // Seção da reunião (EnumSecao value)
    partTitle?: string;      // Título da parte (para regras específicas)
    isOracaoInicial?: boolean; // Se é oração inicial (requer canPreside)
}

export interface EligibilityResult {
    eligible: boolean;
    reason?: string;
}

/**
 * Verifica se um publicador é elegível para uma modalidade específica
 * COM contexto adicional (data, seção, etc.)
 */
export function isEligibleForModality(
    publisher: Publisher,
    modalidade: Modalidade,
    funcao: Funcao = EnumFuncao.TITULAR,
    context: EligibilityContext = {}
): boolean {
    const result = checkEligibility(publisher, modalidade, funcao, context);
    return result.eligible;
}

/**
 * Verifica elegibilidade com retorno detalhado (motivo da rejeição)
 */
export function checkEligibility(
    publisher: Publisher,
    modalidade: Modalidade,
    funcao: Funcao = EnumFuncao.TITULAR,
    context: EligibilityContext = {}
): EligibilityResult {

    // ===== FILTROS GLOBAIS (Regras 1-3) =====

    // Regra 1: Não designar publicadores não atuantes
    if (!publisher.isServing) {
        return { eligible: false, reason: 'Publicador não está atuante' };
    }

    // Regra de desqualificação
    if (publisher.isNotQualified) {
        return { eligible: false, reason: 'Publicador desqualificado' };
    }

    // Regra de não participação
    if (publisher.requestedNoParticipation) {
        return { eligible: false, reason: 'Publicador pediu para não participar' };
    }

    // Regra 2: Não designar em datas indisponíveis
    if (context.date && !isAvailableOnDate(publisher, context.date)) {
        return { eligible: false, reason: 'Publicador indisponível nesta data' };
    }

    // Regra 3: "Só Ajudante" não pode partes principais
    if (publisher.isHelperOnly && funcao !== EnumFuncao.AJUDANTE) {
        return { eligible: false, reason: 'Publicador marcado como "Só Ajudante"' };
    }

    // ===== REGRAS DE AJUDANTE =====
    if (funcao === EnumFuncao.AJUDANTE) {
        return canBeHelper(publisher);
    }

    // ===== REGRAS POR MODALIDADE =====
    switch (modalidade) {
        case EnumModalidade.PRESIDENCIA:
            // Regra 4: Somente quem pode presidir
            if (!publisher.privileges.canPreside) {
                return { eligible: false, reason: 'Não tem privilégio de presidir' };
            }
            return { eligible: true };

        case EnumModalidade.CANTICO:
            return { eligible: false, reason: 'Cânticos não são designados' };

        case EnumModalidade.ORACAO:
            // Regra 6: Somente irmãos batizados podem orar
            if (!publisher.isBaptized) {
                return { eligible: false, reason: 'Não é batizado' };
            }
            if (publisher.gender !== 'brother') {
                return { eligible: false, reason: 'Irmãs não fazem oração' };
            }
            if (!publisher.privileges.canPray) {
                return { eligible: false, reason: 'Não tem privilégio de orar' };
            }
            // Regra 7: Oração inicial requer canPreside
            if (context.isOracaoInicial && !publisher.privileges.canPreside) {
                return { eligible: false, reason: 'Oração inicial requer privilégio de presidir' };
            }
            return { eligible: true };

        case EnumModalidade.ACONSELHAMENTO:
            if (!isElderOrMS(publisher)) {
                return { eligible: false, reason: 'Somente Anciãos/SMs podem aconselhar' };
            }
            return { eligible: true };

        case EnumModalidade.DISCURSO_ENSINO:
            // Regra 9: Irmãs não podem fazer Discursos
            if (publisher.gender === 'sister') {
                return { eligible: false, reason: 'Irmãs não fazem discursos de ensino' };
            }
            // Regra 11: Publicadores em Tesouros só Leitura (não se aplica a discurso ensino)
            if (!publisher.privileges.canGiveTalks) {
                return { eligible: false, reason: 'Não tem privilégio de dar discursos' };
            }
            if (!isElderOrMS(publisher)) {
                return { eligible: false, reason: 'Discurso de ensino requer Ancião/SM' };
            }
            return { eligible: true };

        case EnumModalidade.LEITURA_ESTUDANTE:
            // Regra 11: Em Tesouros, apenas Leitura da Bíblia para publicadores regulares
            if (context.secao === EnumSecao.TESOUROS) {
                // Leitura da Bíblia é permitida para qualquer irmão batizado
                if (!publisher.isBaptized) {
                    return { eligible: false, reason: 'Não é batizado' };
                }
                return { eligible: true };
            }
            return checkStudentPartEligibility(publisher);

        case EnumModalidade.DEMONSTRACAO:
            // Regra 10: Irmãs só em Ministério (demonstração é Ministério)
            // Demonstrações são permitidas para irmãs
            return checkStudentPartEligibility(publisher);

        case EnumModalidade.DISCURSO_ESTUDANTE:
            // Regra 9: Irmãs não podem fazer Discursos
            if (publisher.gender === 'sister') {
                return { eligible: false, reason: 'Irmãs não fazem discursos de estudante' };
            }
            return checkStudentPartEligibility(publisher);

        case EnumModalidade.DIRIGENTE_EBC:
            // Regra 5: Somente Anciãos podem dirigir EBC
            if (publisher.condition !== 'Ancião' && publisher.condition !== 'Anciao') {
                return { eligible: false, reason: 'Dirigir EBC requer ser Ancião' };
            }
            if (!publisher.privileges.canConductCBS) {
                return { eligible: false, reason: 'Não tem privilégio de dirigir EBC' };
            }
            return { eligible: true };

        case EnumModalidade.LEITOR_EBC:
            // Regra 8: Somente irmãos podem ler no EBC
            if (publisher.gender !== 'brother') {
                return { eligible: false, reason: 'Irmãs não fazem leitura de EBC' };
            }
            if (!publisher.privileges.canReadCBS) {
                return { eligible: false, reason: 'Não tem privilégio de ler EBC' };
            }
            return { eligible: true };

        default:
            console.warn(`[Eligibility] Modalidade desconhecida: ${modalidade}`);
            return { eligible: false, reason: 'Modalidade desconhecida' };
    }
}

/**
 * Verifica se um publicador é elegível para um tipo de parte específico
 */
export function isEligibleForPartType(
    publisher: Publisher,
    tipoParte: TipoParte,
    funcao: Funcao = EnumFuncao.TITULAR,
    context: EligibilityContext = {}
): boolean {
    // Mapear TipoParte para Modalidade e usar checkEligibility
    const modalidade = mapTipoParteToModalidade(tipoParte);

    // Contexto adicional para oração inicial
    if (tipoParte === EnumTipoParte.ORACAO_INICIAL) {
        context.isOracaoInicial = true;
    }

    // Contexto de seção para Tesouros
    if (tipoParte === EnumTipoParte.DISCURSO_TESOUROS ||
        tipoParte === EnumTipoParte.JOIAS_ESPIRITUAIS) {
        context.secao = EnumSecao.TESOUROS;
    }

    return isEligibleForModality(publisher, modalidade, funcao, context);
}

/**
 * Retorna lista de publicadores elegíveis para uma modalidade
 */
export function getEligiblePublishers(
    publishers: Publisher[],
    modalidade: Modalidade,
    funcao: Funcao = EnumFuncao.TITULAR,
    context: EligibilityContext = {}
): Publisher[] {
    return publishers.filter(p => isEligibleForModality(p, modalidade, funcao, context));
}

/**
 * Retorna lista de publicadores elegíveis para um tipo de parte
 */
export function getEligiblePublishersForPart(
    publishers: Publisher[],
    tipoParte: TipoParte,
    funcao: Funcao = EnumFuncao.TITULAR,
    context: EligibilityContext = {}
): Publisher[] {
    return publishers.filter(p => isEligibleForPartType(p, tipoParte, funcao, context));
}

/**
 * Retorna detalhes de elegibilidade para todos os publicadores
 */
export function getEligibilityDetails(
    publishers: Publisher[],
    modalidade: Modalidade,
    funcao: Funcao = EnumFuncao.TITULAR,
    context: EligibilityContext = {}
): Array<{ publisher: Publisher; result: EligibilityResult }> {
    return publishers.map(p => ({
        publisher: p,
        result: checkEligibility(p, modalidade, funcao, context)
    }));
}

// ===== Funções Auxiliares =====

/**
 * Verifica se o publicador está disponível numa data específica
 */
function isAvailableOnDate(publisher: Publisher, date: string): boolean {
    const availability = publisher.availability;

    if (availability.mode === 'always') {
        // Modo "sempre disponível" - verificar exceções negativas
        return !availability.exceptionDates.includes(date);
    } else {
        // Modo "nunca disponível" - verificar exceções positivas
        return availability.availableDates.includes(date);
    }
}

/**
 * Verifica se o publicador é Ancião ou Servo Ministerial
 */
function isElderOrMS(publisher: Publisher): boolean {
    return publisher.condition === 'Ancião' ||
        publisher.condition === 'Anciao' ||
        publisher.condition === 'Servo Ministerial';
}

/**
 * Verifica elegibilidade para partes de estudante
 */
function checkStudentPartEligibility(publisher: Publisher): EligibilityResult {
    if (!publisher.isBaptized) {
        return { eligible: false, reason: 'Não é batizado' };
    }
    if (publisher.isHelperOnly) {
        return { eligible: false, reason: 'Marcado como "Só Ajudante"' };
    }
    if (publisher.ageGroup === 'Crianca') {
        return { eligible: false, reason: 'Criança não faz partes de estudante' };
    }
    return { eligible: true };
}

/**
 * Verifica se pode ser ajudante em demonstrações
 */
function canBeHelper(publisher: Publisher): EligibilityResult {
    if (publisher.isNotQualified) {
        return { eligible: false, reason: 'Publicador desqualificado' };
    }
    if (publisher.requestedNoParticipation) {
        return { eligible: false, reason: 'Publicador pediu para não participar' };
    }
    // Ajudantes podem ser qualquer pessoa qualificada (até crianças)
    return { eligible: true };
}

/**
 * Mapeia TipoParte para Modalidade
 */
function mapTipoParteToModalidade(tipoParte: TipoParte): Modalidade {
    switch (tipoParte) {
        case EnumTipoParte.PRESIDENTE:
        case EnumTipoParte.COMENTARIOS_INICIAIS:
        case EnumTipoParte.COMENTARIOS_FINAIS:
            return EnumModalidade.PRESIDENCIA;

        case EnumTipoParte.CANTICO_INICIAL:
        case EnumTipoParte.CANTICO_MEIO:
        case EnumTipoParte.CANTICO_FINAL:
            return EnumModalidade.CANTICO;

        case EnumTipoParte.ORACAO_INICIAL:
        case EnumTipoParte.ORACAO_FINAL:
            return EnumModalidade.ORACAO;

        case EnumTipoParte.DISCURSO_TESOUROS:
        case EnumTipoParte.JOIAS_ESPIRITUAIS:
        case EnumTipoParte.PARTE_VIDA_CRISTA:
            return EnumModalidade.DISCURSO_ENSINO;

        case EnumTipoParte.PARTE_ESTUDANTE:
            return EnumModalidade.DEMONSTRACAO; // Default, pode variar

        case EnumTipoParte.ELOGIOS_CONSELHOS:
            return EnumModalidade.ACONSELHAMENTO;

        case EnumTipoParte.DIRIGENTE_EBC:
            return EnumModalidade.DIRIGENTE_EBC;

        case EnumTipoParte.LEITOR_EBC:
            return EnumModalidade.LEITOR_EBC;

        default:
            return EnumModalidade.PRESIDENCIA;
    }
}

/**
 * Mapeamento de Modalidade para TipoParte compatíveis
 */
export function getCompatiblePartTypes(modalidade: Modalidade): TipoParte[] {
    switch (modalidade) {
        case EnumModalidade.PRESIDENCIA:
            return [EnumTipoParte.PRESIDENTE, EnumTipoParte.COMENTARIOS_INICIAIS, EnumTipoParte.COMENTARIOS_FINAIS];
        case EnumModalidade.ORACAO:
            return [EnumTipoParte.ORACAO_INICIAL, EnumTipoParte.ORACAO_FINAL];
        case EnumModalidade.DISCURSO_ENSINO:
            return [EnumTipoParte.DISCURSO_TESOUROS, EnumTipoParte.JOIAS_ESPIRITUAIS, EnumTipoParte.PARTE_VIDA_CRISTA];
        case EnumModalidade.LEITURA_ESTUDANTE:
        case EnumModalidade.DEMONSTRACAO:
        case EnumModalidade.DISCURSO_ESTUDANTE:
            return [EnumTipoParte.PARTE_ESTUDANTE];
        case EnumModalidade.ACONSELHAMENTO:
            return [EnumTipoParte.ELOGIOS_CONSELHOS];
        case EnumModalidade.DIRIGENTE_EBC:
            return [EnumTipoParte.DIRIGENTE_EBC];
        case EnumModalidade.LEITOR_EBC:
            return [EnumTipoParte.LEITOR_EBC];
        default:
            return [];
    }
}

/**
 * Estatísticas de elegibilidade para um grupo de publicadores
 */
export function getEligibilityStats(publishers: Publisher[]): Record<string, number> {
    const serving = publishers.filter(p => p.isServing);
    const eligible = serving.filter(p => !p.isNotQualified && !p.requestedNoParticipation);

    return {
        total: publishers.length,
        serving: serving.length,
        eligible: eligible.length,
        canPreside: eligible.filter(p => p.privileges.canPreside).length,
        canPray: eligible.filter(p => p.privileges.canPray).length,
        canGiveTalks: eligible.filter(p => p.privileges.canGiveTalks).length,
        canConductCBS: eligible.filter(p => p.privileges.canConductCBS).length,
        canReadCBS: eligible.filter(p => p.privileges.canReadCBS).length,
        canDoStudentParts: eligible.filter(p => checkStudentPartEligibility(p).eligible).length,
        canBeHelper: eligible.filter(p => canBeHelper(p).eligible).length,
        eldersAndMS: eligible.filter(p => isElderOrMS(p)).length,
        brothers: eligible.filter(p => p.gender === 'brother').length,
        sisters: eligible.filter(p => p.gender === 'sister').length,
    };
}
