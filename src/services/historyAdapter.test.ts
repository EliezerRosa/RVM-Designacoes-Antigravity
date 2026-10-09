import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkbookPart } from '../types';
import { isLiveParticipationStatus, partsToHistoryRecords } from './historyAdapter';

const base: WorkbookPart = {
    id: 'p1', weekId: '2026-30', weekDisplay: 'Semana 30', date: '2026-08-10', section: 'Tesouros da Palavra de Deus',
    tipoParte: 'Discurso Tesouros', modalidade: 'Discurso de Ensino', tituloParte: 'Discurso', descricaoParte: '', detalhesParte: '',
    seq: 1, funcao: 'Titular', duracao: '10 min', horaInicio: '', horaFim: '', rawPublisherName: '',
    resolvedPublisherId: 'pub-1', resolvedPublisherName: 'Fulano', status: 'PROPOSTA', createdAt: '2026-08-01T00:00:00Z',
} as WorkbookPart;

test('M-6: só status vivos viram participação (CANCELADA/REJEITADA ficam fora do histórico do motor)', () => {
    const parts: WorkbookPart[] = [
        base,
        { ...base, id: 'p2', status: 'DESIGNADA' as any },
        { ...base, id: 'p3', status: 'CONCLUIDA' as any },
        { ...base, id: 'p4', status: 'CANCELADA' as any },
        { ...base, id: 'p5', status: 'REJEITADA' as any },
    ];

    assert.deepEqual(partsToHistoryRecords(parts).map(r => r.id), ['p1', 'p2', 'p3']);
    assert.equal(isLiveParticipationStatus('cancelada'), false);
    assert.equal(isLiveParticipationStatus(undefined), true);
});
