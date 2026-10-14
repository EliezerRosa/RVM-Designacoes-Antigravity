import test from 'node:test';
import assert from 'node:assert/strict';
import type { Publisher } from '../types';
import {
    buildUpcomingAssignmentsSummary,
    isRealUpcomingAssignment,
} from './publisherUpcomingAssignmentsService';

test('isRealUpcomingAssignment - descarta partes secundárias/automáticas implícitas do presidente e cânticos', () => {
    // Partes que NÃO devem ser relacionadas no resumo
    assert.equal(isRealUpcomingAssignment('Oração Inicial'), false, 'Oração Inicial deve ser descartada');
    assert.equal(isRealUpcomingAssignment('Oracao Inicial'), false, 'Oracao Inicial sem acento deve ser descartada');
    assert.equal(isRealUpcomingAssignment('Comentários Iniciais'), false, 'Comentários Iniciais deve ser descartado');
    assert.equal(isRealUpcomingAssignment('Comentarios Iniciais'), false, 'Comentarios Iniciais sem acento deve ser descartado');
    assert.equal(isRealUpcomingAssignment('Elogios e Conselhos'), false, 'Elogios e Conselhos deve ser descartado');
    assert.equal(isRealUpcomingAssignment('elogios e conselhos'), false, 'Elogios e conselhos minúsculo deve ser descartado');
    assert.equal(isRealUpcomingAssignment('Comentários Finais'), false, 'Comentários Finais deve ser descartado');
    assert.equal(isRealUpcomingAssignment('Comentarios Finais'), false, 'Comentarios Finais sem acento deve ser descartado');
    assert.equal(isRealUpcomingAssignment('Cântico Inicial'), false, 'Cântico Inicial deve ser descartado');
    assert.equal(isRealUpcomingAssignment('Cântico do Meio'), false, 'Cântico do Meio deve ser descartado');
    assert.equal(isRealUpcomingAssignment('Cântico Final'), false, 'Cântico Final deve ser descartado');
    assert.equal(isRealUpcomingAssignment(''), false, 'Vazio deve ser descartado');
    assert.equal(isRealUpcomingAssignment(null), false, 'Null deve ser descartado');

    // Partes REAIS que DEVEM ser relacionadas
    assert.equal(isRealUpcomingAssignment('Presidente'), true, 'Presidente é a designação principal e deve ser relacionada');
    assert.equal(isRealUpcomingAssignment('Necessidades Locais'), true, 'Necessidades Locais deve ser relacionada');
    assert.equal(isRealUpcomingAssignment('Discurso Tesouros'), true, 'Discurso Tesouros deve ser relacionado');
    assert.equal(isRealUpcomingAssignment('Joias Espirituais'), true, 'Joias Espirituais deve ser relacionada');
    assert.equal(isRealUpcomingAssignment('Leitura da Bíblia'), true, 'Leitura da Bíblia deve ser relacionada');
    assert.equal(isRealUpcomingAssignment('Iniciando Conversas'), true, 'Iniciando Conversas deve ser relacionada');
    assert.equal(isRealUpcomingAssignment('Cultivando o Interesse'), true, 'Cultivando o Interesse deve ser relacionada');
    assert.equal(isRealUpcomingAssignment('Fazendo Discípulos'), true, 'Fazendo Discípulos deve ser relacionada');
    assert.equal(isRealUpcomingAssignment('Explicando Suas Crenças'), true, 'Explicando Suas Crenças deve ser relacionada');
    assert.equal(isRealUpcomingAssignment('Dirigente EBC'), true, 'Dirigente EBC deve ser relacionado');
    assert.equal(isRealUpcomingAssignment('Leitor EBC'), true, 'Leitor EBC deve ser relacionado');
    assert.equal(isRealUpcomingAssignment('Oração Final'), true, 'Oração Final é designação manual para outro varão e deve ser relacionada');
});

test('buildUpcomingAssignmentsSummary - returns null when publisher has less than 2 published parts', async () => {
    // Test with dummy publisher id that has no parts in DB
    const dummyPublisher: Publisher = {
        id: 'non-existent-pub-999',
        name: 'Publicador Teste Inexistente',
        gender: 'brother',
        condition: 'Publicador',
        funcao: null,
        phone: '5511999999999',
        isBaptized: true,
        isServing: true,
        ageGroup: 'Adulto',
        parentIds: [],
        isHelperOnly: false,
        canPairWithNonParent: true,
        privileges: {
            canGiveTalks: false,
            canConductCBS: false,
            canReadCBS: false,
            canPray: false,
            canPreside: false,
        },
        privilegesBySection: {
            canParticipateInTreasures: false,
            canParticipateInMinistry: true,
            canParticipateInLife: false,
        },
        availability: { mode: 'always', exceptionDates: [], availableDates: [] },
        aliases: [],
    };

    const result = await buildUpcomingAssignmentsSummary(dummyPublisher.id, [dummyPublisher]);
    assert.equal(result, null, 'Deve retornar null quando houver menos que 2 designações');
});
