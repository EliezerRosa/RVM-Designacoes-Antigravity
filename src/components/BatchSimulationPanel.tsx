/**
 * BatchSimulationPanel.tsx - Painel de Designações em Lote
 * 
 * Exibe lista de designações simuladas para confirmação em lote.
 * v9.2: Suporte a designação coletiva via Agente IA
 */

import { useState } from 'react';
import type { BatchSimulationResult } from '../services/agentActionService';

interface Props {
    batchResult: BatchSimulationResult;
    onConfirmAll: () => void;
    onConfirmSelected: (partIds: string[]) => void;
    onCancelAll: () => void;
    isCommitting?: boolean;
}

export default function BatchSimulationPanel({
    batchResult,
    onConfirmAll,
    onConfirmSelected,
    onCancelAll,
    isCommitting = false
}: Props) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
        // Por padrão, todos estão selecionados
        const ids = new Set<string>();
        batchResult.results.forEach(r => {
            if (r.affectedParts?.[0]?.id) {
                ids.add(r.affectedParts[0].id);
            }
        });
        return ids;
    });

    const toggleSelection = (partId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(partId)) {
                next.delete(partId);
            } else {
                next.add(partId);
            }
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedIds.size === batchResult.results.length) {
            setSelectedIds(new Set());
        } else {
            const all = new Set<string>();
            batchResult.results.forEach(r => {
                if (r.affectedParts?.[0]?.id) {
                    all.add(r.affectedParts[0].id);
                }
            });
            setSelectedIds(all);
        }
    };

    const handleConfirmSelected = () => {
        onConfirmSelected(Array.from(selectedIds));
    };

    const allSelected = selectedIds.size === batchResult.results.length;
    const anySelected = selectedIds.size > 0;

    return (
        <div style={{
            background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
            borderTop: '2px solid #6366F1',
            padding: '16px',
            maxHeight: '300px',
            overflowY: 'auto'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
            }}>
                <div>
                    <h4 style={{ margin: 0, color: '#312E81', fontSize: '14px' }}>
                        📋 Designações em Lote - {batchResult.weekId}
                    </h4>
                    <span style={{ fontSize: '12px', color: '#4F46E5' }}>
                        {batchResult.results.length} designações • {batchResult.skipped.length} puladas
                    </span>
                </div>
                <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    color: '#4338CA',
                    cursor: 'pointer'
                }}>
                    <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        disabled={isCommitting}
                    />
                    Selecionar Todas
                </label>
            </div>

            {/* Lista de Designações */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginBottom: '12px'
            }}>
                {batchResult.results.map((result, idx) => {
                    const part = result.affectedParts?.[0];
                    if (!part) return null;
                    const isSelected = selectedIds.has(part.id);

                    return (
                        <div
                            key={part.id || idx}
                            onClick={() => !isCommitting && toggleSelection(part.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '8px 12px',
                                background: isSelected ? '#FFFFFF' : '#F5F5F5',
                                borderRadius: '8px',
                                border: isSelected ? '2px solid #6366F1' : '1px solid #E5E7EB',
                                cursor: isCommitting ? 'not-allowed' : 'pointer',
                                opacity: isCommitting ? 0.7 : 1,
                                transition: 'all 0.2s'
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelection(part.id)}
                                disabled={isCommitting}
                                onClick={(e) => e.stopPropagation()}
                            />
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontSize: '13px',
                                    fontWeight: '500',
                                    color: '#1F2937'
                                }}>
                                    {part.tituloParte || part.tipoParte}
                                </div>
                                <div style={{ fontSize: '11px', color: '#6B7280' }}>
                                    {part.section}
                                </div>
                            </div>
                            <div style={{
                                fontSize: '13px',
                                fontWeight: '600',
                                color: '#4F46E5'
                            }}>
                                → {part.resolvedPublisherName}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Partes Puladas */}
            {batchResult.skipped.length > 0 && (
                <div style={{
                    marginBottom: '12px',
                    padding: '8px',
                    background: '#FEF3C7',
                    borderRadius: '6px'
                }}>
                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#92400E', marginBottom: '4px' }}>
                        ⚠️ Partes sem designação:
                    </div>
                    {batchResult.skipped.slice(0, 5).map((s, idx) => (
                        <div key={idx} style={{ fontSize: '11px', color: '#B45309' }}>
                            • {s.partTitle}: {s.reason}
                        </div>
                    ))}
                    {batchResult.skipped.length > 5 && (
                        <div style={{ fontSize: '11px', color: '#B45309', fontStyle: 'italic' }}>
                            ... e mais {batchResult.skipped.length - 5}
                        </div>
                    )}
                </div>
            )}

            {/* Botões de Ação */}
            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    onClick={onConfirmAll}
                    disabled={isCommitting || batchResult.results.length === 0}
                    style={{
                        flex: 1,
                        padding: '10px',
                        background: isCommitting ? '#9CA3AF' : '#4F46E5',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 'bold',
                        fontSize: '13px',
                        cursor: isCommitting ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                    }}
                >
                    {isCommitting ? '⏳ Salvando...' : `✅ Confirmar Todas (${batchResult.results.length})`}
                </button>
                {selectedIds.size !== batchResult.results.length && anySelected && (
                    <button
                        onClick={handleConfirmSelected}
                        disabled={isCommitting}
                        style={{
                            flex: 1,
                            padding: '10px',
                            background: '#10B981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 'bold',
                            fontSize: '13px',
                            cursor: isCommitting ? 'not-allowed' : 'pointer'
                        }}
                    >
                        ✓ Confirmar Selecionadas ({selectedIds.size})
                    </button>
                )}
                <button
                    onClick={onCancelAll}
                    disabled={isCommitting}
                    style={{
                        padding: '10px 16px',
                        background: 'white',
                        color: '#6B7280',
                        border: '1px solid #D1D5DB',
                        borderRadius: '8px',
                        fontWeight: '500',
                        fontSize: '13px',
                        cursor: isCommitting ? 'not-allowed' : 'pointer'
                    }}
                >
                    Cancelar
                </button>
            </div>
        </div>
    );
}
