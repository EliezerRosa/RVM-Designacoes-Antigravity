/**
 * WorkbookTable — Tabela de partes com paginação por semana
 * Extraído de WorkbookManager.tsx (Fase 5C da Auditoria)
 */

import type { WorkbookPart, Publisher, HistoryRecord } from '../types';
import { PublisherSelect } from './PublisherSelect';
import { Tooltip } from './Tooltip';
import { getStatusConfig } from '../constants/status';

/** Cores por seção da reunião */
const SECTION_COLORS: Record<string, string> = {
    'Início da Reunião': '#E0E7FF',
    'Tesouros da Palavra de Deus': '#D1FAE5',
    'Faça Seu Melhor no Ministério': '#FEF3C7',
    'Nossa Vida Cristã': '#FEE2E2',
    'Final da Reunião': '#E0E7FF',
};

/** Verifica se a data da parte é de uma semana passada */
const isPartInPastWeek = (partDate: string): boolean => {
    if (!partDate) return false;
    let dateObj: Date;
    if (partDate.match(/^\d{4}-\d{2}-\d{2}/)) {
        dateObj = new Date(partDate + 'T12:00:00');
    } else {
        const dmy = partDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (dmy) {
            dateObj = new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T12:00:00`);
        } else {
            dateObj = new Date(partDate);
        }
    }
    if (isNaN(dateObj.getTime())) return false;
    const now = new Date();
    const startOfThisWeek = new Date(now);
    const dayOfWeek = startOfThisWeek.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startOfThisWeek.setDate(startOfThisWeek.getDate() - diff);
    startOfThisWeek.setHours(0, 0, 0, 0);
    return dateObj < startOfThisWeek;
};

interface WorkbookTableProps {
    filteredParts: WorkbookPart[];
    publishers: Publisher[];
    historyRecords: HistoryRecord[];
    currentPage: number;
    onPublisherSelect: (partId: string, newId: string, newName: string) => void;
    onEditPart: (part: WorkbookPart) => void;
}

export function WorkbookTable({
    filteredParts,
    publishers,
    historyRecords,
    currentPage,
    onPublisherSelect,
    onEditPart,
}: WorkbookTableProps) {
    // Paginação por semana
    const currentFilteredWeeks = [...new Set(filteredParts.map(p => p.weekId))].sort().reverse();
    const totalPages = currentFilteredWeeks.length || 1;
    const safePage = Math.min(Math.max(currentPage, 1), totalPages);
    const targetWeekId = currentFilteredWeeks[safePage - 1];
    const partsToRender = targetWeekId ? filteredParts.filter(p => p.weekId === targetWeekId) : [];

    return (
        <div style={{ overflowX: 'auto', maxHeight: '80vh', overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr style={{ background: '#4F46E5', color: 'white' }}>
                        <th style={{ padding: '6px', minWidth: '80px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }}>Semana</th>
                        <th style={{ padding: '6px', minWidth: '60px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }}>Seção</th>
                        <th style={{ padding: '6px', minWidth: '80px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }}>TipoParte</th>
                        <th style={{ padding: '6px', width: '80px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }}>Modalidade</th>
                        <th style={{ padding: '6px', minWidth: '150px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }}>TituloParte</th>
                        <th style={{ padding: '6px', width: '40px', textAlign: 'center', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }} title="Descrição da Parte">📝</th>
                        <th style={{ padding: '6px', width: '40px', textAlign: 'center', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }} title="Detalhes da Parte">ℹ️</th>
                        <th style={{ padding: '6px', minWidth: '100px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }}>Horário</th>
                        <th style={{ padding: '6px', width: '60px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }}>Função</th>
                        <th style={{ padding: '6px', width: '15%', minWidth: '140px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }}>Publicador</th>
                        <th style={{ padding: '6px', width: '80px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }}>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {partsToRender.map(part => {
                        let displayRaw = part.resolvedPublisherName || part.rawPublisherName || '';
                        let currentPubId = part.resolvedPublisherId || '';

                        // Prioridade 1: Se temos ID, buscamos o nome atualizado na lista oficial
                        if (currentPubId) {
                            const found = publishers.find(p => p.id === currentPubId);
                            if (found) {
                                displayRaw = found.name;
                            }
                        }
                        // Prioridade 2: Se não temos ID mas temos nome, tentamos o ID via nome (retrocompatibilidade)
                        else if (displayRaw) {
                            const found = publishers.find(p => p.name.trim().toLowerCase() === displayRaw.trim().toLowerCase());
                            if (found) {
                                currentPubId = found.id;
                            }
                        }
                        const isPast = isPartInPastWeek(part.date);

                        return (
                            <tr
                                key={part.id}
                                data-part-id={part.id}
                                style={{
                                    background: SECTION_COLORS[part.section] || 'white',
                                    color: '#1f2937',
                                    borderLeft: isPast ? '3px solid #9CA3AF' : 'none'
                                }}
                                title={isPast ? '📅 Semana passada' : ''}
                            >
                                <td style={{ padding: '4px', color: '#1f2937', fontWeight: '500' }}>
                                    <div style={{ fontSize: '10px', color: '#6B7280', marginBottom: '2px' }}>{part.year}</div>
                                    <div>{part.weekDisplay}</div>
                                </td>
                                <td style={{ padding: '4px', fontSize: '11px', color: '#374151', fontWeight: '500' }}>{part.section}</td>
                                <td style={{ padding: '4px', color: '#1f2937', fontWeight: '500' }}>{part.tipoParte}</td>
                                <td style={{ padding: '4px', fontSize: '11px', color: '#6B7280' }}>
                                    {part.modalidade}
                                </td>
                                <td style={{ padding: '4px' }}>
                                    <div style={{ fontWeight: '500', color: '#1f2937', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={part.tituloParte}>{part.tituloParte}</div>
                                </td>
                                <td style={{ padding: '4px', textAlign: 'center' }}>
                                    {part.descricaoParte && (
                                        <Tooltip content={part.descricaoParte}>
                                            <span style={{ cursor: 'help', fontSize: '14px' }}>📝</span>
                                        </Tooltip>
                                    )}
                                </td>
                                <td style={{ padding: '4px', textAlign: 'center' }}>
                                    {part.detalhesParte && (
                                        <Tooltip content={part.detalhesParte}>
                                            <span style={{ cursor: 'help', fontSize: '14px' }}>ℹ️</span>
                                        </Tooltip>
                                    )}
                                </td>
                                <td style={{ padding: '4px', textAlign: 'center', fontSize: '11px', color: '#6B7280' }}>
                                    <div>{part.horaInicio} - {part.horaFim}</div>
                                    <div style={{ fontSize: '10px', color: '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                        ({part.duracao || '?'})
                                        {(!part.duracao || parseInt(String(part.duracao)) <= 0) && part.funcao === 'Titular' && (
                                            <Tooltip content="⚠️ Duração não definida para esta parte de Titular">
                                                <span style={{ cursor: 'help', color: '#F59E0B', fontSize: '12px' }}>⚠️</span>
                                            </Tooltip>
                                        )}
                                    </div>
                                </td>
                                <td style={{ padding: '4px', color: '#1f2937', fontWeight: '500' }}>{part.funcao}</td>
                                <td style={{ padding: '8px' }}>
                                    <PublisherSelect
                                        part={part}
                                        publishers={publishers}
                                        value={currentPubId}
                                        displayName={displayRaw}
                                        onChange={(newId, newName) => onPublisherSelect(part.id, newId, newName)}
                                        weekParts={partsToRender}
                                        allParts={filteredParts}
                                        history={historyRecords}
                                        style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: '4px', padding: '4px', fontSize: '13px' }}
                                    />
                                </td>
                                <td style={{ padding: '4px', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                        <StatusBadge part={part} />
                                        <button
                                            onClick={() => onEditPart(part)}
                                            className="text-gray-400 hover:text-blue-600 transition-colors"
                                            title="Editar Parte"
                                            style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                                        >
                                            ✏️
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/** Badge de status com animação de eventos */
function StatusBadge({ part }: { part: WorkbookPart }) {
    const config = getStatusConfig(part.status);
    const isCancelled = part.status === 'CANCELADA';
    const hasEventImpact = !!part.affectedByEventId;
    const hasPendingEvent = !!part.pendingEventId;
    const isCreatedByEvent = !!part.createdByEventId;

    let animationStyle = {};
    let eventIcon = '';
    let eventTitle = '';

    if (hasEventImpact || isCancelled) {
        animationStyle = { animation: 'blink-red 1.5s ease-in-out infinite' };
        eventIcon = '⚡';
        eventTitle = 'Afetado por Evento Especial (Aplicado)';
    } else if (hasPendingEvent) {
        animationStyle = { animation: 'blink-yellow 1.2s ease-in-out infinite' };
        eventIcon = '⏳';
        eventTitle = 'Evento Pendente - Será afetado quando aplicado';
    } else if (isCreatedByEvent) {
        animationStyle = { animation: 'blink-blue 1.5s ease-in-out infinite' };
        eventIcon = '✨';
        eventTitle = 'Parte criada por Evento Especial';
    }

    const badge = (
        <span style={{
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '11px',
            background: config.bg,
            color: config.text,
            border: `1px solid ${config.border}`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontWeight: '600',
            cursor: isCancelled && part.cancelReason ? 'help' : 'default',
            ...animationStyle,
        }}>
            {eventIcon && <span title={eventTitle}>{eventIcon}</span>}
            {config.icon} {config.label}
        </span>
    );

    if (isCancelled && part.cancelReason) {
        return (
            <Tooltip content={
                <div style={{ padding: '4px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>🚫 Parte Cancelada</div>
                    <div style={{ fontSize: '12px' }}>Motivo: {part.cancelReason}</div>
                </div>
            }>
                {badge}
            </Tooltip>
        );
    }
    if (hasPendingEvent) {
        return (
            <Tooltip content={
                <div style={{ padding: '4px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>⏳ Evento Pendente</div>
                    <div style={{ fontSize: '12px' }}>Esta parte será afetada quando o evento for aplicado</div>
                </div>
            }>
                {badge}
            </Tooltip>
        );
    }
    return badge;
}
