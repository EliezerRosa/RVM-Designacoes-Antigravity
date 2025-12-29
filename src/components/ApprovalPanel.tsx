import { useState, useEffect, useCallback } from 'react';
import { workbookService } from '../services/workbookService';
import { type WorkbookPart, WorkbookStatus, type Publisher } from '../types';
import { PublisherSelect } from './PublisherSelect';

interface ApprovalPanelProps {
    elderId?: string;
    elderName?: string;
    publishers?: Publisher[];
}

const STATUS_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
    PENDENTE: { bg: '#6b7280', text: '#fff', icon: '📝' },
    PROPOSTA: { bg: '#f59e0b', text: '#000', icon: '⏳' },
    APROVADA: { bg: '#10b981', text: '#fff', icon: '✅' },
    DESIGNADA: { bg: '#059669', text: '#fff', icon: '📧' }, // Enviada
    REJEITADA: { bg: '#ef4444', text: '#fff', icon: '❌' },
    CONCLUIDA: { bg: '#3b82f6', text: '#fff', icon: '🏆' },
};

const STATUS_LABELS: Record<string, string> = {
    PENDENTE: 'Pendente',
    PROPOSTA: 'Proposta',
    APROVADA: 'Aprovada',
    DESIGNADA: 'Designada',
    REJEITADA: 'Rejeitada',
    CONCLUIDA: 'Concluída',
};

export default function ApprovalPanel({ elderId = 'elder-1', elderName: _elderName = 'Ancião', publishers = [] }: ApprovalPanelProps) {
    const [assignments, setAssignments] = useState<WorkbookPart[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'completed'>('pending');

    // Estados de ação
    const [rejectingId, setRejectingId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
    const [stats, setStats] = useState<{ total: number; byStatus: Record<string, number> } | null>(null);

    // Ordenar publicadores por nome


    // Helper para normalizar data (suporta YYYY-MM-DD, DD/MM/YYYY e Excel Serial)
    const parseDate = (dateStr: string): Date => {
        if (!dateStr) return new Date(0); // Data muito antiga

        // Se for YYYY-MM-DD
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
            return new Date(dateStr + 'T12:00:00'); // Meio dia para evitar timezone issues
        }

        // Se for DD/MM/YYYY
        const dmy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (dmy) {
            return new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T12:00:00`);
        }

        // Se for número (Excel Serial)
        if (dateStr.match(/^\d+$/)) {
            const serial = parseInt(dateStr, 10);
            const date = new Date((serial - 25569) * 86400 * 1000);
            date.setHours(12, 0, 0, 0); // Meio dia
            return date;
        }

        return new Date(dateStr); // Tenta parse padrão
    };

    // Load assignments
    const loadAssignments = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            let data: WorkbookPart[];

            if (filter === 'pending') {
                data = await workbookService.getByStatus(WorkbookStatus.PROPOSTA);
            } else if (filter === 'approved') {
                data = await workbookService.getByStatus([WorkbookStatus.APROVADA, WorkbookStatus.DESIGNADA]);
            } else if (filter === 'completed') {
                data = await workbookService.getByStatus(WorkbookStatus.CONCLUIDA);
            } else {
                data = await workbookService.getAll();
            }

            // Filtrar datas passadas no cliente (apenas para pending e approved)
            if (filter === 'pending' || filter === 'approved') {
                const today = new Date();
                today.setHours(0, 0, 0, 0); // Zerar hora

                data = data.filter(p => {
                    const d = parseDate(p.date);
                    return d >= today;
                });
            }

            // Ordenar por data
            data.sort((a, b) => {
                const da = parseDate(a.date);
                const db = parseDate(b.date);
                return da.getTime() - db.getTime();
            });

            setAssignments(data);

            // TODO: Se tiver API de stats no workbookService, usar aqui.
            const byStatus: Record<string, number> = {};
            data.forEach(p => {
                byStatus[p.status] = (byStatus[p.status] || 0) + 1;
            });
            setStats({ total: data.length, byStatus });

        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Erro ao carregar designações');
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        loadAssignments();
        const interval = setInterval(loadAssignments, 30000);
        return () => clearInterval(interval);
    }, [loadAssignments]);

    // Approve
    const handleApprove = async (id: string) => {
        setProcessingIds(prev => new Set(prev).add(id));
        try {
            await workbookService.approveProposal(id, elderId);
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

    // Reject
    const handleReject = async (id: string) => {
        if (!rejectReason.trim()) return;

        setProcessingIds(prev => new Set(prev).add(id));
        try {
            await workbookService.rejectProposal(id, rejectReason);
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

    // Update Publisher (Inline)
    const handleUpdatePublisher = async (partId: string, newId: string, newName: string) => {
        if (!partId) return;

        // Optimistic UI update logic could be here, but let's stick to loading state for safety
        setProcessingIds(prev => new Set(prev).add(partId));

        try {
            // Atualiza o nome proposto na workbook_part
            await workbookService.updatePart(partId, {
                proposedPublisherName: newName.trim(),
                proposedPublisherId: newId || undefined,
            });

            // Recarrega lista
            await loadAssignments();

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao atualizar publicador');
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(partId);
                return next;
            });
        }
    }

    // Mark as completed
    const handleMarkCompleted = async (ids: string[]) => {
        if (!confirm(`Marcar ${ids.length} designação(ões) como CONCLUÍDA na Apostila?`)) return;

        setProcessingIds(prev => new Set([...prev, ...ids]));
        try {
            let updated = 0;
            for (const id of ids) {
                const part = assignments.find(p => p.id === id);
                const finalPublisherName = part?.resolvedPublisherName || part?.proposedPublisherName || part?.rawPublisherName;

                await workbookService.updatePart(id, {
                    status: WorkbookStatus.CONCLUIDA,
                    rawPublisherName: finalPublisherName
                });
                updated++;
            }
            alert(`✅ ${updated} partes marcadas como CONCLUÍDA na Apostila`);
            await loadAssignments();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao atualizar apostila');
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
        // OCULTAR Partes implícitas do presidente (Comentários Iniciais/Finais)
        // OCULTAR Partes implícitas do presidente
        const HIDDEN_TYPES = [
            'Comentários Iniciais', 'Comentarios Iniciais',
            'Comentários Finais', 'Comentarios Finais',
            'Cântico Inicial', 'Cântico do Meio', 'Cântico Final', 'Cântico', 'Cantico',
            'Oração Inicial', 'Oracao Inicial',
            'Elogios e Conselhos', 'Elogios e conselhos'
        ];

        if (HIDDEN_TYPES.includes(a.tipoParte)) {
            return acc;
        }

        if (!acc[a.weekDisplay]) acc[a.weekDisplay] = [];
        acc[a.weekDisplay].push(a);
        return acc;
    }, {} as Record<string, WorkbookPart[]>);

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '1.5em', marginBottom: '20px', color: '#fff' }}>📋 Painel de Aprovações (Apostila)</h2>

            {/* Stats (Simples) */}
            {stats && (
                <div style={{
                    display: 'flex',
                    gap: '15px',
                    overflowX: 'auto',
                    paddingBottom: '15px',
                    marginBottom: '20px'
                }}>
                    {Object.entries(STATUS_COLORS).map(([status, colors]) => {
                        const count = stats.byStatus[status] || 0;
                        if (filter !== 'all' && count === 0) return null; // Esconder zerados se não for view all

                        return (
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
                                    <div style={{ fontSize: '0.75em', opacity: 0.9 }}>{STATUS_LABELS[status] || status}</div>
                                    <div style={{ fontSize: '1.3em', fontWeight: 'bold' }}>
                                        {count}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Filter */}
            <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {(['pending', 'approved', 'completed', 'all'] as const).map(f => (
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
                        {f === 'completed' && '🏆 Concluídas'}
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
                    marginBottom: '20px',
                }}>
                    ⚠️ {error}
                </div>
            )}

            {/* Loading */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                    Carregando...
                </div>
            ) : assignments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280', background: '#1f2937', borderRadius: '12px' }}>
                    Nenhuma designação encontrada para este filtro.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                    {Object.entries(groupedByWeek).map(([weekDisplay, weekParts]) => (
                        <div key={weekDisplay} style={{ background: '#1f2937', borderRadius: '12px', padding: '20px' }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '15px',
                                borderBottom: '1px solid #374151',
                                paddingBottom: '10px'
                            }}>
                                <h3 style={{ margin: 0, color: '#e5e7eb' }}>📅 Semana {weekDisplay}</h3>

                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {/* Botão de Finalizar Semana inteira (Apenas visualização approved) */}
                                    {filter === 'approved' && weekParts.some(a => a.status === WorkbookStatus.APROVADA || a.status === WorkbookStatus.DESIGNADA) && (
                                        <button
                                            onClick={() => handleMarkCompleted(
                                                weekParts
                                                    .filter(a => a.status === WorkbookStatus.APROVADA || a.status === WorkbookStatus.DESIGNADA)
                                                    .map(a => a.id)
                                            )}
                                            style={{
                                                background: '#10b981',
                                                color: '#fff',
                                                border: 'none',
                                                padding: '6px 12px',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontSize: '0.85em',
                                            }}
                                        >
                                            ✅ Finalizar Semana na Apostila
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gap: '15px' }}>
                                {weekParts.map(part => {
                                    const isProcessing = processingIds.has(part.id);
                                    const isEditable = part.status === WorkbookStatus.PROPOSTA && publishers.length > 0;
                                    const statusStyle = STATUS_COLORS[part.status] || STATUS_COLORS.PENDENTE;

                                    const displayPublisher = part.proposedPublisherName || part.resolvedPublisherName || part.rawPublisherName || '(Sem publicador)';

                                    // Tentar determinar o valor atual do Select (ID)
                                    // 1. proposedPublisherId se existir
                                    // 2. Tentar achar pelo nome em publishers
                                    let currentSelectValue = part.proposedPublisherId || '';
                                    if (!currentSelectValue && displayPublisher) {
                                        const found = publishers.find(p => p.name === displayPublisher);
                                        if (found) currentSelectValue = found.id;
                                    }

                                    return (
                                        <div
                                            key={part.id}
                                            style={{
                                                background: '#111827',
                                                borderRadius: '8px',
                                                padding: '15px',
                                                border: `1px solid ${statusStyle.bg}`,
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                gap: '15px',
                                                flexWrap: 'wrap',
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
                                                        {statusStyle.icon} {STATUS_LABELS[part.status] || part.status}
                                                    </span>
                                                    <span style={{ color: '#9ca3af', fontSize: '0.85em' }}>
                                                        {part.date} · {part.duracao}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '1.1em', fontWeight: 'bold', color: '#fff' }}>
                                                    {part.tipoParte} {part.tituloParte ? `- ${part.tituloParte}` : ''}
                                                </div>
                                                <div style={{ marginTop: '8px', color: '#d1d5db', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    👤
                                                    {isEditable ? (
                                                        <PublisherSelect
                                                            part={part}
                                                            publishers={publishers}
                                                            value={currentSelectValue}
                                                            onChange={(newId, newName) => {
                                                                handleUpdatePublisher(part.id, newId, newName);
                                                            }}
                                                            disabled={isProcessing}
                                                            style={{
                                                                padding: '6px 12px',
                                                                borderRadius: '6px',
                                                                border: '1px solid #4b5563',
                                                                background: '#374151',
                                                                color: '#fff',
                                                                cursor: isProcessing ? 'wait' : 'pointer',
                                                                fontSize: '0.95em',
                                                                minWidth: '200px'
                                                            }}
                                                        />
                                                    ) : (
                                                        // Se não for proposta ou não tiver ID, mostra texto estático
                                                        <span>{displayPublisher}</span>
                                                    )}
                                                    {isProcessing && <span style={{ fontSize: '0.8em', color: '#9ca3af' }}>⏳ Salvando...</span>}
                                                </div>
                                            </div>

                                            {/* Right: Actions */}
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {part.status === WorkbookStatus.PROPOSTA && (
                                                    <>
                                                        {/* Botão de Editar removido - agora é inline */}

                                                        <button
                                                            onClick={() => handleApprove(part.id)}
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
                                                            onClick={() => setRejectingId(part.id)}
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
                                                            ❌
                                                        </button>
                                                    </>
                                                )}
                                                {(part.status === WorkbookStatus.APROVADA || part.status === WorkbookStatus.DESIGNADA) && (
                                                    <button
                                                        onClick={() => handleMarkCompleted([part.id])}
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
                                                {part.rejectedReason && (
                                                    <span style={{ color: '#f87171', fontSize: '0.85em' }}>
                                                        Motivo: {part.rejectedReason}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal de Rejeição */}
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
                            Por que você está rejeitando esta sugestão?
                        </p>
                        <textarea
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="Motivo (ex: Indisponibilidade, erro no agendamento...)"
                            style={{
                                width: '100%',
                                height: '100px',
                                padding: '10px',
                                borderRadius: '8px',
                                border: '1px solid #374151',
                                background: '#111827',
                                color: '#fff',
                                marginBottom: '15px',
                                resize: 'vertical',
                            }}
                        />
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
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
