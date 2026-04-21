import { useState, useEffect, useMemo } from 'react';
import type { Publisher, WorkbookPart, HistoryRecord, SpecialEvent } from '../types';
import { checkEligibility, buildEligibilityContext, type EligibilityResult } from '../services/eligibilityService';
import { getBlockInfo, type CooldownInfo } from '../services/cooldownService';
import { calculateScore, getRankedCandidates, isStatPart, type RotationScore } from '../services/unifiedRotationService';
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
    weeklyEvents?: SpecialEvent[]; // NEW: Receber eventos da semana
}

interface PublisherStats {
    lastDate: string | null;
    lastGeneralDate?: string | null; // NEW: Última participação em QUALQUER parte (excluindo orações/leitura bíblia se não contar)
    nextDate?: string | null; // NEW
    totalAssignments: number;
}

export default function ActionControlPanel({ selectedPartId, parts, publishers, historyRecords, weeklyEvents = [] }: Props) {
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
    const [bestCandidate, setBestCandidate] = useState<{ name: string; score: number } | null>(null);
    const [topCandidates, setTopCandidates] = useState<Array<{ name: string; score: number }>>([]);
    const [loading, setLoading] = useState(false);
    
    // Memoized impacts for the selected part
    const partImpacts = useMemo(() => {
        if (!selectedPartId || !weeklyEvents.length) return [];
        const impactsList: { event: SpecialEvent, action: string, minutes?: number }[] = [];
        
        weeklyEvents.forEach(ev => {
            const rawImpacts = (ev as any).impacts || [];
            rawImpacts.forEach((imp: any) => {
                const affectedIds = imp.affectedPartIds || (imp.targetPartId ? [imp.targetPartId] : []);
                if (affectedIds.includes(selectedPartId)) {
                    impactsList.push({ 
                        event: ev, 
                        action: imp.action, 
                        minutes: imp.minutes 
                    });
                }
            });
        });
        return impactsList;
    }, [selectedPartId, weeklyEvents]);

    useEffect(() => {
        let isMounted = true;

        async function fetchData() {
            if (!selectedPart || !assignedPublisher) {
                if (isMounted) { // Ensure safe state update
                    setEligibility(null);
                    setCooldown(null);
                    setStats(null);
                    setScoreData(null);
                    setBestCandidate(null);
                    setTopCandidates([]);
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

                // Criar o contexto usando o builder oficial (resolve gênero do titular)
                const weekParts = parts.filter(p => p.weekId === selectedPart.weekId);
                const eligibilityCtx = buildEligibilityContext(selectedPart, weekParts, publishers);

                // 1. Calcular o MELHOR CANDIDATO (Top Recommendation)
                const eligibleCandidates = publishers.filter(p =>
                    checkEligibility(p, selectedPart.modalidade as any, selectedPart.funcao as any, eligibilityCtx).eligible
                );

                const ranked = getRankedCandidates(eligibleCandidates, selectedPart.tipoParte, allHistory);
                const best = ranked.length > 0 ? ranked[0] : null;

                if (isMounted) {
                    setTopCandidates(
                        ranked.slice(0, 2).map(item => ({
                            name: item.publisher.name,
                            score: item.scoreData.score
                        }))
                    );
                }

                if (best && isMounted) {
                    setBestCandidate({
                        name: best.publisher.name,
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
                        eligibilityCtx
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
                    }
                } else if (isMounted) {
                    setEligibility(null);
                    setCooldown(null);
                    setScoreData(null);
                    setStats(null);
                    setTopCandidates([]);
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
        padding: '12px 10px',
        background: '#F9FAFB',
        minHeight: '100%',
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

    const formatDate = (value?: string | null) => {
        if (!value) return '';
        const safeDate = new Date(`${value}T12:00:00`);
        return safeDate.toLocaleDateString('pt-BR');
    };

    const firstName = assignedPublisher?.name?.split(' ')[0] || 'O publicador';
    const hasManualOverride = !!(bestCandidate && assignedPublisher && scoreData && bestCandidate.name !== assignedPublisher.name && bestCandidate.score > scoreData.score);
    const isAssignedTopScored = !!(bestCandidate && assignedPublisher && bestCandidate.name === assignedPublisher.name);

    const unifiedNarrative = useMemo(() => {
        if (!assignedPublisher || !selectedPart || !scoreData) return null;

        const parts: string[] = [];

        if (cooldown?.isInCooldown) {
            const weekOrDate = cooldown.weekDisplay || formatWeekFromDate(cooldown.lastDate || '') || formatDate(cooldown.lastDate);
            parts.push(`${firstName} realizou "${cooldown.lastPartType}" na semana de ${weekOrDate}; o recomendado é aguardar 3 semanas entre partes principais.`);
        }

        if (scoreData.details.frequencyPenalty > 50) {
            parts.push(`${firstName} participou bastante nos últimos 3 meses; isso reduz um pouco a prioridade geral.`);
        } else if (scoreData.details.frequencyPenalty > 0) {
            parts.push(`${firstName} teve algumas designações recentes; isso foi considerado no cálculo de prioridade.`);
        } else {
            parts.push(`${firstName} está com a agenda mais livre nos últimos 3 meses.`);
        }

        if (hasManualOverride && bestCandidate) {
            parts.push(`O sistema teria indicado ${bestCandidate.name} como mais adequado aos critérios abaixo, mas o SRVM optou por esta designação por decisão manual.`);
        } else if (isAssignedTopScored) {
            parts.push(`Neste caso, o designado também aparece como o melhor pontuado pelos critérios abaixo.`);
        } else {
            parts.push(`Pelos critérios abaixo, esta designação está coerente com o quadro atual.`);
        }

        return parts.join(' ');
    }, [assignedPublisher, bestCandidate, cooldown, firstName, hasManualOverride, isAssignedTopScored, scoreData, selectedPart]);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ width: '100%', height: '2px', backgroundColor: '#4F46E5', flexShrink: 0 }}></div>
            <div style={{ flex: 1, overflowY: 'auto', background: '#F9FAFB' }}>
                {selectedPart ? (
                    <div style={sectionStyle}>
                        {/* Status e Título */}
                        <div style={{ paddingBottom: '12px', borderBottom: '1px solid #E5E7EB', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <div style={{ ...labelStyle, marginBottom: '2px' }}>Status</div>
                                    <div style={{ color: '#DC2626', fontSize: '14px', fontWeight: 'bold', lineHeight: 1.2 }}>
                                        {selectedPart.tituloParte || selectedPart.tipoParte}
                                    </div>
                                </div>
                                <div style={{ marginTop: '2px' }}>
                                    {getStatusBadge(selectedPart.status)}
                                </div>
                            </div>
                            {/* Badges de Eventos no Título */}
                            {partImpacts.length > 0 && (
                                <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                                    {partImpacts.map((imp, idx) => (
                                        <span key={idx} style={{ 
                                            fontSize: '10px', 
                                            background: '#FEF3C7', 
                                            color: '#92400E', 
                                            padding: '1px 6px', 
                                            borderRadius: '4px', 
                                            border: '1px dotted #F59E0B',
                                            fontWeight: '600'
                                        }}>
                                            ✨ {imp.action === 'REDUCE_TIME' ? `Tempo -${imp.minutes}m` : imp.action === 'CANCEL' ? 'Cancelada' : 'Vínculo Evento'}
                                        </span>
                                    ))}
                                </div>
                            )}
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

                                        {/* Status rápido sem duplicar explicação */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                            <span style={{
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                                background: eligibility?.eligible ? '#ECFDF5' : '#FEF2F2',
                                                color: eligibility?.eligible ? '#059669' : '#DC2626',
                                                padding: '2px 6px',
                                                borderRadius: '4px'
                                            }}>
                                                {eligibility?.eligible ? '✓ Elegível' : '⚠️ Inelegível'}
                                            </span>
                                            <span style={{
                                                fontSize: '11px',
                                                background: cooldown?.isInCooldown ? '#FFFBEB' : '#ECFDF5',
                                                color: cooldown?.isInCooldown ? '#B45309' : '#059669',
                                                padding: '2px 6px',
                                                borderRadius: '4px'
                                            }}>
                                                {cooldown?.isInCooldown ? '⏳ Intervalo recomendado ativo' : '✓ Intervalo ok'}
                                            </span>
                                        </div>

                                        {/* 2. Explicação em Linguagem Natural (Texto Único) */}
                                        {unifiedNarrative && (
                                            <div style={{
                                                background: '#FFFFFF',
                                                padding: '10px',
                                                borderRadius: '6px',
                                                fontSize: '11px',
                                                color: '#334155',
                                                borderLeft: `3px solid ${hasManualOverride ? '#F59E0B' : '#6366F1'}`,
                                                lineHeight: '1.5',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                            }}>
                                                <div style={{ fontWeight: '600', marginBottom: '6px', color: hasManualOverride ? '#B45309' : '#475569' }}>
                                                    {hasManualOverride ? '✋ Explicação da Designação (com intervenção manual)' : '📋 Explicação da Designação'}
                                                </div>
                                                <div style={{ whiteSpace: 'normal' }}>
                                                    {cooldown?.isInCooldown && (
                                                        <span style={{ color: '#B45309', fontWeight: 600 }}>
                                                            Intervalo recomendado:
                                                        </span>
                                                    )}{' '}
                                                    {cooldown?.isInCooldown && (
                                                        <span>
                                                            {firstName} realizou "{cooldown.lastPartType}" na semana de {cooldown.weekDisplay || formatWeekFromDate(cooldown.lastDate || '')}; o recomendado é aguardar 3 semanas entre partes principais.{" "}
                                                        </span>
                                                    )}

                                                    <span style={{ color: '#1D4ED8', fontWeight: 600 }}>
                                                        Frequência recente:
                                                    </span>{' '}
                                                    <span>
                                                        {scoreData && scoreData.details.frequencyPenalty > 50
                                                            ? `${firstName} participou bastante nos últimos 3 meses; isso reduz um pouco a prioridade geral.`
                                                            : scoreData && scoreData.details.frequencyPenalty > 0
                                                                ? `${firstName} teve algumas designações recentes; isso foi considerado no cálculo de prioridade.`
                                                                : `${firstName} está com a agenda mais livre nos últimos 3 meses.`}
                                                        {' '}
                                                    </span>

                                                    <span style={{ color: hasManualOverride ? '#B45309' : '#047857', fontWeight: 600 }}>
                                                        {hasManualOverride ? 'Decisão final do SRVM:' : 'Conclusão do sistema:'}
                                                    </span>{' '}
                                                    <span>
                                                        {hasManualOverride && bestCandidate
                                                            ? `O sistema teria indicado ${bestCandidate.name} como mais adequado aos critérios abaixo, mas o SRVM optou por esta designação por decisão manual.`
                                                            : isAssignedTopScored
                                                                ? 'Neste caso, o designado também aparece como o melhor pontuado pelos critérios abaixo.'
                                                                : 'Pelos critérios abaixo, esta designação está coerente com o quadro atual.'}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {/* 2.1 Critérios Técnicos (Resumo) */}
                                        {scoreData && (
                                            <div style={{
                                                background: '#F8FAFC',
                                                border: '1px solid #E2E8F0',
                                                borderRadius: '6px',
                                                padding: '8px 10px',
                                                fontSize: '10px',
                                                color: '#334155',
                                                lineHeight: '1.45'
                                            }}>
                                                <div style={{ fontWeight: 700, marginBottom: '4px', color: '#334155' }}>
                                                    Critérios usados na avaliação
                                                </div>
                                                <div><strong style={{ color: '#2563EB' }}>Elegibilidade:</strong> verifica atuação ativa, desqualificação, pedido de não participação, disponibilidade na data, restrição "só ajudante", permissões por seção (Tesouros/Ministério/Vida Cristã), compatibilidade de função (Titular/Ajudante), gênero/batismo e privilégios específicos da modalidade (presidir, orar, ensinar, dirigir/ler EBC, etc.).</div>
                                                <div><strong style={{ color: '#7C3AED' }}>Intervalo:</strong> verifica partes principais recentes (regra de 3 semanas).</div>
                                                <div><strong style={{ color: '#0F766E' }}>Tempo desde última similar:</strong> quanto mais tempo sem parte do mesmo tipo, maior prioridade.</div>
                                                <div><strong style={{ color: '#B45309' }}>Frequência recente:</strong> muitas designações no período reduzem prioridade.</div>
                                                <div><strong style={{ color: '#334155' }}>Pontuação final:</strong> {scoreData.score} (base + tempo - frequência - penalidades + bônus).</div>
                                            </div>
                                        )}

                                        {/* 3. Top 2 candidatos */}
                                        {topCandidates.length > 0 && (
                                            <div style={{
                                                marginTop: '4px',
                                                paddingTop: '8px',
                                                borderTop: '1px solid #F3F4F6',
                                                fontSize: '10px',
                                                color: '#475569'
                                            }}>
                                                <div style={{ fontWeight: 700, marginBottom: '4px' }}>Mais indicados (Top 2)</div>
                                                {topCandidates.map((item, idx) => (
                                                    <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                                        <span>{idx + 1}. {item.name}</span>
                                                        <span style={{ fontWeight: 600 }}>Score {item.score}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}


                                    </div>
                                )}
                            </div>
                        )}

                        {/* Seção de Eventos da Semana (Sempre visível se houver) */}
                        {weeklyEvents.length > 0 && (
                            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '2px solid #E5E7EB' }}>
                                <div style={{ ...labelStyle, color: '#0369A1' }}>📅 Contexto da Semana (Eventos)</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                                    {weeklyEvents.map(ev => (
                                        <div key={ev.id} style={{ 
                                            background: '#EFF6FF', 
                                            padding: '8px', 
                                            borderRadius: '6px', 
                                            border: '1px solid #BFDBFE',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '2px'
                                        }}>
                                            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#1E40AF' }}>{ev.theme || 'Evento Especial'}</div>
                                            {ev.observations && (
                                                <div style={{ fontSize: '10px', color: '#60A5FA', fontStyle: 'italic' }}>{ev.observations}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
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
        </div >
    );
}
