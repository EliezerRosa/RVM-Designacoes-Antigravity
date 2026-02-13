import { useState, useEffect, useCallback, useMemo } from 'react';
import { workbookService } from '../services/workbookService';
import { type WorkbookPart, WorkbookStatus, type Publisher, EnumModalidade, EnumFuncao } from '../types';
import { PublisherSelect } from './PublisherSelect';
import { Tooltip } from './Tooltip';
import { checkEligibility, isPastWeekDate } from '../services/eligibilityService';
import { usePersistedState } from '../hooks/usePersistedState';

interface ApprovalPanelProps {
    elderId?: string;
    elderName?: string;
    publishers?: Publisher[];
}

import { getStatusConfig, STATUS_CONFIG } from '../constants/status';
import { sendS89ViaWhatsApp, copyS89ToClipboard } from '../services/s89Generator';

export default function ApprovalPanel({ elderId = 'elder-1', elderName: _elderName = 'Ancião', publishers = [] }: ApprovalPanelProps) {
    const [assignments, setAssignments] = useState<WorkbookPart[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Persisted filter - remembers user's last selection
    const [filter, setFilter] = usePersistedState<'all' | 'unassigned' | 'pending' | 'approved' | 'completed' | 'cancelled'>('ap_filter', 'pending');

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
            } else if (filter === 'cancelled') {
                data = await workbookService.getByStatus(WorkbookStatus.CANCELADA);
            } else {
                data = await workbookService.getAll();
            }

            // Filtrar datas passadas no cliente (apenas para pending, unassigned e approved)
            // IMPORTANTE: Usa o início da semana atual (segunda-feira) como referência,
            // pois as partes têm a data da segunda-feira no campo 'date'
            // Filtrar datas passadas no cliente (PARA TODOS OS FILTROS, exceto histórico explícito se houver no futuro)
            // Solicitação do usuário: "Filtrar para exibir só as semanas atual e futuras"
            // IMPORTANTE: Usa o início da semana atual (segunda-feira) como referência
            const now = new Date();
            const dayOfWeek = now.getDay(); // 0=Dom, 1=Seg, ..., 6=Sab
            const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Ajustar para segunda
            const monday = new Date(now);
            monday.setDate(now.getDate() + diffToMonday);
            monday.setHours(0, 0, 0, 0);

            // Filtragem local
            data = data.filter(p => {
                const d = parseDate(p.date);
                return d >= monday;
            });

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

    // Fluxo Combinado: S-89 + WhatsApp (substitui handleZap + handlePrintS89)
    const handleSendS89ViaWhatsApp = async (
        part: WorkbookPart,
        assistantName?: string,
        phone?: string,
        isForAssistant: boolean = false,
        titularName?: string
    ) => {
        try {
            // 1. Tentar copiar imagem para clipboard (NOVO)
            const copied = await copyS89ToClipboard(part, assistantName);
            if (copied) {
                // Feedback visual discreto ou via toast poderia ser bom aqui, mas vamos usar um alert rápido ou só logar
                console.log('Imagem do S-89 copiada para o clipboard!');
            }

            // 2. Fluxo original: Baixar PDF + Abrir WhatsApp
            await sendS89ViaWhatsApp(part, assistantName, phone, isForAssistant, titularName);

            if (copied) {
                // Aviso para usuário colar
                // setTimeout(() => alert('📋 Imagem copiada! Cole no WhatsApp (Ctrl+V) junto com a mensagem.'), 1000);
            }
        } catch (error) {
            alert('Erro ao processar S-89: ' + (error instanceof Error ? error.message : String(error)));
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
    const groupedByWeek = useMemo(() => assignments.reduce((acc, a) => {
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
    }, {} as Record<string, WorkbookPart[]>), [assignments]);

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
                {(['unassigned', 'pending', 'approved', 'completed', 'cancelled', 'all'] as const).map(f => {
                    let count = 0;
                    if (stats) {
                        if (f === 'unassigned') count = stats['PENDENTE'] || 0;
                        else if (f === 'pending') count = stats['PROPOSTA'] || 0;
                        else if (f === 'approved') count = (stats['APROVADA'] || 0) + (stats['DESIGNADA'] || 0);
                        else if (f === 'completed') count = stats['CONCLUIDA'] || 0;
                        else if (f === 'cancelled') count = stats['CANCELADA'] || 0;
                        else if (f === 'all') count = Object.values(stats).reduce((a, b) => a + b, 0);
                    }

                    return (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            style={{
                                background: filter === f ? (f === 'cancelled' ? '#6b7280' : '#3b82f6') : '#374151',
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
                            {f === 'cancelled' && `🚫 Canceladas (${count})`}
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
                    {Object.entries(groupedByWeek).map(([weekDisplay, weekParts]: [string, WorkbookPart[]]) => (
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
                                    const foundPublisher = publishers.find(p => p.name === displayPublisher);
                                    if (foundPublisher) currentSelectValue = foundPublisher.id;

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
                                                    {/* Event impact indicator */}
                                                    {(part as { affectedByEventId?: string }).affectedByEventId && (
                                                        <Tooltip content="Parte afetada por Evento Especial">
                                                            <span style={{ cursor: 'help', color: '#a855f7' }}>⚡</span>
                                                        </Tooltip>
                                                    )}
                                                </div>
                                                {/* Cancel reason display */}
                                                {part.status === WorkbookStatus.CANCELADA && part.cancelReason && (
                                                    <div style={{
                                                        fontSize: '0.8em',
                                                        color: '#9ca3af',
                                                        background: '#1f2937',
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        marginBottom: '4px',
                                                        display: 'inline-block'
                                                    }}>
                                                        🚫 {part.cancelReason}
                                                    </div>
                                                )}
                                                <div style={{ fontSize: '1.1em', fontWeight: 'bold', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {part.modalidade} {part.tituloParte ? `- ${part.tituloParte}` : ''}
                                                    {part.descricaoParte && (
                                                        <Tooltip content={part.descricaoParte}>
                                                            <span style={{ cursor: 'help', fontSize: '0.9em' }}>📝</span>
                                                        </Tooltip>
                                                    )}
                                                    {part.detalhesParte && (
                                                        <Tooltip content={part.detalhesParte}>
                                                            <span style={{ cursor: 'help', fontSize: '0.9em' }}>ℹ️</span>
                                                        </Tooltip>
                                                    )}
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
                                                            weekParts={weekParts}
                                                            allParts={assignments}
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
                                                        // Se não for proposta ou não tiver ID, mostra texto estático com tooltip de elegibilidade
                                                        <>
                                                            <span>{displayPublisher}</span>
                                                            {foundPublisher && (() => {
                                                                // Helper para determinar modalidade
                                                                const TIPO_TO_MODALIDADE: Record<string, string> = {
                                                                    'Presidente': EnumModalidade.PRESIDENCIA,
                                                                    'Oração Inicial': EnumModalidade.ORACAO,
                                                                    'Oração Final': EnumModalidade.ORACAO,
                                                                    'Leitura da Bíblia': EnumModalidade.LEITURA_ESTUDANTE,
                                                                    'Dirigente EBC': EnumModalidade.DIRIGENTE_EBC,
                                                                    'Leitor EBC': EnumModalidade.LEITOR_EBC,
                                                                    'Discurso Tesouros': EnumModalidade.DISCURSO_ENSINO,
                                                                    'Joias Espirituais': EnumModalidade.DISCURSO_ENSINO,
                                                                    'Iniciando Conversas': EnumModalidade.DEMONSTRACAO,
                                                                    'Cultivando o Interesse': EnumModalidade.DEMONSTRACAO,
                                                                    'Fazendo Discípulos': EnumModalidade.DEMONSTRACAO,
                                                                    'Explicando Suas Crenças': EnumModalidade.DEMONSTRACAO,
                                                                    'Discurso de Estudante': EnumModalidade.DISCURSO_ESTUDANTE,
                                                                };
                                                                const modalidade = part.modalidade || TIPO_TO_MODALIDADE[part.tipoParte] || EnumModalidade.DEMONSTRACAO;
                                                                const funcao = part.funcao === 'Ajudante' ? EnumFuncao.AJUDANTE : EnumFuncao.TITULAR;
                                                                const isPast = isPastWeekDate(part.date);
                                                                const eligibility = checkEligibility(foundPublisher, modalidade as any, funcao, { date: part.date, secao: part.section, isPastWeek: isPast });

                                                                // Construir tooltip
                                                                const lines = [
                                                                    `📋 ${foundPublisher.name}`,
                                                                    `👔 ${foundPublisher.condition}`,
                                                                    `${foundPublisher.gender === 'brother' ? '👨 Irmão' : '👩 Irmã'}`,
                                                                    '',
                                                                ];

                                                                if (eligibility.eligible) {
                                                                    lines.push('✅ ELEGÍVEL para esta parte');
                                                                    // Explicação em linguagem natural
                                                                    let explanation = '';
                                                                    if (funcao === EnumFuncao.AJUDANTE) {
                                                                        explanation = 'Pode participar como ajudante';
                                                                    } else if (modalidade === EnumModalidade.PRESIDENCIA) {
                                                                        explanation = `${foundPublisher.condition} com privilégio de presidir`;
                                                                    } else if (modalidade === EnumModalidade.ORACAO) {
                                                                        explanation = 'Irmão batizado com privilégio de orar';
                                                                    } else if (modalidade === EnumModalidade.DISCURSO_ENSINO) {
                                                                        explanation = foundPublisher.condition === 'Ancião' ? 'Ancião aprovado para discursos' : 'SM com privilégio de discurso';
                                                                    } else if (modalidade === EnumModalidade.DEMONSTRACAO) {
                                                                        explanation = foundPublisher.gender === 'sister' ? 'Irmã atuante pode fazer demonstrações' : 'Irmão atuante pode fazer demonstrações';
                                                                    } else if (modalidade === EnumModalidade.LEITURA_ESTUDANTE) {
                                                                        explanation = 'Publicador atuante pode fazer leitura';
                                                                    } else if (modalidade === EnumModalidade.DIRIGENTE_EBC) {
                                                                        explanation = 'Ancião com privilégio de dirigir EBC';
                                                                    } else if (modalidade === EnumModalidade.LEITOR_EBC) {
                                                                        explanation = 'Irmão com privilégio de ler no EBC';
                                                                    } else {
                                                                        explanation = 'Atende os requisitos para esta parte';
                                                                    }
                                                                    lines.push(`➡️ ${explanation}`);
                                                                } else {
                                                                    lines.push(`❌ NÃO ELEGÍVEL: ${eligibility.reason}`);
                                                                }

                                                                return (
                                                                    <Tooltip content={lines.join('\n')}>
                                                                        <span
                                                                            style={{
                                                                                cursor: 'help',
                                                                                background: eligibility.eligible ? 'rgba(107, 114, 128, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                                                                color: eligibility.eligible ? '#6b7280' : '#ef4444',
                                                                                borderRadius: '50%',
                                                                                width: '18px',
                                                                                height: '18px',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center',
                                                                                fontSize: '11px',
                                                                                fontWeight: 'bold',
                                                                                marginLeft: '6px',
                                                                                border: eligibility.eligible ? '1px solid rgba(107, 114, 128, 0.3)' : '1px solid rgba(239, 68, 68, 0.4)'
                                                                            }}
                                                                        >
                                                                            ?
                                                                        </span>
                                                                    </Tooltip>
                                                                );
                                                            })()}
                                                        </>
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
                                                                        // Verificar se esta parte é de Ajudante ou Titular
                                                                        const isAjudante = part.funcao === 'Ajudante';

                                                                        // Buscar telefone do publicador atual
                                                                        const publisherName = part.resolvedPublisherName || part.rawPublisherName;
                                                                        const foundPublisher = publishers.find(p => p.name === publisherName);
                                                                        const phone = foundPublisher?.phone;

                                                                        // CORREÇÃO: Extrair número da parte do título (ex: "4. Iniciando conversas" → "4")
                                                                        // Titular e Ajudante têm seq diferentes, mas o mesmo número no título
                                                                        const extractPartNumber = (titulo: string): string => {
                                                                            const match = titulo?.match(/^(\d+)\./);
                                                                            return match ? match[1] : '';
                                                                        };

                                                                        const currentPartNumber = extractPartNumber(part.tituloParte || part.tipoParte);

                                                                        if (isAjudante) {
                                                                            // MENSAGEM PARA AJUDANTE: Buscar o titular da mesma parte
                                                                            const titular = weekParts.find((p: WorkbookPart) => {
                                                                                const pNum = extractPartNumber(p.tituloParte || p.tipoParte);
                                                                                return pNum === currentPartNumber && p.funcao === 'Titular' && p.id !== part.id;
                                                                            });
                                                                            const titularName = titular?.resolvedPublisherName || titular?.rawPublisherName;
                                                                            handleSendS89ViaWhatsApp(part, undefined, phone, true, titularName);
                                                                        } else {
                                                                            // MENSAGEM PARA TITULAR: Buscar o ajudante
                                                                            const assistant = weekParts.find((p: WorkbookPart) => {
                                                                                const pNum = extractPartNumber(p.tituloParte || p.tipoParte);
                                                                                return pNum === currentPartNumber && p.funcao === 'Ajudante' && p.id !== part.id;
                                                                            });
                                                                            const assistantName = assistant?.resolvedPublisherName || assistant?.rawPublisherName;
                                                                            handleSendS89ViaWhatsApp(part, assistantName, phone, false, undefined);
                                                                        }
                                                                    }}
                                                                    disabled={isProcessing}
                                                                    style={{
                                                                        background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)', // WhatsApp gradient
                                                                        color: '#fff',
                                                                        border: 'none',
                                                                        padding: '8px 14px',
                                                                        borderRadius: '6px',
                                                                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                        gap: '4px',
                                                                        fontWeight: 'bold'
                                                                    }}
                                                                    title="Baixar S-89 + Enviar WhatsApp"
                                                                >
                                                                    📤
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
