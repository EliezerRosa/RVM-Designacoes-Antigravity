/**
 * TiedAlternativesPicker — micro-UI #4 do pacote 2026-04-30
 *
 * Botão "≈" (equivalentes) que, ao clicar, abre popover com a lista de candidatos
 * EMPATADOS no score máximo para uma parte. Permite ao usuário escolher um
 * alternativo sem viés do desempate alfabético do motor.
 *
 * Sob demanda recalcula getRankedCandidates(); não persiste pool — derivado da hora.
 *
 * Onde plugar: ao lado do <PublisherSelect> em WorkbookTable, dentro da coluna
 * Publicador. Só aparece se houver ≥2 candidatos no top-score (=empate real).
 */

import React, { useMemo, useState } from 'react';
import type { WorkbookPart, Publisher, HistoryRecord } from '../types';
import { getRankedCandidates, type RankedCandidate } from '../services/unifiedRotationService';
void React;

interface Props {
    part: WorkbookPart;
    publishers: Publisher[];
    historyRecords: HistoryRecord[];
    currentName: string;
    onSelect: (publisherId: string, publisherName: string) => void;
}

export function TiedAlternativesPicker({
    part,
    publishers,
    historyRecords,
    currentName,
    onSelect,
}: Props) {
    const [open, setOpen] = useState(false);

    const { topPool, topScore } = useMemo(() => {
        // Filtra apenas publicadores SERVING — alinhado com o motor real.
        // (Elegibilidade fina é feita por getRankedCandidates via calculateScore +
        // partType. Aqui passamos o universo SERVING.)
        const serving = publishers.filter(p => (p as any).isServing !== false);
        if (serving.length === 0) return { topPool: [] as RankedCandidate[], topScore: 0 };
        const refDate = part.date ? new Date(part.date + 'T12:00:00') : new Date();
        // Filtra a própria semana do histórico para não contar a designação atual.
        const histForRanking = historyRecords.filter(h => h.weekId !== part.weekId);
        const ranked = getRankedCandidates(serving, part.tipoParte, histForRanking, undefined, refDate);
        if (ranked.length === 0) return { topPool: [], topScore: 0 };
        const top = ranked[0].scoreData.score;
        const pool = ranked.filter(r => r.scoreData.score === top);
        return { topPool: pool, topScore: top };
    }, [open, part.id, publishers, historyRecords]);

    if (topPool.length < 2) return null; // sem empate, não mostra nada

    return (
        <div style={{ position: 'relative', display: 'inline-block', marginLeft: 4 }}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                title={`${topPool.length} publicadores empatados em score=${topScore}. Clique para escolher um equivalente.`}
                style={{
                    border: '1px solid #C18626',
                    background: '#FFF8E1',
                    color: '#7A5A00',
                    borderRadius: 4,
                    cursor: 'pointer',
                    padding: '2px 6px',
                    fontSize: 11,
                    fontWeight: 700,
                }}
            >
                ≈ {topPool.length}
            </button>
            {open && (
                <div
                    role="dialog"
                    aria-label="Alternativas com score equivalente"
                    style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: 4,
                        background: 'white',
                        border: '1px solid #E5E7EB',
                        borderRadius: 6,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                        zIndex: 50,
                        minWidth: 220,
                        padding: 8,
                    }}
                    onClick={e => e.stopPropagation()}
                >
                    <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 6 }}>
                        Equivalentes (score {topScore})
                    </div>
                    {topPool.map(({ publisher }) => {
                        const isCurrent = publisher.name === currentName;
                        return (
                            <button
                                key={publisher.id}
                                type="button"
                                onClick={() => {
                                    if (!isCurrent) onSelect(publisher.id, publisher.name);
                                    setOpen(false);
                                }}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '6px 8px',
                                    border: 'none',
                                    background: isCurrent ? '#FEF3C7' : 'transparent',
                                    color: isCurrent ? '#92400E' : '#1F2937',
                                    fontWeight: isCurrent ? 600 : 400,
                                    cursor: isCurrent ? 'default' : 'pointer',
                                    borderRadius: 4,
                                    fontSize: 12,
                                }}
                            >
                                {isCurrent ? '✓ ' : '  '}
                                {publisher.name}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
