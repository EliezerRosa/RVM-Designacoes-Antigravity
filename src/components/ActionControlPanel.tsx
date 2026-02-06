import { useState, useEffect } from 'react';
import type { Publisher, WorkbookPart, HistoryRecord } from '../types';
import { checkEligibility, type EligibilityResult } from '../services/eligibilityService';
import { getCooldownInfo, type CooldownInfo } from '../services/cooldownService';
import { calculateScore, getRankedCandidates, generateNaturalLanguageExplanation, type RotationScore, type RankedCandidate } from '../services/unifiedRotationService';
import { workbookPartToHistoryRecord } from '../services/historyAdapter';

/**
 * ActionControlPanel – Exibe detalhes da parte selecionada
 * Mostra informações sobre a parte, status, publicador designado e permite ações futuras.
 */
interface Props {
    selectedPartId: string | null;
    parts: WorkbookPart[];
    publishers: Publisher[];
    historyRecords: HistoryRecord[]; // NEW: Receber histórico completo
}

interface PublisherStats {
    lastDate: string | null;
    nextDate?: string | null; // NEW
    totalAssignments: number;
}

export default function ActionControlPanel({ selectedPartId, parts, publishers, historyRecords }: Props) {
    const selectedPart = parts.find(p => p.id === selectedPartId);

    // Buscar o publicador designado para esta parte
    const effectiveName = selectedPart?.resolvedPublisherName || selectedPart?.rawPublisherName;
    const assignedPublisher = effectiveName
        ? publishers.find(pub =>
            pub.name.toLowerCase() === effectiveName.toLowerCase()
        )
        : null;

    // Estados para dados assíncronos
    const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
    const [cooldown, setCooldown] = useState<CooldownInfo | null>(null);
    const [stats, setStats] = useState<PublisherStats | null>(null);
    const [scoreData, setScoreData] = useState<RotationScore | null>(null);
    const [explanation, setExplanation] = useState<string | null>(null);
    const [bestCandidate, setBestCandidate] = useState<{ name: string; explanation: string; score: number } | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let isMounted = true;

        async function fetchData() {
            if (!selectedPart || !assignedPublisher) {
                setEligibility(null);
                setCooldown(null);
                setStats(null);
                setScoreData(null);
                setExplanation(null);
                setBestCandidate(null);
                return;
            }

            setLoading(true);
            try {
                // Usar o histórico completo fornecido via props
                const allHistory = historyRecords && historyRecords.length > 0
                    ? historyRecords
                    : parts.map(workbookPartToHistoryRecord);

                // 1. Calcular o MELHOR CANDIDATO (Top Recommendation)
                const eligibleCandidates = publishers.filter(p =>
                    checkEligibility(p, selectedPart.modalidade as any, selectedPart.funcao as any, {
                        date: selectedPart.date,
                        partTitle: selectedPart.tituloParte,
                        secao: selectedPart.section
                    }).eligible
                );

                const ranked = getRankedCandidates(eligibleCandidates, selectedPart.tipoParte, allHistory);
                const best = ranked.length > 0 ? ranked[0] : null;

                if (best && isMounted) {
                    // Pass reference date so explanation makes sense in context
                    const bestExpl = generateNaturalLanguageExplanation(best, allHistory, new Date(selectedPart.date));
                    setBestCandidate({
                        name: best.publisher.name,
                        explanation: bestExpl,
                        score: best.scoreData.score
                    });
                } else if (isMounted) {
                    setBestCandidate(null);
                }

                // 2. Analisar o DESIGNADO (Se houver)
                if (assignedPublisher) {
                    const elig = checkEligibility(
                        assignedPublisher,
                        selectedPart.modalidade as any,
                        selectedPart.funcao as any,
                        {
                            date: selectedPart.date,
                            partTitle: selectedPart.tituloParte,
                            secao: selectedPart.section
                        }
                    );

                    const cdInfo = getCooldownInfo(
                        assignedPublisher.name,
                        selectedPart.tipoParte,
                        allHistory, // Use full history
                        new Date()
                    );

                    const score = calculateScore(
                        assignedPublisher,
                        selectedPart.tipoParte,
                        allHistory,
                        new Date()
                    );

                    const currentCandidateObj: RankedCandidate = { publisher: assignedPublisher, scoreData: score };

                    // NEW: Passamos a data da parte como referência temporal para que "Última designação"
                    // seja relativa à semana que estamos vendo, não a hoje (evita que a própria semana apareça como passado)
                    const natExpl = generateNaturalLanguageExplanation(currentCandidateObj, allHistory, new Date(selectedPart.date));

                    const targetName = assignedPublisher.name.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    const currentPartDate = selectedPart.date;

                    // Filtrar histórico do mesmo tipo (ex: Leitor), excluindo a própria parte atual (pelo ID ou data exata + seção)
                    const sameTypeHistory = allHistory.filter(h => {
                        const hName = (h.resolvedPublisherName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                        if (hName !== targetName || h.tipoParte !== selectedPart.tipoParte) return false;

                        // Excluir a parte atual da estatística de histórico
                        // Se tivermos ID no histórico, ótimo. Se não, usamos data + titulo
                        // Aqui assumimos que se a data for IGUAL e o titulo IGUAL, é a mesma parte.
                        // Mas cuidado com partes repetidas na mesma data.
                        // Melhor usar uma tolerância ou simplesmente ignorar se for a MESMA DATA da selecionada.

                        return h.date !== currentPartDate;
                    }).sort((a, b) => b.date.localeCompare(a.date));

                    // Separar Passado e Futuro
                    // Passado: Data < currentPartDate
                    // Futuro: Data > currentPartDate
                    const pastAssignments = sameTypeHistory.filter(h => h.date < currentPartDate);
                    const futureAssignments = sameTypeHistory.filter(h => h.date > currentPartDate);

                    // Última REALIZADA (a mais recente do passado) - index 0 pois está sorted desc
                    const lastPastDate = pastAssignments.length > 0 ? pastAssignments[0].date : null;

                    // Próxima AGENDADA (a mais próxima do futuro) - precisamos inverter sort ou pegar último do desc
                    // Como está sorted DESC (2026... 2024), os futuros estão no começo. 
                    // O "mais próximo" futuro é o MENOR valor que seja maior que current.
                    // sorted DESC: [FuturoDistante, FuturoProximo, PassadoRecente, PassadoDistante]
                    // futureAssignments estará: [FuturoDistante, FuturoProximo]
                    // O mais próximo é o ultimo do array futureAssignments
                    const nextFutureDate = futureAssignments.length > 0 ? futureAssignments[futureAssignments.length - 1].date : null;

                    if (isMounted) {
                        setEligibility(elig);
                        setCooldown(cdInfo);
                        setScoreData(score);
                        setStats({
                            lastDate: lastPastDate, // Mantendo compatibilidade, mas agora é REALMENTE passado
                            nextDate: nextFutureDate, // Novo campo
                            totalAssignments: sameTypeHistory.length + 1 // +1 contando com a atual
                        });
                        setExplanation(natExpl);
                    }
                } else if (isMounted) {
                    setEligibility(null);
                    setCooldown(null);
                    setScoreData(null);
                    setStats(null);
                    setExplanation(null);
                }

            } catch (error) {
                console.error("Erro ao processar dados do publicador:", error);
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        fetchData();

        return () => { isMounted = false; };
    }, [selectedPart, assignedPublisher, parts, publishers]);


    // Estilo para badges de status
    const getBadgeStyle = (type: 'success' | 'warning' | 'info' | 'error'): React.CSSProperties => {
        const colors = {
            success: { bg: '#DEF7EC', text: '#03543F' },
            warning: { bg: '#FDF6B2', text: '#723B13' },
            info: { bg: '#E1EFFE', text: '#1E40AF' },
            error: { bg: '#FDE8E8', text: '#9B1C1C' },
        };
        return {
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '9999px',
            fontSize: '10px',
            fontWeight: '600',
            backgroundColor: colors[type].bg,
            color: colors[type].text,
        };
    };

    // Formatar status da parte
    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'PENDENTE': return <span style={getBadgeStyle('warning')}>⏳ Pendente</span>;
            case 'CONFIRMED': return <span style={getBadgeStyle('success')}>✅ Confirmada</span>;
            case 'COMPLETED': return <span style={getBadgeStyle('info')}>✓ Concluída</span>;
            case 'CANCELADA': return <span style={getBadgeStyle('error')}>❌ Cancelada</span>;
            default: return <span style={getBadgeStyle('info')}>{status}</span>;
        }
    };

    // Estilos
    const sectionStyle: React.CSSProperties = {
        marginBottom: '16px',
        padding: '12px',
        background: '#F9FAFB',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
    };

    const labelStyle: React.CSSProperties = {
        fontSize: '10px',
        fontWeight: '600',
        color: '#6B7280',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '4px',
    };

    const valueStyle: React.CSSProperties = {
        fontSize: '13px',
        color: '#111827',
        fontWeight: '500',
    };

    return (
        <div style={{ padding: '12px', height: '100%', overflowY: 'auto' }}>
            {selectedPart ? (
                <>
                    {/* Header com título da parte */}
                    <div style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #4F46E5' }}>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', color: '#111827' }}>
                            {selectedPart.tituloParte || selectedPart.tipoParte}
                        </h3>
                        <div style={{ fontSize: '12px', color: '#6B7280' }}>
                            {selectedPart.weekDisplay} • {selectedPart.section}
                        </div>
                    </div>

                    {/* Status e Horário */}
                    <div style={sectionStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={labelStyle}>Status</div>
                            {getStatusBadge(selectedPart.status)}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                                <div style={labelStyle}>Horário</div>
                                <div style={valueStyle}>{selectedPart.horaInicio} - {selectedPart.horaFim}</div>
                            </div>
                            <div>
                                <div style={labelStyle}>Duração</div>
                                <div style={valueStyle}>{selectedPart.duracao}</div>
                            </div>
                        </div>
                    </div>

                    {/* Publicador Designado */}
                    <div style={sectionStyle}>
                        <div style={labelStyle}>Publicador Designado</div>
                        {(selectedPart.resolvedPublisherName || selectedPart.rawPublisherName) ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    background: '#4F46E5',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '14px',
                                    fontWeight: '600',
                                }}>
                                    {(selectedPart.resolvedPublisherName || selectedPart.rawPublisherName || '?').charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div style={valueStyle}>{selectedPart.resolvedPublisherName || selectedPart.rawPublisherName}</div>
                                    {assignedPublisher && (
                                        <div style={{ fontSize: '10px', color: '#6B7280' }}>
                                            {assignedPublisher.gender === 'brother' ? '👨' : '👩'} {assignedPublisher.condition}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div style={{ ...valueStyle, color: '#DC2626', marginTop: '4px' }}>
                                ⚠️ Nenhum publicador designado
                            </div>
                        )}
                    </div>

                    {/* Painel de Análise (Substitui Placeholder) */}
                    {assignedPublisher && (
                        <div style={{ ...sectionStyle, background: '#FFFFFF', borderColor: '#D1D5DB' }}>
                            <div style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '12px', color: '#374151' }}>
                                📊 Análise do Designado
                            </div>

                            {loading ? (
                                <div style={{ fontSize: '11px', color: '#6B7280', fontStyle: 'italic' }}>
                                    Carregando histórico...
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

                                    {/* Elegibilidade */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '11px', color: '#4B5563' }}>Elegibilidade</span>
                                        {eligibility?.eligible ? (
                                            <span style={{ fontSize: '11px', color: '#059669', fontWeight: 'bold' }}>✓ Apto com Louvor</span>
                                        ) : (
                                            <span style={{ fontSize: '11px', color: '#DC2626', fontWeight: 'bold' }}>
                                                ⚠️ {eligibility?.reason || 'Restrição Encontrada'}
                                            </span>
                                        )}
                                    </div>

                                    {/* Cooldown */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '11px', color: '#4B5563' }}>Status de Intervalo</span>
                                        {cooldown?.isInCooldown ? (
                                            <span style={{ fontSize: '11px', color: '#D97706', fontWeight: 'bold' }}>
                                                ⚠️ Em intervalo (Falta {cooldown.cooldownRemaining} sem.)
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '11px', color: '#059669' }}>
                                                ✓ Descansado
                                            </span>
                                        )}
                                    </div>

                                    {/* Estatísticas */}
                                    {stats && (
                                        <>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '11px', color: '#4B5563' }}>Última realizada</span>
                                                <span style={{ fontSize: '11px', fontWeight: '500' }}>
                                                    {stats.lastDate ? new Date(stats.lastDate).toLocaleDateString() : 'Nenhuma (Passado)'}
                                                </span>
                                            </div>

                                            {stats.nextDate && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: '#D97706' }}>
                                                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>Próxima agendada</span>
                                                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>
                                                        {new Date(stats.nextDate).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: '11px', color: '#4B5563' }}>Total (Histórico)</span>
                                                <span style={{ fontSize: '11px', fontWeight: '500' }}>
                                                    {stats.totalAssignments}x {stats.totalAssignments === 1 && !stats.lastDate ? '(Esta vez)' : ''}
                                                </span>
                                            </div>
                                        </>
                                    )}

                                    {/* X-RAY NATURAL (Novo) */}
                                    {scoreData && explanation && (
                                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #E5E7EB' }}>
                                            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#6B7280', marginBottom: '8px' }}>
                                                🧠 Análise do Agente
                                            </div>

                                            {/* Explicação do Atual */}
                                            <div style={{
                                                background: '#F3F4F6',
                                                padding: '10px',
                                                borderRadius: '8px',
                                                fontSize: '11px',
                                                color: '#374151',
                                                marginBottom: '8px',
                                                borderLeft: '3px solid #6366F1'
                                            }}>
                                                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Sobre {assignedPublisher.name}:</div>
                                                <div style={{ whiteSpace: 'pre-wrap' }}>{explanation}</div>
                                                <div style={{ marginTop: '6px', fontSize: '10px', opacity: 0.8 }}>
                                                    Score: {scoreData.score}
                                                </div>
                                            </div>

                                            {/* Comparação com o Melhor (Se for diferente e melhor) */}
                                            {bestCandidate && bestCandidate.name !== assignedPublisher.name && bestCandidate.score > scoreData.score && (
                                                <div style={{
                                                    background: '#ECFDF5',
                                                    padding: '10px',
                                                    borderRadius: '8px',
                                                    fontSize: '11px',
                                                    color: '#065F46',
                                                    marginTop: '8px',
                                                    borderLeft: '3px solid #10B981'
                                                }}>
                                                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                                                        💡 Sugestão do Sistema: {bestCandidate.name}
                                                    </div>
                                                    <div style={{ whiteSpace: 'pre-wrap' }}>{bestCandidate.explanation}</div>
                                                    <div style={{ marginTop: '6px', fontSize: '10px', opacity: 0.8 }}>
                                                        Score: {bestCandidate.score} (Maior prioridade)
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Detalhes da Parte */}
                    {selectedPart.descricaoParte && (
                        <div style={sectionStyle}>
                            <div style={labelStyle}>Descrição</div>
                            <div style={{ fontSize: '12px', color: '#374151', marginTop: '4px' }}>
                                {selectedPart.descricaoParte}
                            </div>
                        </div>
                    )}

                    {/* Função (Titular/Ajudante) */}
                    <div style={sectionStyle}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                                <div style={labelStyle}>Função</div>
                                <div style={valueStyle}>{selectedPart.funcao}</div>
                            </div>
                            <div>
                                <div style={labelStyle}>Modalidade</div>
                                <div style={valueStyle}>{selectedPart.modalidade || '—'}</div>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#9CA3AF',
                    textAlign: 'center',
                    padding: '20px',
                }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>👆</div>
                    <div style={{ fontWeight: '500', marginBottom: '8px' }}>Selecione uma parte</div>
                    <div style={{ fontSize: '12px' }}>
                        Clique em uma parte na lista do carrossel para ver detalhes e opções de ação.
                    </div>
                </div>
            )}
        </div>
    );
}
