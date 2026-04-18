import test from 'node:test';
import assert from 'node:assert/strict';
import { EnumFuncao, type Publisher } from '../types';
import { createUnifiedActionContextService } from './unifiedActionContextServiceCore';

const publishers = [
    { id: 'pub-1', name: 'Carlos Dias', gender: 'brother' },
    { id: 'pub-2', name: 'Maria Souza', gender: 'sister' },
] as Publisher[];

test('resolvePublisherByName matches an exact publisher name ignoring case and whitespace', async () => {
    const service = createUnifiedActionContextService({
        publisherDirectoryReader: {
            loadAllPublishers: async () => publishers,
        },
        partContextReader: {
            getPartEligibilityRecord: async () => null,
            getWeekTitulares: async () => [],
        },
    });

    const publisher = await service.resolvePublisherByName('  carlos dias ');

    assert.equal(publisher?.id, 'pub-1');
});

test('buildEligibilityContext derives helper context and titular gender through the boundary', async () => {
    const service = createUnifiedActionContextService({
        publisherDirectoryReader: {
            loadAllPublishers: async () => publishers,
        },
        partContextReader: {
            getPartEligibilityRecord: async partId => {
                assert.equal(partId, 'part-1');
                return {
                    weekId: '2026-05-08',
                    tipoParte: 'Primeira Conversa',
                    modalidade: 'Demonstração',
                    date: '2026-05-08',
                    section: 'Faça Seu Melhor',
                    funcao: 'Ajudante',
                    partTitle: '5. Primeira Conversa - Ajudante',
                };
            },
            getWeekTitulares: async weekId => {
                assert.equal(weekId, '2026-05-08');
                return [{
                    partTitle: '5. Primeira Conversa',
                    resolvedPublisherName: 'Maria Souza',
                }];
            },
        },
    });

    const result = await service.buildEligibilityContext('part-1', 'Carlos Dias');

    assert.equal(result.publisher.id, 'pub-1');
    assert.equal(result.context.funcao, EnumFuncao.AJUDANTE);
    assert.equal(result.context.date, '2026-05-08');
    assert.equal(result.context.secao, 'Faça Seu Melhor');
    assert.equal(result.context.titularGender, 'sister');
});