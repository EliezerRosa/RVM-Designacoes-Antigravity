/**
 * ApprovalPanel - Painel de Aprovação de Designações
 * Permite que anciãos aprovem, rejeitem e monitorem designações agendadas
 */

import { useState, useEffect, useCallback } from 'react';
import { assignmentService } from '../services/assignmentService';
import type { ScheduledAssignment } from '../types';
import { ApprovalStatus } from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface ApprovalPanelProps {
    elderId?: string;
    elderName?: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
    DRAFT: { bg: '#6b7280', text: '#fff', icon: '📝' },
    PENDING_APPROVAL: { bg: '#f59e0b', text: '#000', icon: '⏳' },
    APPROVED: { bg: '#10b981', text: '#fff', icon: '✅' },
    REJECTED: { bg: '#ef4444', text: '#fff', icon: '❌' },
    COMPLETED: { bg: '#3b82f6', text: '#fff', icon: '🏆' },
};

export default function ApprovalPanel({ elderId = 'elder-1', elderName = 'Ancião' }: ApprovalPanelProps) {
    const [assignments, setAssignments] = useState<ScheduledAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'completed'>('pending');
    const [rejectingId, setRejectingId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
    const [stats, setStats] = useState<{ total: number; byStatus: Record<string, number> } | null>(null);

    // Load assignments
    const loadAssignments = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            let data: ScheduledAssignment[];
            if (filter === 'pending') {
                data = await assignmentService.getPending();
            } else if (filter === 'approved') {
                data = await assignmentService.getApproved();
            } else {
                // For 'all' and 'completed', we need to load by week or all
                // For now, load pending + approved
                const [pending, approved] = await Promise.all([
                    assignmentService.getPending(),
                    assignmentService.getApproved(),
                ]);
                data = [...pending, ...approved];
            }
            setAssignments(data);

            // Load stats
            const statsData = await assignmentService.getStats();
            setStats(statsData);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao carregar designações');
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        loadAssignments();
    }, [loadAssignments]);

    // Realtime subscription (optional - for when we have week context)
    useEffect(() => {
        let channel: RealtimeChannel | null = null;

        // For now, we'll just reload on interval since we don't have week context
        const interval = setInterval(() => {
            loadAssignments();
        }, 30000); // Reload every 30 seconds

        return () => {
            clearInterval(interval);
            if (channel) {
                assignmentService.unsubscribe(channel);
            }
        };
    }, [loadAssignments]);

    // Approve assignment
    const handleApprove = async (id: string) => {
        setProcessingIds(prev => new Set(prev).add(id));
        try {
            await assignmentService.approve(id, elderId, elderName);
            await loadAssignments();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao aprovar');
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    // Reject assignment
    const handleReject = async (id: string) => {
        if (!rejectReason.trim()) {
            setError('Motivo da rejeição é obrigatório');
            return;
        }
        setProcessingIds(prev => new Set(prev).add(id));
        try {
            await assignmentService.reject(id, elderId, rejectReason);
            setRejectingId(null);
            setRejectReason('');
            await loadAssignments();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao rejeitar');
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    // Mark as completed
    const handleMarkCompleted = async (ids: string[]) => {
        setProcessingIds(prev => new Set([...prev, ...ids]));
        try {
            await assignmentService.markCompleted(ids);
            await loadAssignments();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao marcar como concluída');
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                ids.forEach(id => next.delete(id));
                return next;
            });
        }
    };

    // Promote to history
    const handlePromoteToHistory = async (ids: string[]) => {
        if (!confirm(`Promover ${ids.length} designação(ões) para o histórico?`)) return;

        setProcessingIds(prev => new Set([...prev, ...ids]));
        try {
            const historyIds = await assignmentService.promoteToHistory(ids);
            alert(`✅ ${historyIds.length} registros criados no histórico`);
            await loadAssignments();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao promover para histórico');
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                ids.forEach(id => next.delete(id));
                return next;
            });
        }
    };

    // Group by week
    const groupedByWeek = assignments.reduce((acc, a) => {
        const week = a.weekId || 'sem-semana';
        if (!acc[week]) acc[week] = [];
        acc[week].push(a);
        return acc;
    }, {} as Record<string, ScheduledAssignment[]>);

    return (
        <div className="approval-panel" style={{ padding: '20px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ margin: 0 }}>📋 Painel de Aprovação</h2>
                    <p style={{ margin: '5px 0 0', color: '#888', fontSize: '0.9em' }}>
                        Gerencie designações pendentes e aprovadas
                    </p>
                </div>
                <button
                    onClick={loadAssignments}
                    style={{
                        background: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                    }}
                >
                    🔄 Atualizar
                </button>
            </div>

            {/* Stats */}
            {stats && (
                <div style={{
                    display: 'flex',
                    gap: '15px',
                    marginBottom: '20px',
                    flexWrap: 'wrap',
                }}>
                    {Object.entries(STATUS_COLORS).map(([status, colors]) => (
                        <div
                            key={status}
                            style={{
                                background: colors.bg,
                                color: colors.text,
                                padding: '10px 15px',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                minWidth: '120px',
                            }}
                        >
                            <span style={{ fontSize: '1.2em' }}>{colors.icon}</span>
                            <div>
                                <div style={{ fontSize: '0.75em', opacity: 0.9 }}>{status.replace('_', ' ')}</div>
                                <div style={{ fontSize: '1.3em', fontWeight: 'bold' }}>
                                    {stats.byStatus[status] || 0}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Filter */}
            <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
                {(['pending', 'approved', 'all'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        style={{
                            background: filter === f ? '#3b82f6' : '#374151',
                            color: '#fff',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                        }}
                    >
                        {f === 'pending' && '⏳ Pendentes'}
                        {f === 'approved' && '✅ Aprovadas'}
                        {f === 'all' && '📋 Todas'}
                    </button>
                ))}
            </div>

            {/* Error */}
            {error && (
                <div style={{
                    background: '#991b1b',
                    color: '#fef2f2',
                    padding: '12px',
                    borderRadius: '8px',
                    marginBottom: '15px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <span>❌ {error}</span>
                    <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
                        ✕
                    </button>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <div className="spinner" style={{ margin: '0 auto 10px' }}></div>
                    <p>Carregando designações...</p>
                </div>
            )}

            {/* Empty state */}
            {!loading && assignments.length === 0 && (
                <div style={{
                    textAlign: 'center',
                    padding: '60px 20px',
                    background: '#1f2937',
                    borderRadius: '12px',
                }}>
                    <div style={{ fontSize: '3em', marginBottom: '10px' }}>📭</div>
                    <h3>Nenhuma designação encontrada</h3>
                    <p style={{ color: '#9ca3af' }}>
                        {filter === 'pending'
                            ? 'Não há designações pendentes de aprovação'
                            : 'Não há designações para exibir'}
                    </p>
                </div>
            )}

            {/* Assignments by week */}
            {!loading && Object.entries(groupedByWeek).map(([week, weekAssignments]) => (
                <div key={week} style={{ marginBottom: '30px' }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '15px',
                        borderBottom: '1px solid #374151',
                        paddingBottom: '10px',
                    }}>
                        <h3 style={{ margin: 0 }}>📅 Semana: {week}</h3>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {weekAssignments.some(a => a.status === ApprovalStatus.APPROVED) && (
                                <button
                                    onClick={() => handleMarkCompleted(
                                        weekAssignments.filter(a => a.status === ApprovalStatus.APPROVED).map(a => a.id)
                                    )}
                                    style={{
                                        background: '#059669',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '0.85em',
                                    }}
                                >
                                    ✓ Marcar Semana Concluída
                                </button>
                            )}
                            {weekAssignments.some(a => a.status === ApprovalStatus.COMPLETED) && (
                                <button
                                    onClick={() => handlePromoteToHistory(
                                        weekAssignments.filter(a => a.status === ApprovalStatus.COMPLETED).map(a => a.id)
                                    )}
                                    style={{
                                        background: '#7c3aed',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '0.85em',
                                    }}
                                >
                                    📜 Mover para Histórico
                                </button>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {weekAssignments.map(a => {
                            const statusStyle = STATUS_COLORS[a.status] || STATUS_COLORS.DRAFT;
                            const isProcessing = processingIds.has(a.id);

                            return (
                                <div
                                    key={a.id}
                                    style={{
                                        background: '#1f2937',
                                        borderRadius: '10px',
                                        padding: '15px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        opacity: isProcessing ? 0.6 : 1,
                                    }}
                                >
                                    {/* Left: Part info */}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                                            <span
                                                style={{
                                                    background: statusStyle.bg,
                                                    color: statusStyle.text,
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75em',
                                                    fontWeight: 'bold',
                                                }}
                                            >
                                                {statusStyle.icon} {a.status.replace('_', ' ')}
                                            </span>
                                            <span style={{ color: '#9ca3af', fontSize: '0.85em' }}>
                                                {a.date} · {a.durationMin}min
                                            </span>
                                        </div>
                                        <h4 style={{ margin: '0 0 5px' }}>{a.partTitle}</h4>
                                        <div style={{ color: '#9ca3af', fontSize: '0.9em' }}>
                                            <strong>Principal:</strong> {a.principalPublisherName}
                                            {a.secondaryPublisherName && (
                                                <span> · <strong>Ajudante:</strong> {a.secondaryPublisherName}</span>
                                            )}
                                        </div>
                                        {a.selectionReason && (
                                            <div style={{ color: '#6b7280', fontSize: '0.8em', marginTop: '5px' }}>
                                                💡 {a.selectionReason}
                                            </div>
                                        )}
                                    </div>

                                    {/* Right: Actions */}
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        {a.status === ApprovalStatus.PENDING_APPROVAL && (
                                            <>
                                                <button
                                                    onClick={() => handleApprove(a.id)}
                                                    disabled={isProcessing}
                                                    style={{
                                                        background: '#10b981',
                                                        color: '#fff',
                                                        border: 'none',
                                                        padding: '8px 16px',
                                                        borderRadius: '6px',
                                                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                    }}
                                                >
                                                    {isProcessing ? '...' : '✅ Aprovar'}
                                                </button>
                                                <button
                                                    onClick={() => setRejectingId(a.id)}
                                                    disabled={isProcessing}
                                                    style={{
                                                        background: '#ef4444',
                                                        color: '#fff',
                                                        border: 'none',
                                                        padding: '8px 16px',
                                                        borderRadius: '6px',
                                                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                    }}
                                                >
                                                    ❌ Rejeitar
                                                </button>
                                            </>
                                        )}
                                        {a.status === ApprovalStatus.APPROVED && (
                                            <button
                                                onClick={() => handleMarkCompleted([a.id])}
                                                disabled={isProcessing}
                                                style={{
                                                    background: '#3b82f6',
                                                    color: '#fff',
                                                    border: 'none',
                                                    padding: '8px 16px',
                                                    borderRadius: '6px',
                                                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                }}
                                            >
                                                🏆 Concluída
                                            </button>
                                        )}
                                        {a.rejectionReason && (
                                            <span style={{ color: '#f87171', fontSize: '0.85em' }}>
                                                Motivo: {a.rejectionReason}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {/* Reject Modal */}
            {rejectingId && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                }}>
                    <div style={{
                        background: '#1f2937',
                        borderRadius: '12px',
                        padding: '25px',
                        width: '400px',
                        maxWidth: '90vw',
                    }}>
                        <h3 style={{ margin: '0 0 15px' }}>❌ Rejeitar Designação</h3>
                        <p style={{ color: '#9ca3af', marginBottom: '15px' }}>
                            Informe o motivo da rejeição para que outro publicador possa ser designado.
                        </p>
                        <textarea
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="Ex: Publicador não está disponível nesta data..."
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid #374151',
                                background: '#111827',
                                color: '#fff',
                                minHeight: '100px',
                                resize: 'vertical',
                            }}
                        />
                        <div style={{ display: 'flex', gap: '10px', marginTop: '15px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => {
                                    setRejectingId(null);
                                    setRejectReason('');
                                }}
                                style={{
                                    background: '#374151',
                                    color: '#fff',
                                    border: 'none',
                                    padding: '10px 20px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleReject(rejectingId)}
                                disabled={!rejectReason.trim()}
                                style={{
                                    background: rejectReason.trim() ? '#ef4444' : '#6b7280',
                                    color: '#fff',
                                    border: 'none',
                                    padding: '10px 20px',
                                    borderRadius: '6px',
                                    cursor: rejectReason.trim() ? 'pointer' : 'not-allowed',
                                }}
                            >
                                Confirmar Rejeição
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
