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

// ===== TESTES DA BLINDAGEM BIDIRECIONAL (Titular ↔ Ajudante) =====

const sister: Publisher = {
    ...brother,
    id: 's1',
    name: 'Irmã Teste',
    gender: 'sister',
    condition: 'Publicadora',
    privileges: { canGiveTalks: false, canGiveStudentTalks: false, canConductCBS: false, canReadCBS: false, canPray: false, canPreside: false },
};

const wifeSister: Publisher = {
    ...sister,
    id: 's_wife',
    name: 'Irmã Esposa',
    spouseId: 'b1',
};

const daughterSister: Publisher = {
    ...sister,
    id: 's_daughter',
    name: 'Filha Irmã',
    parentIds: ['b1'],
};

const motherSister: Publisher = {
    ...sister,
    id: 's_mother',
    name: 'Mãe Irmã',
};

const sonBrother: Publisher = {
    ...brother,
    id: 'b_son',
    name: 'Filho Irmão',
    parentIds: ['s_mother'],
};

test('BLINDAGEM BIDIRECIONAL: Titular varão NÃO pode ser titular se ajudante já designada for irmã sem parentesco', () => {
    const result = checkEligibility(brother, EnumModalidade.DEMONSTRACAO, EnumFuncao.TITULAR, {
        secao: EnumSecao.MINISTERIO,
        partTitle: '4. Iniciando conversas',
        assistantGender: 'sister',
        assistantPublisherId: sister.id,
    });
    assert.equal(result.eligible, false);
    assert.match(result.reason || '', /Irmão não pode ser titular com ajudante irmã/);
});

test('BLINDAGEM BIDIRECIONAL: Titular irmã NÃO pode ser titular se ajudante já designado for varão sem parentesco', () => {
    const result = checkEligibility(sister, EnumModalidade.DEMONSTRACAO, EnumFuncao.TITULAR, {
        secao: EnumSecao.MINISTERIO,
        partTitle: '4. Iniciando conversas',
        assistantGender: 'brother',
        assistantPublisherId: brother.id,
    });
    assert.equal(result.eligible, false);
    assert.match(result.reason || '', /Irmã não pode ser titular com ajudante irmão/);
});

test('BLINDAGEM BIDIRECIONAL: Titular varão PODE ser titular se ajudante já designado for varão', () => {
    const result = checkEligibility(brother, EnumModalidade.DEMONSTRACAO, EnumFuncao.TITULAR, {
        secao: EnumSecao.MINISTERIO,
        partTitle: '4. Iniciando conversas',
        assistantGender: 'brother',
        assistantPublisherId: 'b2',
    });
    assert.equal(result.eligible, true);
});

test('BLINDAGEM BIDIRECIONAL: Titular irmã PODE ser titular se ajudante já designada for irmã', () => {
    const result = checkEligibility(sister, EnumModalidade.DEMONSTRACAO, EnumFuncao.TITULAR, {
        secao: EnumSecao.MINISTERIO,
        partTitle: '4. Iniciando conversas',
        assistantGender: 'sister',
        assistantPublisherId: 's2',
    });
    assert.equal(result.eligible, true);
});

test('BLINDAGEM BIDIRECIONAL (Bypass Cônjuge): Titular varão PODE ser titular com esposa como ajudante', () => {
    const brotherWithSpouse = { ...brother, spouseId: 's_wife' };
    const result = checkEligibility(brotherWithSpouse, EnumModalidade.DEMONSTRACAO, EnumFuncao.TITULAR, {
        secao: EnumSecao.MINISTERIO,
        partTitle: '4. Iniciando conversas',
        assistantGender: 'sister',
        assistantPublisherId: wifeSister.id,
        assistantSpouseId: 'b1',
    });
    assert.equal(result.eligible, true);
});

test('BLINDAGEM BIDIRECIONAL (Bypass Pai/Filho): Titular pai (varão) PODE ser titular com filha como ajudante', () => {
    const result = checkEligibility(brother, EnumModalidade.DEMONSTRACAO, EnumFuncao.TITULAR, {
        secao: EnumSecao.MINISTERIO,
        partTitle: '4. Iniciando conversas',
        assistantGender: 'sister',
        assistantPublisherId: daughterSister.id,
        assistantParentIds: ['b1'],
    });
    assert.equal(result.eligible, true);
});

test('BLINDAGEM BIDIRECIONAL (Bypass Filho/Mãe): Titular filho (varão) PODE ser titular com mãe como ajudante', () => {
    const result = checkEligibility(sonBrother, EnumModalidade.DEMONSTRACAO, EnumFuncao.TITULAR, {
        secao: EnumSecao.MINISTERIO,
        partTitle: '4. Iniciando conversas',
        assistantGender: 'sister',
        assistantPublisherId: motherSister.id,
        assistantChildIds: ['b_son'],
    });
    assert.equal(result.eligible, true);
});

test('BLINDAGEM BIDIRECIONAL: buildEligibilityContext extrai assistantGender e metadados quando titular avaliado', async () => {
    const { buildEligibilityContext } = await import('./eligibilityService');
    const titularPart: any = {
        id: 'p-tit',
        weekId: '2026-10-26',
        seq: 5,
        tipoParte: 'Demonstração',
        modalidade: 'Demonstração',
        tituloParte: '4. Iniciando conversas',
        funcao: 'Titular',
        date: '2026-10-29',
        section: 'Faça Seu Melhor',
    };

    const ajudantePart: any = {
        id: 'p-ajud',
        weekId: '2026-10-26',
        seq: 5,
        tipoParte: 'Demonstração',
        modalidade: 'Demonstração',
        tituloParte: '4. Iniciando conversas - Ajudante',
        funcao: 'Ajudante',
        date: '2026-10-29',
        section: 'Faça Seu Melhor',
        resolvedPublisherName: 'Irmã Esposa',
        resolvedPublisherId: 's_wife',
    };

    const ctx = buildEligibilityContext(titularPart, [titularPart, ajudantePart], [brother, wifeSister]);
    assert.equal(ctx.assistantGender, 'sister');
    assert.equal(ctx.assistantPublisherId, 's_wife');
    assert.equal(ctx.assistantSpouseId, 'b1');
});

test('BLINDAGEM BIDIRECIONAL (Sentido Ajudante): Ajudante irmã com titular irmão sem parentesco é BLOQUEADA', () => {
    const result = checkEligibility(sister, EnumModalidade.DEMONSTRACAO, EnumFuncao.AJUDANTE, {
        secao: EnumSecao.MINISTERIO,
        partTitle: '4. Iniciando conversas',
        titularGender: 'brother',
        titularPublisherId: brother.id,
    });
    assert.equal(result.eligible, false);
    assert.match(result.reason || '', /Irmã não pode ser ajudante de irmão/);
});

test('BLINDAGEM BIDIRECIONAL (Sentido Ajudante com Bypass Cônjuge): Ajudante irmã esposa de titular irmão é PERMITIDA', () => {
    const result = checkEligibility(wifeSister, EnumModalidade.DEMONSTRACAO, EnumFuncao.AJUDANTE, {
        secao: EnumSecao.MINISTERIO,
        partTitle: '4. Iniciando conversas',
        titularGender: 'brother',
        titularPublisherId: 'b1',
    });
    assert.equal(result.eligible, true);
});

test('BLINDAGEM BIDIRECIONAL (Sentido Ajudante com Bypass Pai/Filho): Ajudante filha de titular pai é PERMITIDA', () => {
    const result = checkEligibility(daughterSister, EnumModalidade.DEMONSTRACAO, EnumFuncao.AJUDANTE, {
        secao: EnumSecao.MINISTERIO,
        partTitle: '4. Iniciando conversas',
        titularGender: 'brother',
        titularPublisherId: 'b1',
    });
    assert.equal(result.eligible, true);
});


