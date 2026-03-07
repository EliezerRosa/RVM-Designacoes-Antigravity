import { useState, useEffect } from 'react';
import type { Publisher, WorkbookPart, HistoryRecord } from '../types';
import { checkEligibility, type EligibilityResult } from '../services/eligibilityService';
import { getBlockInfo, type CooldownInfo } from '../services/cooldownService';
import { calculateScore, getRankedCandidates, generateNaturalLanguageExplanation, isStatPart, type RotationScore, type RankedCandidate } from '../services/unifiedRotationService';
import { isNonDesignatablePart, isCleanablePart, isAutoAssignedToChairman } from '../constants/mappings';
import { workbookPartToHistoryRecord } from '../services/historyAdapter';
import { formatWeekFromDate } from '../utils/dateUtils';

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
    lastGeneralDate?: string | null; // NEW: Última participação em QUALQUER parte (excluindo orações/leitura bíblia se não contar)
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
                if (isMounted) { // Ensure safe state update
                    setEligibility(null);
                    setCooldown(null);
                    setStats(null);
                    setScoreData(null);
                    setExplanation(null);
                    setBestCandidate(null);
                }
                return;
            }

            setLoading(true);
            try {
                // Usar o histórico completo fornecido via props
                // Memoize or assume stable inside effect
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
                        selectedPart.modalidade as any, // Cast to any to accept string
                        selectedPart.funcao as any,
                        {
                            date: selectedPart.date,
                            partTitle: selectedPart.tituloParte,
                            secao: selectedPart.section
                        }
                    );

                    // v9.5: Filtrar histórico para excluir a semana ATUAL
                    // Evita que a designação atual afete o cooldown/score (loop)
                    const historyForCooldown = allHistory.filter(h => h.weekId !== selectedPart.weekId);

                    const cdInfo = getBlockInfo(
                        assignedPublisher.name,
                        historyForCooldown, // Use filtered history
                        new Date()
                    );

                    const score = calculateScore(
                        assignedPublisher,
                        selectedPart.tipoParte,
                        historyForCooldown, // Use filtered history
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
                        return h.date !== currentPartDate;
                    }).sort((a, b) => b.date.localeCompare(a.date));

                    const pastAssignments = sameTypeHistory.filter(h => h.date < currentPartDate);
                    const futureAssignments = sameTypeHistory.filter(h => h.date > currentPartDate);
                    const lastPastDate = pastAssignments.length > 0 ? pastAssignments[0].date : null;

                    const generalHistory = allHistory.filter(h => {
                        const hName = (h.resolvedPublisherName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                        return hName === targetName && h.date < currentPartDate && isStatPart(h.tipoParte || h.funcao);
                    }).sort((a, b) => b.date.localeCompare(a.date));

                    const lastGeneralDate = generalHistory.length > 0 ? generalHistory[0].date : null;
                    const nextFutureDate = futureAssignments.length > 0 ? futureAssignments[futureAssignments.length - 1].date : null;

                    if (isMounted) {
                        setEligibility(elig);
                        setCooldown(cdInfo);
                        setScoreData(score);
                        setStats({
                            lastDate: lastPastDate,
                            lastGeneralDate: lastGeneralDate,
                            nextDate: nextFutureDate,
                            totalAssignments: sameTypeHistory.length + 1
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedPart?.id, selectedPart?.resolvedPublisherName, selectedPart?.rawPublisherName, assignedPublisher?.name, parts.length, publishers.length]); // Stabilize deps


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
        borderTop: '2px solid #4F46E5',
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
        <div style={{ height: '100%', overflowY: 'auto' }}>
            {selectedPart ? (
                <>
                    <div style={sectionStyle}>
                        {/* Status e Horário */}
                        <div style={{ paddingBottom: '16px', borderBottom: '1px solid #E5E7EB', marginBottom: '16px' }}>
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
                        <div style={{ paddingBottom: assignedPublisher ? '16px' : 0, borderBottom: assignedPublisher ? '1px solid #E5E7EB' : 'none', marginBottom: assignedPublisher ? '16px' : 0 }}>
                            <div style={labelStyle}>Publicador Designado</div>

                            {/* Verificação de Parte Não Designável (Ex: Cântico) */}
                            {eligibility?.reason === 'Cânticos não são designados' ? (
                                <div style={{ fontSize: '12px', color: '#9CA3AF', fontStyle: 'italic', padding: '8px 0' }}>
                                    (Não se aplica a esta parte)
                                </div>
                            ) : (selectedPart.resolvedPublisherName || selectedPart.rawPublisherName) ? (
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
                                            <div style={{ fontSize: '11px', color: '#4B5563', marginTop: '2px', lineHeight: '1.4' }}>
                                                <div style={{ fontWeight: '500', color: '#1F2937' }}>
                                                    {assignedPublisher.gender === 'brother' ? '👨' : '👩'} {assignedPublisher.condition} • {assignedPublisher.isBaptized ? 'Batizado' : 'Não Batizado'} • {assignedPublisher.ageGroup}
                                                </div>
                                                <div style={{ fontSize: '10px', color: '#6B7280', marginTop: '2px' }}>
                                                    <strong>Privilégios:</strong> {[
                                                        assignedPublisher.privileges.canPreside && 'Presidente',
                                                        assignedPublisher.privileges.canGiveTalks && 'Orador',
                                                        assignedPublisher.privileges.canPray && 'Oração',
                                                        assignedPublisher.privileges.canReadCBS && 'Leitor',
                                                        assignedPublisher.isHelperOnly && 'Apenas Ajudante'
                                                    ].filter(Boolean).join(', ') || 'Nenhum específico'}
                                                </div>
                                            </div>
                                        )}
                                        <div style={{ marginTop: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {assignedPublisher?.privilegesBySection?.canParticipateInTreasures && (
                                                <span style={{ fontSize: '10px', background: '#F3F4F6', color: '#374151', padding: '2px 6px', borderRadius: '4px', border: '1px solid #E5E7EB' }}>📖 Tesouros</span>
                                            )}
                                            {assignedPublisher?.privilegesBySection?.canParticipateInMinistry && (
                                                <span style={{ fontSize: '10px', background: '#FFFBEB', color: '#92400E', padding: '2px 6px', borderRadius: '4px', border: '1px solid #FDE68A' }}>🌾 Ministério</span>
                                            )}
                                            {assignedPublisher?.privilegesBySection?.canParticipateInLife && (
                                                <span style={{ fontSize: '10px', background: '#FEF2F2', color: '#991B1B', padding: '2px 6px', borderRadius: '4px', border: '1px solid #FECACA' }}>❤️ Vida Cristã</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ ...valueStyle, color: '#DC2626', marginTop: '4px' }}>
                                    ⚠️ Nenhum publicador designado
                                </div>
                            )}
                        </div>

                        {/* Painel de Análise Unificado */}
                        {assignedPublisher && (
                            <div>
                                <div style={{
                                    marginBottom: '12px',
                                    borderBottom: '1px solid #E5E7EB',
                                    paddingBottom: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '12px', color: '#374151' }}>
                                        {selectedPart && isCleanablePart(selectedPart.tipoParte) ? (
                                            <span>🚫 Não Requer Designação</span>
                                        ) : selectedPart && isAutoAssignedToChairman(selectedPart.tipoParte) ? (
                                            <span>🤖 Auto-Designação</span>
                                        ) : (
                                            <span>📊 Análise & Status</span>
                                        )}
                                    </span>
                                    {scoreData && !isNonDesignatablePart(selectedPart?.tipoParte || '') && (
                                        <span style={{ fontSize: '10px', color: '#6B7280', background: '#E5E7EB', padding: '2px 6px', borderRadius: '4px' }}>
                                            Score: {scoreData.score}
                                        </span>
                                    )}
                                </div>

                                {/* Conteúdo da Análise - Bloqueado para partes não designáveis */}
                                {selectedPart && isCleanablePart(selectedPart.tipoParte) ? (
                                    <div style={{
                                        padding: '16px',
                                        textAlign: 'center',
                                        color: '#6B7280',
                                        fontSize: '12px',
                                        background: '#F3F4F6',
                                        borderRadius: '6px',
                                        fontStyle: 'italic'
                                    }}>
                                        Esta parte (Cântico, etc.) não requer designação manual.
                                        <br />
                                        O sistema limpará qualquer nome atribuído automaticamente.
                                    </div>
                                ) : selectedPart && isAutoAssignedToChairman(selectedPart.tipoParte) ? (
                                    <div style={{
                                        padding: '16px',
                                        textAlign: 'center',
                                        color: '#4F46E5', // Indigo
                                        fontSize: '12px',
                                        background: '#EEF2FF',
                                        borderRadius: '6px',
                                        border: '1px solid #C7D2FE'
                                    }}>
                                        <strong>🤖 Auto-Designação</strong>
                                        <br />
                                        Esta parte é atribuída automaticamente ao Presidente da Reunião.
                                    </div>
                                ) : loading ? (
                                    <div style={{ fontSize: '11px', color: '#6B7280', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>
                                        Carregando análise...
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

                                        {/* 1. Alertas de Bloqueio/Aviso (Prioridade Máxima) */}
                                        {(!eligibility?.eligible || cooldown?.isInCooldown) ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                {!eligibility?.eligible && (
                                                    <div style={{ fontSize: '11px', color: '#DC2626', background: '#FEF2F2', padding: '6px', borderRadius: '4px', border: '1px solid #FECACA' }}>
                                                        <strong>🚫 Inelegível:</strong> {eligibility?.reason}
                                                    </div>
                                                )}
                                                {cooldown?.isInCooldown && (
                                                    <div style={{ fontSize: '11px', color: '#B45309', background: '#FFFBEB', padding: '6px', borderRadius: '4px', border: '1px solid #FDE68A' }}>
                                                        <strong>⚠️ Em Intervalo:</strong> {cooldown.weeksSinceLast >= 0
                                                            ? <><strong>Participações Passadas:</strong> Realizou {cooldown.lastPartType} na {cooldown.weekDisplay || formatWeekFromDate(cooldown.lastDate || '')}.</>
                                                            : <><strong>Designações Futuras:</strong> Designado para {cooldown.lastPartType} na {cooldown.weekDisplay || formatWeekFromDate(cooldown.lastDate || '')}.</>

                                                        }
                                                        <div style={{ marginTop: '4px', fontSize: '10px', fontWeight: 'normal', color: '#92400E' }}>
                                                            (Convenção: Aguardar 3 semanas após partes principais. Pode ser ignorada manualmente.)
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            // Se tudo ok, mostra indicador discreto
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '11px', color: '#059669', fontWeight: 'bold', background: '#ECFDF5', padding: '2px 6px', borderRadius: '4px' }}>
                                                    ✓ Elegível
                                                </span>
                                                {!cooldown?.isInCooldown && (
                                                    <span style={{ fontSize: '11px', color: '#059669', background: '#ECFDF5', padding: '2px 6px', borderRadius: '4px' }}>
                                                        ✓ Descansado
                                                    </span>
                                                )}
                                                {/* Exibir Disponibilidade */}
                                                {assignedPublisher.availability && (
                                                    <span style={{
                                                        fontSize: '11px',
                                                        color: assignedPublisher.availability.mode === 'always' ? '#059669' : '#B45309',
                                                        background: assignedPublisher.availability.mode === 'always' ? '#ECFDF5' : '#FFFBEB',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px'
                                                    }}>
                                                        {assignedPublisher.availability.mode === 'always' ? '📅 Disponível (Padrão)' : '📅 Disponibilidade Limitada'}
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* 2. Explicação em Linguagem Natural (O Coração da Análise) */}
                                        {explanation && (
                                            <div style={{
                                                background: '#FFFFFF',
                                                padding: '10px',
                                                borderRadius: '6px',
                                                fontSize: '11px',
                                                color: '#334155',
                                                borderLeft: '3px solid #6366F1',
                                                lineHeight: '1.4',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                            }}>
                                                <div style={{ fontWeight: '600', marginBottom: '4px', color: '#475569' }}>
                                                    Análise do Sistema:
                                                </div>
                                                <div style={{ whiteSpace: 'pre-wrap' }}>{explanation}</div>
                                            </div>
                                        )}

                                        {/* 3. Dados Específicos de Apoio (Contexto Fino) */}
                                        {stats && (
                                            <div style={{
                                                marginTop: '4px',
                                                paddingTop: '8px',
                                                borderTop: '1px solid #F3F4F6',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                fontSize: '10px',
                                                color: '#6B7280'
                                            }}>
                                                <div>
                                                    <span style={{ display: 'block', fontWeight: 'bold', marginBottom: '1px' }}>Última vez neste tipo de parte:</span>
                                                    {stats.lastDate ? new Date(stats.lastDate).toLocaleDateString() : 'Nenhuma (Histórico)'}
                                                </div>

                                                {stats.nextDate && (
                                                    <div style={{ textAlign: 'right', color: '#D97706' }}>
                                                        <span style={{ display: 'block', fontWeight: 'bold', marginBottom: '1px' }}>Próxima Agendada:</span>
                                                        {new Date(stats.nextDate).toLocaleDateString()}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* 4. Sugestão de Melhor Candidato (Se existir e for melhor) */}
                                        {bestCandidate && bestCandidate.name !== assignedPublisher.name && bestCandidate.score > (scoreData?.score || 0) && (
                                            <div style={{
                                                marginTop: '8px',
                                                background: '#ECFDF5',
                                                padding: '8px',
                                                borderRadius: '6px',
                                                fontSize: '11px',
                                                border: '1px solid #A7F3D0'
                                            }}>
                                                <div style={{ color: '#047857', fontWeight: 'bold', marginBottom: '2px' }}>
                                                    💡 Sugestão: {bestCandidate.name} (Score {bestCandidate.score})
                                                </div>
                                                <div style={{ color: '#065F46', fontSize: '10px' }}>
                                                    {bestCandidate.explanation.split('\n')[0]} {/* Só a primeira linha da explicação */}
                                                </div>
                                            </div>
                                        )}

                                    </div>
                                )}
                            </div>
                        )}
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
            )
            }
        </div >
    );
}
