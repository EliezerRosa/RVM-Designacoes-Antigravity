import test from 'node:test';
import assert from 'node:assert/strict';

import { validateWeekAgainstTemplate } from './s140Template';
import { EnumSecao } from '../types';

type ValidationPart = {
    tipoParte: string;
    section: string;
    funcao: string;
    seq: number;
};

function buildBaseWeek(): ValidationPart[] {
    return [
        { tipoParte: 'Presidente', section: EnumSecao.INICIO_REUNIAO, funcao: 'Titular', seq: 1 },
        { tipoParte: 'Cântico Inicial', section: EnumSecao.INICIO_REUNIAO, funcao: 'Titular', seq: 2 },
        { tipoParte: 'Oração Inicial', section: EnumSecao.INICIO_REUNIAO, funcao: 'Titular', seq: 3 },
        { tipoParte: 'Comentários Iniciais', section: EnumSecao.INICIO_REUNIAO, funcao: 'Titular', seq: 4 },
        { tipoParte: 'Discurso Tesouros', section: EnumSecao.TESOUROS, funcao: 'Titular', seq: 5 },
        { tipoParte: 'Joias Espirituais', section: EnumSecao.TESOUROS, funcao: 'Titular', seq: 6 },
        { tipoParte: 'Leitura da Bíblia', section: EnumSecao.TESOUROS, funcao: 'Titular', seq: 7 },
        { tipoParte: 'Cântico do Meio', section: EnumSecao.VIDA_CRISTA, funcao: 'Titular', seq: 8 },
        { tipoParte: 'Dirigente EBC', section: EnumSecao.VIDA_CRISTA, funcao: 'Titular', seq: 9 },
        { tipoParte: 'Leitor EBC', section: EnumSecao.VIDA_CRISTA, funcao: 'Titular', seq: 10 },
        { tipoParte: 'Comentários Finais', section: EnumSecao.FINAL_REUNIAO, funcao: 'Titular', seq: 11 },
        { tipoParte: 'Oração Final', section: EnumSecao.FINAL_REUNIAO, funcao: 'Titular', seq: 12 },
        { tipoParte: 'Cântico Final', section: EnumSecao.FINAL_REUNIAO, funcao: 'Titular', seq: 13 },
    ];
}

test('validateWeekAgainstTemplate ignores legitimate repeated ministry and generated parts', () => {
    const parts: ValidationPart[] = [
        ...buildBaseWeek(),
        { tipoParte: 'Iniciando Conversas', section: EnumSecao.MINISTERIO, funcao: 'Titular', seq: 20 },
        { tipoParte: 'Iniciando Conversas', section: EnumSecao.MINISTERIO, funcao: 'Ajudante', seq: 21 },
        { tipoParte: 'Iniciando Conversas', section: EnumSecao.MINISTERIO, funcao: 'Titular', seq: 22 },
        { tipoParte: 'Iniciando Conversas', section: EnumSecao.MINISTERIO, funcao: 'Ajudante', seq: 23 },
        { tipoParte: 'Elogios e Conselhos', section: EnumSecao.MINISTERIO, funcao: 'Titular', seq: 24 },
        { tipoParte: 'Elogios e Conselhos', section: EnumSecao.MINISTERIO, funcao: 'Titular', seq: 25 },
        { tipoParte: 'Parte Vida Cristã', section: EnumSecao.VIDA_CRISTA, funcao: 'Titular', seq: 26 },
        { tipoParte: 'Parte Vida Cristã', section: EnumSecao.VIDA_CRISTA, funcao: 'Titular', seq: 27 },
    ];

    const result = validateWeekAgainstTemplate(parts);

    assert.equal(
        result.warnings.some((warning) => warning.includes('Parte possivelmente duplicada')),
        false
    );
});

test('validateWeekAgainstTemplate still warns for unexpected duplicate parts', () => {
    const parts: ValidationPart[] = [
        ...buildBaseWeek(),
        { tipoParte: 'Joias Espirituais', section: EnumSecao.TESOUROS, funcao: 'Titular', seq: 20 },
    ];

    const result = validateWeekAgainstTemplate(parts);

    assert.equal(
        result.warnings.includes('Parte possivelmente duplicada: Joias Espirituais (Titular)'),
        true
    );
});