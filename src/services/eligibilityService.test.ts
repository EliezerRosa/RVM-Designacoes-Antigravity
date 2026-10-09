import test from 'node:test';
import assert from 'node:assert/strict';
import type { Publisher } from '../types';
import { EnumModalidade, EnumFuncao, EnumSecao } from '../types';
import { checkEligibility } from './eligibilityService';

const elder: Publisher = {
    id: 'e1', name: 'Ancião Teste', gender: 'brother', condition: 'Ancião', funcao: null, phone: '',
    isBaptized: true, isServing: true, ageGroup: 'Adulto', parentIds: [], isHelperOnly: false, canPairWithNonParent: true,
    privileges: { canGiveTalks: true, canGiveStudentTalks: true, canConductCBS: true, canReadCBS: true, canPray: true, canPreside: true },
    privilegesBySection: { canParticipateInTreasures: true, canParticipateInMinistry: true, canParticipateInLife: true },
    availability: { mode: 'always', exceptionDates: [], availableDates: [] }, aliases: [],
};

const brother: Publisher = {
    ...elder, id: 'b1', name: 'Irmão Teste', condition: 'Publicador',
    privileges: { canGiveTalks: false, canGiveStudentTalks: true, canConductCBS: false, canReadCBS: true, canPray: true, canPreside: false },
};

test('texto com "irmã" NÃO restringe gênero em modalidade exclusiva de irmãos (Discurso Tesouros)', () => {
    const result = checkEligibility(elder, EnumModalidade.DISCURSO_ENSINO, EnumFuncao.TITULAR, {
        secao: EnumSecao.TESOUROS,
        partTitle: 'Discurso Tesouros',
        partDescription: 'Como uma irmã pode fortalecer a fé da família',
    });
    assert.equal(result.eligible, true, result.reason);
});

test('texto com "irmã" CONTINUA restringindo gênero em demonstração (modalidade mista)', () => {
    const result = checkEligibility(brother, EnumModalidade.DEMONSTRACAO, EnumFuncao.TITULAR, {
        secao: EnumSecao.MINISTERIO,
        partTitle: 'Iniciando Conversas',
        partDescription: 'Demonstração: uma irmã conversa com a vizinha',
    });
    assert.equal(result.eligible, false);
    assert.match(result.reason || '', /exige irmã/);
});
