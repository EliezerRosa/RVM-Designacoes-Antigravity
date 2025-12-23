/**
 * Eligibility Service - RVM Designações
 * Determina elegibilidade de publicadores para diferentes tipos de partes
 * Baseado no mapeamento: Publisher privileges → EnumModalidade/EnumTipoParte
 */

import type { Publisher } from '../types';
import { EnumModalidade, EnumTipoParte, EnumFuncao } from '../types';

type Modalidade = typeof EnumModalidade[keyof typeof EnumModalidade];
type TipoParte = typeof EnumTipoParte[keyof typeof EnumTipoParte];
type Funcao = typeof EnumFuncao[keyof typeof EnumFuncao];

/**
 * Verifica se um publicador é elegível para uma modalidade específica
 */
export function isEligibleForModality(
    publisher: Publisher,
    modalidade: Modalidade,
    funcao: Funcao = EnumFuncao.TITULAR
): boolean {
    // Filtros globais de desqualificação
    if (publisher.isNotQualified) return false;
    if (publisher.requestedNoParticipation) return false;

    // Ajudante tem regras diferentes
    if (funcao === EnumFuncao.AJUDANTE) {
        return canBeHelper(publisher);
    }

    switch (modalidade) {
        case EnumModalidade.PRESIDENCIA:
            return publisher.privileges.canPreside;

        case EnumModalidade.CANTICO:
            return false; // Cânticos não são designados a publicadores

        case EnumModalidade.ORACAO:
            return publisher.privileges.canPray && publisher.gender === 'brother';

        case EnumModalidade.ACONSELHAMENTO:
            // Somente Presidente/Conselheiro (Ancião/SM)
            return isElderOrMS(publisher);

        case EnumModalidade.DISCURSO_ENSINO:
            // Discursos de ensino são para Anciãos/SMs
            return publisher.privileges.canGiveTalks && isElderOrMS(publisher);

        case EnumModalidade.LEITURA_ESTUDANTE:
            // Qualquer publicador batizado pode fazer leitura
            return canDoStudentParts(publisher);

        case EnumModalidade.DEMONSTRACAO:
            // Demonstrações: publicadores batizados (homens ou mulheres)
            return canDoStudentParts(publisher);

        case EnumModalidade.DISCURSO_ESTUDANTE:
            // Discursos de estudante: somente irmãos
            return canDoStudentParts(publisher) && publisher.gender === 'brother';

        case EnumModalidade.DIRIGENTE_EBC:
            return publisher.privileges.canConductCBS;

        case EnumModalidade.LEITOR_EBC:
            return publisher.privileges.canReadCBS && publisher.gender === 'brother';

        default:
            console.warn(`[Eligibility] Modalidade desconhecida: ${modalidade}`);
            return false;
    }
}

/**
 * Verifica se um publicador é elegível para um tipo de parte específico
 */
export function isEligibleForPartType(
    publisher: Publisher,
    tipoParte: TipoParte,
    funcao: Funcao = EnumFuncao.TITULAR
): boolean {
    // Filtros globais
    if (publisher.isNotQualified) return false;
    if (publisher.requestedNoParticipation) return false;

    // Ajudante
    if (funcao === EnumFuncao.AJUDANTE) {
        return canBeHelper(publisher);
    }

    switch (tipoParte) {
        case EnumTipoParte.PRESIDENTE:
            return publisher.privileges.canPreside;

        case EnumTipoParte.CANTICO_INICIAL:
        case EnumTipoParte.CANTICO_MEIO:
        case EnumTipoParte.CANTICO_FINAL:
            return false; // Cânticos não são designados

        case EnumTipoParte.ORACAO_INICIAL:
        case EnumTipoParte.ORACAO_FINAL:
            return publisher.privileges.canPray && publisher.gender === 'brother';

        case EnumTipoParte.COMENTARIOS_INICIAIS:
        case EnumTipoParte.COMENTARIOS_FINAIS:
            return publisher.privileges.canPreside; // Feito pelo presidente

        case EnumTipoParte.DISCURSO_TESOUROS:
        case EnumTipoParte.JOIAS_ESPIRITUAIS:
            return publisher.privileges.canGiveTalks && isElderOrMS(publisher);

        case EnumTipoParte.PARTE_ESTUDANTE:
            return canDoStudentParts(publisher);

        case EnumTipoParte.ELOGIOS_CONSELHOS:
            return isElderOrMS(publisher); // Conselheiro designado

        case EnumTipoParte.PARTE_VIDA_CRISTA:
            // Partes da Vida Cristã: geralmente Anciãos/SMs, mas pode variar
            return publisher.privileges.canGiveTalks;

        case EnumTipoParte.DIRIGENTE_EBC:
            return publisher.privileges.canConductCBS;

        case EnumTipoParte.LEITOR_EBC:
            return publisher.privileges.canReadCBS && publisher.gender === 'brother';

        default:
            console.warn(`[Eligibility] TipoParte desconhecido: ${tipoParte}`);
            return false;
    }
}

/**
 * Retorna lista de publicadores elegíveis para uma modalidade
 */
export function getEligiblePublishers(
    publishers: Publisher[],
    modalidade: Modalidade,
    funcao: Funcao = EnumFuncao.TITULAR
): Publisher[] {
    return publishers.filter(p => isEligibleForModality(p, modalidade, funcao));
}

/**
 * Retorna lista de publicadores elegíveis para um tipo de parte
 */
export function getEligiblePublishersForPart(
    publishers: Publisher[],
    tipoParte: TipoParte,
    funcao: Funcao = EnumFuncao.TITULAR
): Publisher[] {
    return publishers.filter(p => isEligibleForPartType(p, tipoParte, funcao));
}

// ===== Funções Auxiliares =====

/**
 * Verifica se o publicador é Ancião ou Servo Ministerial
 */
function isElderOrMS(publisher: Publisher): boolean {
    return publisher.condition === 'Ancião' ||
        publisher.condition === 'Anciao' ||
        publisher.condition === 'Servo Ministerial';
}

/**
 * Verifica se pode fazer partes de estudante
 * Regra: Publicador batizado, não é "somente ajudante"
 */
function canDoStudentParts(publisher: Publisher): boolean {
    return publisher.isBaptized &&
        !publisher.isHelperOnly &&
        publisher.ageGroup !== 'Crianca';
}

/**
 * Verifica se pode ser ajudante em demonstrações
 * Regra: Batizado ou não, mas não desqualificado
 */
function canBeHelper(publisher: Publisher): boolean {
    // Ajudantes podem ser qualquer pessoa qualificada
    // Até crianças podem ser ajudantes em algumas demonstrações
    return !publisher.isNotQualified &&
        !publisher.requestedNoParticipation;
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
    const eligible = publishers.filter(p => !p.isNotQualified && !p.requestedNoParticipation);

    return {
        total: publishers.length,
        eligible: eligible.length,
        canPreside: eligible.filter(p => p.privileges.canPreside).length,
        canPray: eligible.filter(p => p.privileges.canPray).length,
        canGiveTalks: eligible.filter(p => p.privileges.canGiveTalks).length,
        canConductCBS: eligible.filter(p => p.privileges.canConductCBS).length,
        canReadCBS: eligible.filter(p => p.privileges.canReadCBS).length,
        canDoStudentParts: eligible.filter(p => canDoStudentParts(p)).length,
        canBeHelper: eligible.filter(p => canBeHelper(p)).length,
        eldersAndMS: eligible.filter(p => isElderOrMS(p)).length,
    };
}
