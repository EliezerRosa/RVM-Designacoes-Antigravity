import { useEffect, useMemo, useState } from 'react';
import type { WorkbookPart } from '../../types';

interface Props {
    proposals: WorkbookPart[];
    canApprove: boolean;
    canReject: boolean;
    onApprove: (partId: string) => Promise<void>;
    onReject: (partId: string, reason: string) => Promise<void>;
    busyPartId?: string | null;
    focusedRejectPartId?: string | null;
}

export function ProposalApprovalMicroUi({
    proposals,
    canApprove,
    canReject,
    onApprove,
    onReject,
    busyPartId = null,
    focusedRejectPartId = null
}: Props) {
    const [expandedRejectId, setExpandedRejectId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');

    const visibleProposals = useMemo(() => proposals.slice(0, 3), [proposals]);

    useEffect(() => {
        if (focusedRejectPartId && visibleProposals.some(part => part.id === focusedRejectPartId)) {
            setExpandedRejectId(focusedRejectPartId);
        }
    }, [focusedRejectPartId, visibleProposals]);

    if (visibleProposals.length === 0 || (!canApprove && !canReject)) {
        return null;
    }

    const handleReject = async (partId: string) => {
        const trimmedReason = rejectReason.trim();
        if (!trimmedReason) return;
        await onReject(partId, trimmedReason);
        setRejectReason('');
        setExpandedRejectId(null);
    };

    return (
        <div style={{
            margin: '10px',
            padding: '12px',
            borderRadius: '12px',
            background: 'linear-gradient(180deg, #FFF7ED 0%, #FFFFFF 100%)',
            border: '1px solid #FED7AA',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#9A3412', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Micro-UI de aprovacao
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#431407' }}>
                        {proposals.length} proposta{proposals.length > 1 ? 's' : ''} pendente{proposals.length > 1 ? 's' : ''} na semana em foco
                    </div>
                </div>
                <div style={{ fontSize: '12px', color: '#7C2D12' }}>
                    Fase 1: preview e decisao
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {visibleProposals.map((part) => {
                    const isBusy = busyPartId === part.id;
                    const isRejecting = expandedRejectId === part.id;
                    return (
                        <div key={part.id} style={{
                            background: '#FFFFFF',
                            border: '1px solid #FDBA74',
                            borderRadius: '10px',
                            padding: '10px 12px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>
                                        {part.tipoParte}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#374151', marginTop: '2px' }}>
                                        {part.tituloParte || 'Sem titulo'}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
                                        {part.weekId} • {part.funcao} • {part.resolvedPublisherName || part.rawPublisherName || 'Sem designado'}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                    {canApprove && (
                                        <button
                                            onClick={() => void onApprove(part.id)}
                                            disabled={isBusy}
                                            style={{
                                                border: 'none',
                                                borderRadius: '8px',
                                                padding: '8px 10px',
                                                cursor: isBusy ? 'wait' : 'pointer',
                                                background: '#065F46',
                                                color: '#ECFDF5',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                opacity: isBusy ? 0.7 : 1
                                            }}
                                        >
                                            Aprovar
                                        </button>
                                    )}
                                    {canReject && (
                                        <button
                                            onClick={() => setExpandedRejectId(current => current === part.id ? null : part.id)}
                                            disabled={isBusy}
                                            style={{
                                                border: '1px solid #FCA5A5',
                                                borderRadius: '8px',
                                                padding: '8px 10px',
                                                cursor: isBusy ? 'wait' : 'pointer',
                                                background: '#FEF2F2',
                                                color: '#991B1B',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                opacity: isBusy ? 0.7 : 1
                                            }}
                                        >
                                            Rejeitar
                                        </button>
                                    )}
                                </div>
                            </div>

                            {isRejecting && canReject && (
                                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #FED7AA' }}>
                                    <div style={{ fontSize: '12px', color: '#7F1D1D', marginBottom: '6px' }}>
                                        Fase 2: informe o motivo antes do commit.
                                    </div>
                                    <textarea
                                        value={rejectReason}
                                        onChange={(event) => setRejectReason(event.target.value)}
                                        placeholder="Motivo curto da rejeicao"
                                        rows={2}
                                        style={{
                                            width: '100%',
                                            resize: 'vertical',
                                            borderRadius: '8px',
                                            border: '1px solid #FECACA',
                                            padding: '8px 10px',
                                            fontSize: '12px',
                                            boxSizing: 'border-box',
                                            marginBottom: '8px'
                                        }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ fontSize: '11px', color: '#7C2D12' }}>
                                            Preview: a parte volta para pendente e a designacao atual sera removida.
                                        </div>
                                        <button
                                            onClick={() => void handleReject(part.id)}
                                            disabled={isBusy || !rejectReason.trim()}
                                            style={{
                                                border: 'none',
                                                borderRadius: '8px',
                                                padding: '8px 10px',
                                                cursor: isBusy || !rejectReason.trim() ? 'not-allowed' : 'pointer',
                                                background: '#B91C1C',
                                                color: '#FEF2F2',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                opacity: isBusy || !rejectReason.trim() ? 0.6 : 1
                                            }}
                                        >
                                            Confirmar rejeicao
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {proposals.length > visibleProposals.length && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#9A3412' }}>
                    Mais {proposals.length - visibleProposals.length} proposta(s) aguardam contexto ou uma proxima iteracao da micro-UI.
                </div>
            )}
        </div>
    );
}