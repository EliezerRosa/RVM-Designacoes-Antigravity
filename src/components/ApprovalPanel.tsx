import { useState, useEffect, useCallback } from 'react';
import { workbookService } from '../services/workbookService';
import { type WorkbookPart, WorkbookStatus, type Publisher } from '../types';
import { PublisherSelect } from './PublisherSelect';

interface ApprovalPanelProps {
    elderId?: string;
    elderName?: string;
    publishers?: Publisher[];
}

import { getStatusConfig, STATUS_CONFIG } from '../constants/status';
import { generateS89, downloadS89, openWhatsApp } from '../services/s89Generator';

export default function ApprovalPanel({ elderId = 'elder-1', elderName: _elderName = 'Ancião', publishers = [] }: ApprovalPanelProps) {
    const [assignments, setAssignments] = useState<WorkbookPart[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'unassigned' | 'pending' | 'approved' | 'completed'>('pending');

    // Estados de ação
    const [rejectingId, setRejectingId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
    const [stats, setStats] = useState<Record<string, number> | null>(null);

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

            if (filter === 'unassigned') {
                data = await workbookService.getByStatus(WorkbookStatus.PENDENTE);
            } else if (filter === 'pending') {
                data = await workbookService.getByStatus(WorkbookStatus.PROPOSTA);
            } else if (filter === 'approved') {
                data = await workbookService.getByStatus([WorkbookStatus.APROVADA, WorkbookStatus.DESIGNADA]);
            } else if (filter === 'completed') {
                data = await workbookService.getByStatus(WorkbookStatus.CONCLUIDA);
            } else {
                data = await workbookService.getAll();
            }

            // Filtrar datas passadas no cliente (apenas para pending, unassigned e approved)
            // IMPORTANTE: Usa o início da semana atual (segunda-feira) como referência,
            // pois as partes têm a data da segunda-feira no campo 'date'
            if (filter === 'pending' || filter === 'approved' || filter === 'unassigned') {
                const now = new Date();
                const dayOfWeek = now.getDay(); // 0=Dom, 1=Seg, ..., 6=Sab
                const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Ajustar para segunda
                const monday = new Date(now);
                monday.setDate(now.getDate() + diffToMonday);
                monday.setHours(0, 0, 0, 0);

                data = data.filter(p => {
                    const d = parseDate(p.date);
                    return d >= monday;
                });
            }

            // Ordenar por data
            data.sort((a, b) => {
                const da = parseDate(a.date);
                const db = parseDate(b.date);
                return da.getTime() - db.getTime();
            });

            setAssignments(data);

            setAssignments(data);
            // Stats agora são carregadas separadamente via loadStats

        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Erro ao carregar designações');
        } finally {
            setLoading(false);
        }
    }, [filter]);

    // Load stats independent of filter
    const loadStats = useCallback(async () => {
        try {
            const s = await workbookService.getFutureStats();
            setStats(s);
        } catch (err) {
            console.error('Erro ao carregar estatísticas:', err);
        }
    }, [] as any);

    useEffect(() => {
        loadAssignments();
        loadStats();
        // Removido polling de 30s - usar realtime ou refresh manual
    }, [loadAssignments, loadStats]);

    // Approve
    const handleApprove = async (id: string) => {
        setProcessingIds(prev => new Set(prev).add(id));
        try {
            await workbookService.approveProposal(id, elderId);
            await loadAssignments();
            loadStats();
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
            loadStats();
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
    const handleUpdatePublisher = async (partId: string, _newId: string, newName: string) => {
        if (!partId) return;

        // Optimistic UI update logic could be here, but let's stick to loading state for safety
        setProcessingIds(prev => new Set(prev).add(partId));

        try {
            // Atualiza o nome do publicador usando o método unificado (mantém status PROPOSTA e dispara triggers)
            await workbookService.proposePublisher(partId, newName);

            // Recarrega lista
            await loadAssignments();
            loadStats();

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

    // Manda pro Zap
    const handleZap = (part: WorkbookPart, assistantName?: string) => {
        openWhatsApp(part, assistantName);
    };

    // Imprime S-89
    const handlePrintS89 = async (part: WorkbookPart, assistantName?: string) => {
        try {
            const pdfBytes = await generateS89(part, assistantName);
            const fileName = `S-89_${part.date}_${part.resolvedPublisherName || part.rawPublisherName}.pdf`;
            downloadS89(pdfBytes, fileName);
        } catch (error) {
            alert('Erro ao gerar S-89: ' + (error instanceof Error ? error.message : String(error)));
            console.error(error);
        }
    };

    // Desfazer Conclusão (Volta para APROVADA)
    const handleUndoCompletion = async (id: string) => {
        if (!confirm('Deseja desfazer a conclusão e voltar para APROVADA? (O publicador será mantido)')) return;

        setProcessingIds(prev => new Set(prev).add(id));
        try {
            await workbookService.undoCompletion(id);
            await loadAssignments();
            loadStats();
        } catch (err) {
            alert('Erro: ' + (err instanceof Error ? err.message : String(err)));
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
        if (!confirm(`Marcar ${ids.length} designação(ões) como CONCLUÍDA na Apostila?`)) return;

        setProcessingIds(prev => new Set([...prev, ...ids]));
        try {
            // Usar método de serviço dedicado para marcar como concluído
            await workbookService.markAsCompleted(ids);

            alert(`✅ ${ids.length} partes marcadas como CONCLUÍDA na Apostila`);
            await loadAssignments();
            loadStats();
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
                    {Object.entries(STATUS_CONFIG).map(([status, config]) => {
                        const count = stats[status] || 0;
                        if (count === 0) return null; // Esconder zerados

                        return (
                            <div
                                key={status}
                                style={{
                                    background: config.bg,
                                    color: config.text,
                                    border: `1px solid ${config.border}`,
                                    padding: '10px 15px',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    minWidth: '120px',
                                }}
                            >
                                <span style={{ fontSize: '1.2em' }}>{config.icon}</span>
                                <div>
                                    <div style={{ fontSize: '0.75em', opacity: 0.9 }}>{config.label}</div>
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
                {(['unassigned', 'pending', 'approved', 'completed', 'all'] as const).map(f => {
                    let count = 0;
                    if (stats) {
                        if (f === 'unassigned') count = stats['PENDENTE'] || 0;
                        else if (f === 'pending') count = stats['PROPOSTA'] || 0;
                        else if (f === 'approved') count = (stats['APROVADA'] || 0) + (stats['DESIGNADA'] || 0);
                        else if (f === 'completed') count = stats['CONCLUIDA'] || 0;
                        else if (f === 'all') count = Object.values(stats).reduce((a, b) => a + b, 0);
                    }

                    return (
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
                            {f === 'unassigned' && `📝 Não Designadas (${count})`}
                            {f === 'pending' && `⏳ A Aprovar (${count})`}
                            {f === 'approved' && `✅ Aprovadas (${count})`}
                            {f === 'completed' && `🏆 Concluídas (${count})`}
                            {f === 'all' && `📋 Todas (${count})`}
                        </button>
                    );
                })}
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
                                    const statusConfig = getStatusConfig(part.status);

                                    // SIMPLIFICADO: Usar apenas resolved_publisher_name
                                    const displayPublisher = part.resolvedPublisherName || part.rawPublisherName || '(Sem publicador)';

                                    // Tentar determinar o valor atual do Select (ID) pelo nome
                                    let currentSelectValue = '';
                                    if (displayPublisher && displayPublisher !== '(Sem publicador)') {
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
                                                border: `1px solid ${statusConfig.border}`,
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
                                                            background: statusConfig.bg,
                                                            color: statusConfig.text,
                                                            border: `1px solid ${statusConfig.border}`,
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.75em',
                                                            fontWeight: 'bold',
                                                        }}
                                                    >
                                                        {statusConfig.icon} {statusConfig.label}
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
                                                {(part.status === WorkbookStatus.APROVADA || part.status === WorkbookStatus.DESIGNADA || part.status === WorkbookStatus.CONCLUIDA) && (
                                                    <>
                                                        {part.status !== WorkbookStatus.CONCLUIDA && (
                                                            <>
                                                                <button
                                                                    onClick={() => {
                                                                        const assistant = weekParts.find(p => p.seq === part.seq && p.funcao === 'Ajudante' && p.id !== part.id);
                                                                        const assistantName = assistant?.resolvedPublisherName || assistant?.rawPublisherName;
                                                                        handleZap(part, assistantName);
                                                                    }}
                                                                    disabled={isProcessing}
                                                                    style={{
                                                                        background: '#25D366', // WhatsApp Green
                                                                        color: '#fff',
                                                                        border: 'none',
                                                                        padding: '8px 12px',
                                                                        borderRadius: '6px',
                                                                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                                    }}
                                                                    title="Enviar WhatsApp"
                                                                >
                                                                    📱
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        const assistant = weekParts.find(p => p.seq === part.seq && p.funcao === 'Ajudante' && p.id !== part.id);
                                                                        const assistantName = assistant?.resolvedPublisherName || assistant?.rawPublisherName;
                                                                        handlePrintS89(part, assistantName);
                                                                    }}
                                                                    disabled={isProcessing}
                                                                    style={{
                                                                        background: '#6b7280', // Gray for PDF
                                                                        color: '#fff',
                                                                        border: 'none',
                                                                        padding: '8px 12px',
                                                                        borderRadius: '6px',
                                                                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                                    }}
                                                                    title="Gerar S-89 (PDF)"
                                                                >
                                                                    📄
                                                                </button>
                                                            </>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                if (part.status === WorkbookStatus.CONCLUIDA) {
                                                                    handleUndoCompletion(part.id);
                                                                } else {
                                                                    setRejectingId(part.id);
                                                                }
                                                            }}
                                                            disabled={isProcessing}

                                                            style={{
                                                                background: '#f59e0b',
                                                                color: '#fff',
                                                                border: 'none',
                                                                padding: '8px 16px',
                                                                borderRadius: '6px',
                                                                cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                            }}
                                                            title={part.status === WorkbookStatus.CONCLUIDA ? "Reverter para Aprovada" : "Cancelar Designação"}
                                                        >
                                                            ⚠️
                                                        </button>
                                                        {part.status !== WorkbookStatus.CONCLUIDA && (
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
                                                    </>
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

            {/* Modal de Rejeição / Cancelamento */}
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
                        <h3 style={{ margin: '0 0 15px' }}>
                            {assignments.find(a => a.id === rejectingId)?.status === WorkbookStatus.PROPOSTA
                                ? '❌ Rejeitar Proposta'
                                : '⚠️ Cancelar Designação'}
                        </h3>
                        <p style={{ color: '#9ca3af', marginBottom: '15px' }}>
                            {assignments.find(a => a.id === rejectingId)?.status === WorkbookStatus.PROPOSTA
                                ? 'Por que você está rejeitando esta sugestão?'
                                : 'A designação voltará para PENDENTE e o publicador será removido.'}
                        </p>
                        <textarea
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="Motivo (ex: Indisponibilidade, erro no agendamento, substituição...)"
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
                                Voltar
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
                                Confirmar {assignments.find(a => a.id === rejectingId)?.status === WorkbookStatus.PROPOSTA ? 'Rejeição' : 'Cancelamento'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
