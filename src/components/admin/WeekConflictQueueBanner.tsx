import React, { useState } from 'react';
import type { Publisher, WorkbookPart } from '../../types';
import { reassignParts } from '../../services/reassignmentService';
import { supabase } from '../../lib/supabase';

export interface WeekConflictQueueBannerProps {
    weekId: string;
    conflictParts: WorkbookPart[];
    publishers: Publisher[];
    allParts: WorkbookPart[];
    onPartsRefresh?: () => Promise<void> | void;
    onDismissConflict?: (partId: string) => void;
}

export const WeekConflictQueueBanner: React.FC<WeekConflictQueueBannerProps> = ({
    weekId,
    conflictParts,
    publishers,
    allParts,
    onPartsRefresh,
    onDismissConflict,
}) => {
    const [isReassigning, setIsReassigning] = useState(false);
    const [isDismissing, setIsDismissing] = useState(false);

    if (!conflictParts || conflictParts.length === 0) {
        return null;
    }

    const handleAutoReassignAll = async () => {
        setIsReassigning(true);
        try {
            const partIds = conflictParts.map(p => p.id);
            const result = await reassignParts(partIds, publishers, allParts, {
                applyEngineRules: true,
                onPartsRefresh,
            });

            if (result.success) {
                alert(`✅ ${result.partsGenerated} parte(s) reatribuída(s) com sucesso com base nas regras do motor!`);
                if (onPartsRefresh) await onPartsRefresh();
            } else {
                const warnMsg = result.warnings?.length ? `\nAvisos:\n${result.warnings.join('\n')}` : '';
                alert(`⚠️ Reatribuição parcial: ${result.partsGenerated} reatribuída(s).${warnMsg}`);
                if (onPartsRefresh) await onPartsRefresh();
            }
        } catch (err) {
            console.error('[WeekConflictQueueBanner] Erro ao reatribuir partes:', err);
            const msg = err instanceof Error ? err.message : String(err);
            alert(`Falha ao reatribuir: ${msg}`);
        } finally {
            setIsReassigning(false);
        }
    };

    const handleDismissPart = async (partId: string) => {
        try {
            await supabase.rpc('clear_part_reassignment_flag', { p_part_id: partId });
        } catch (err) {
            console.warn('[WeekConflictQueueBanner] Erro ao dispensar flag via RPC:', err);
        }
        if (onDismissConflict) {
            onDismissConflict(partId);
        }
    };

    const handleDismissAll = async () => {
        setIsDismissing(true);
        try {
            for (const part of conflictParts) {
                try {
                    await supabase.rpc('clear_part_reassignment_flag', { p_part_id: part.id });
                } catch (rpcErr) {
                    console.warn('[WeekConflictQueueBanner] RPC error:', rpcErr);
                }
                if (onDismissConflict) {
                    onDismissConflict(part.id);
                }
            }
            if (onPartsRefresh) await onPartsRefresh();
        } catch (err) {
            console.error('[WeekConflictQueueBanner] Erro ao dispensar flags:', err);
        } finally {
            setIsDismissing(false);
        }
    };

    return (
        <div
            style={{
                marginBottom: '14px',
                padding: '12px 16px',
                background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                border: '1px solid #F59E0B',
                borderRadius: '8px',
                boxShadow: '0 2px 4px rgba(245, 158, 11, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>⚠️</span>
                    <div>
                        <strong style={{ color: '#92400E', fontSize: '14px' }}>
                            Fila de Conflitos de Disponibilidade na Semana ({conflictParts.length} parte{conflictParts.length > 1 ? 's' : ''} pendente{conflictParts.length > 1 ? 's' : ''})
                        </strong>
                        <div style={{ color: '#B45309', fontSize: '12px' }}>
                            Publicador(es) designado(s) informaram ausência/indisponibilidade no Holy Grounds ou pelo Portal.
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                        type="button"
                        onClick={handleAutoReassignAll}
                        disabled={isReassigning || isDismissing}
                        style={{
                            background: '#D97706',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '5px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: isReassigning ? 'wait' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                        }}
                    >
                        {isReassigning ? '⚡ Reatribuindo…' : `⚡ Reatribuir Tudo (${conflictParts.length})`}
                    </button>
                    <button
                        type="button"
                        onClick={handleDismissAll}
                        disabled={isReassigning || isDismissing}
                        style={{
                            background: 'transparent',
                            color: '#92400E',
                            border: '1px solid #D97706',
                            borderRadius: '5px',
                            padding: '6px 10px',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: isDismissing ? 'wait' : 'pointer',
                        }}
                        title="Mantém a designação e dispensa o alerta (soberania do operador M-11)"
                    >
                        {isDismissing ? 'Dispensando…' : '👁️ Manter / Dispensar Alertas'}
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '4px' }}>
                {conflictParts.map(part => {
                    const pubName = part.resolvedPublisherName || part.rawPublisherName || 'Publicador não definido';
                    const reason = part.reassignmentReason || part.reassignment_reason || 'Publicador indisponível nesta data';

                    return (
                        <div
                            key={part.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: '#FFFFFF',
                                border: '1px solid #FDE68A',
                                borderRadius: '6px',
                                padding: '6px 10px',
                                fontSize: '12px',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 600, color: '#1F2937' }}>{part.tipoParte} ({part.funcao}):</span>
                                <span style={{ color: '#DC2626', fontWeight: 600 }}>{pubName}</span>
                                <span style={{ color: '#6B7280', fontSize: '11px' }}>— {reason}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    type="button"
                                    onClick={() => handleDismissPart(part.id)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#9CA3AF',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        padding: '2px 4px',
                                    }}
                                    title="Dispensar este alerta mantendo o irmão atual"
                                >
                                    ✕ Dispensar
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
