import { useState, useEffect, useMemo } from 'react';
import type { Publisher, WorkbookPart, HistoryRecord, SpecialEvent } from '../types';
import { checkEligibility, buildEligibilityContext, getTextualConstraintSummary, type EligibilityResult } from '../services/eligibilityService';
import { getBlockInfo, isBlocked, type CooldownInfo } from '../services/cooldownService';
import { calculateScore, getRankedCandidates, isStatPart, type RotationScore } from '../services/unifiedRotationService';
import { isNonDesignatablePart, isCleanablePart, isAutoAssignedToChairman } from '../constants/mappings';
import { workbookPartToHistoryRecord } from '../services/historyAdapter';
import { formatWeekFromDate } from '../utils/dateUtils';
import { usePublisherProfileNotifications } from '../hooks/usePublisherProfileNotifications';
import { ProfileChangeTooltipChip } from './admin/ProfileChangeTooltipChip';
import { workbookManagementService } from '../services/workbookManagementService';
import { validatePublisherName } from '../utils/publisherNameValidation';

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
    onDataChange?: () => void; // 2026-05-26: para refresh após limpar designação órfã
}

interface PublisherStats {
    lastDate: string | null;
    lastGeneralDate?: string | null; // NEW: Última participação em QUALQUER parte (excluindo orações/leitura bíblia se não contar)
    nextDate?: string | null; // NEW
    totalAssignments: number;
}

interface CandidatePanelItem {
    name: string;
    score: number;
    lastDate: string | null;
    cooldownInfo: CooldownInfo | null;
}

function compareIsoDates(a?: string | null, b?: string | null): number {
    if (!a || !b) return 0;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

export default function ActionControlPanel({ selectedPartId, parts, publishers, historyRecords, weeklyEvents = [], onDataChange }: Props) {
    const selectedPart = parts.find(p => p.id === selectedPartId);
    const [isClearingOrphan, setIsClearingOrphan] = useState(false);

    // Buscar o publicador designado para esta parte.
    // Fallback em 3 fontes (alinha com a lista do PowerfulAgentTab):
    //   1) resolvedPublisherName (canônico)
    //   2) rawPublisherName (string da apostila)
    //   3) resolvedPublisherId → publishers.find(...) (quando o nome não foi resolvido mas o id está gravado)
    const nameFromFields = selectedPart?.resolvedPublisherName || selectedPart?.rawPublisherName;
    const publisherById = selectedPart?.resolvedPublisherId
        ? publishers.find(pub => pub.id === selectedPart.resolvedPublisherId)
        : undefined;
    const assignedPublisher = nameFromFields
        ? publishers.find(pub => pub.name.toLowerCase() === nameFromFields.toLowerCase()) || publisherById || null
        : publisherById || null;
    const effectiveName = nameFromFields || assignedPublisher?.name;

    // Estados para dados assíncronos
    const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
    const [cooldown, setCooldown] = useState<CooldownInfo | null>(null);
    const [, setStats] = useState<PublisherStats | null>(null);
    const [scoreData, setScoreData] = useState<RotationScore | null>(null);
    const [bestCandidate, setBestCandidate] = useState<{ name: string; score: number } | null>(null);
    const [topCandidates, setTopCandidates] = useState<CandidatePanelItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [showPartHistory, setShowPartHistory] = useState(false);
    const { notifications: profileChangeNotifications } = usePublisherProfileNotifications();

    const weekParts = useMemo(
        () => (selectedPart ? parts.filter(p => p.weekId === selectedPart.weekId) : []),
        [parts, selectedPart]
    );

    const eligibilityCtx = useMemo(
        () => (selectedPart ? buildEligibilityContext(selectedPart, weekParts, publishers) : undefined),
        [selectedPart, weekParts, publishers]
    );

    const textualConstraintSummary = useMemo(
        () => (eligibilityCtx ? getTextualConstraintSummary(eligibilityCtx) : { active: false, labels: [] }),
        [eligibilityCtx]
    );

    // Item 4: Todos os participantes deste tipo de parte, ordenados por data DESC,
    // com delta em dias em relação à semana foco.
    const partTypeHistory = useMemo(() => {
        if (!selectedPart) return [];
        const weekFocusDateStr = selectedPart.date || selectedPart.weekId || '';
        const weekFocusDate = new Date(weekFocusDateStr + 'T12:00:00');
        return historyRecords
            .filter(h => h.tipoParte === selectedPart.tipoParte)
            .sort((a, b) => b.date.localeCompare(a.date))
            .map(h => {
                const histDate = new Date(h.date + 'T12:00:00');
                const deltaDays = Math.round((histDate.getTime() - weekFocusDate.getTime()) / (1000 * 60 * 60 * 24));
                return { ...h, deltaDays };
            });
    }, [historyRecords, selectedPart]);
    
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
                if (!eligibilityCtx) {
                    if (isMounted) {
                        setTopCandidates([]);
                        setBestCandidate(null);
                    }
                    return;
                }

                // 1. Calcular o MELHOR CANDIDATO (Top Recommendation)
                const eligibleCandidates = publishers.filter(p =>
                    checkEligibility(p, selectedPart.modalidade as any, selectedPart.funcao as any, eligibilityCtx).eligible
                );

                // Usar a data da parte como referência (não hoje) e filtrar histórico
                // da semana atual — mesma fonte usada pelo agente (CHECK_SCORE/EXPLAIN_PART)
                const partDateStr = selectedPart.date || selectedPart.weekId || '';
                const targetDate = partDateStr ? new Date(`${partDateStr}T12:00:00`) : new Date();
                const historyForRanking = allHistory.filter(h => h.weekId !== selectedPart.weekId);
                const ranked = getRankedCandidates(eligibleCandidates, selectedPart.tipoParte, historyForRanking, undefined, targetDate);
                const rankedNonBlocked = ranked.filter(r => !isBlocked(r.publisher.name, historyForRanking, targetDate, r.publisher.id));
                const best = rankedNonBlocked.length > 0 ? rankedNonBlocked[0] : null;

                if (isMounted) {
                    setTopCandidates(
                        ranked.slice(0, 4).map(item => ({
                            name: item.publisher.name,
                            score: item.scoreData.score,
                            lastDate: item.scoreData.lastDate || null,
                            cooldownInfo: getBlockInfo(item.publisher.name, historyForRanking, targetDate, item.publisher.id)
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
                        targetDate,
                        assignedPublisher.id
                    );

                    const score = calculateScore(
                        assignedPublisher,
                        selectedPart.tipoParte,
                        historyForCooldown, // Use filtered history
                        targetDate
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
    }, [selectedPart?.id, selectedPart?.resolvedPublisherName, selectedPart?.rawPublisherName, assignedPublisher?.name, parts.length, publishers.length, eligibilityCtx]); // Stabilize deps


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
            case 'PROPOSTA': return <span style={getBadgeStyle('warning')}>Aguardando resposta</span>;
            case 'APROVADA':
            case 'DESIGNADA': return <span style={getBadgeStyle('success')}>Confirmada</span>;
            case 'CONCLUIDA': return <span style={getBadgeStyle('info')}>✓ Concluída</span>;
            case 'REJEITADA': return <span style={getBadgeStyle('error')}>Devolvida</span>;
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
    // Intervenção manual real = parte marcada como is_manual_override E o escolhido não é o melhor candidato
    // (se o usuário escolheu manualmente mas coincidiu com o melhor, não há motivo para alarme)
    const isManuallyAssigned = selectedPart?.isManualOverride === true;
    const hasManualOverride = !!(isManuallyAssigned && bestCandidate && assignedPublisher && scoreData && bestCandidate.name !== assignedPublisher.name && bestCandidate.score > scoreData.score);
    const isAssignedTopScored = !!(bestCandidate && assignedPublisher && bestCandidate.name === assignedPublisher.name);

    const formatCandidateContext = (candidate: CandidatePanelItem) => {
        const cooldownInfo = candidate.cooldownInfo;
        if (cooldownInfo?.isInCooldown) {
            const targetRef = selectedPart?.date || selectedPart?.weekId || null;
            const lastRef = cooldownInfo.lastDate || null;
            const relation = compareIsoDates(lastRef, targetRef);
            const when = cooldownInfo.weekDisplay || formatWeekFromDate(cooldownInfo.lastDate || '') || formatDate(cooldownInfo.lastDate);
            return relation >= 0
                ? `já está designado para ${cooldownInfo.lastPartType} na semana de ${when}`
                : `fez ${cooldownInfo.lastPartType} na semana de ${when}`;
        }

        if (candidate.lastDate) {
            return `última parte similar em ${formatDate(candidate.lastDate)}`;
        }

        return 'sem histórico semelhante recente';
    };

    const unifiedNarrative = useMemo(() => {
        if (!assignedPublisher || !selectedPart || !scoreData) return null;

        const parts: string[] = [];

        // 1. Time bonus / Esquecimento
        if (scoreData.details.timeBonus > 0) {
            parts.push(`Faz um bom tempo que ${firstName} não recebe uma designação, o que aumentou suas chances de ser escolhido(a) agora.`);
        }

        // 2. Cooldown / Descanso direto
        if (cooldown?.isInCooldown) {
            const weekOrDate = cooldown.weekDisplay || formatWeekFromDate(cooldown.lastDate || '') || formatDate(cooldown.lastDate);
            const targetRef = selectedPart.date || selectedPart.weekId || null;
            const lastRef = cooldown.lastDate || null;
            const relation = compareIsoDates(lastRef, targetRef);
            const verbPhrase = relation > 0
                ? 'está designado para realizar'
                : relation === 0
                    ? 'está designado para realizar'
                    : 'realizou';
            parts.push(`${firstName} ${verbPhrase} "${cooldown.lastPartType}" na semana de ${weekOrDate}; por isso, está no período de descanso recomendado e idealmente não receberia esta parte.`);
        } else if (scoreData.details.cooldownPenalty > 0) {
            parts.push(`${firstName} realizou partes há pouco tempo, o que sugere que um descanso seria bem-vindo.`);
        }

        // 3. Proximidade com outras partes principais
        if (scoreData.details.mainProximityPenalty > 0) {
            parts.push(`Notamos que ${firstName} tem outras participações principais marcadas em datas muito próximas a esta semana, o que sobrecarrega um pouco a agenda.`);
        }

        // 4. Contagem geral de partes
        if (scoreData.details.recentCount > 0) {
            parts.push(`${firstName} tem ${scoreData.details.recentCount} participação${scoreData.details.recentCount === 1 ? '' : 'ões'} nos arredores desta semana. O sistema procurou equilibrar isso.`);
        } else if (scoreData.details.timeBonus === 0) {
            parts.push(`${firstName} está com a agenda livre nas proximidades desta semana.`);
        }

        // 5. Ajustes e bônus de papel
        if (scoreData.details.roleBonus > 0) {
            parts.push(`As habilidades e privilégios de ${firstName} combinam perfeitamente com o que esta parte exige.`);
        }
        
        // 6. Regras manuais / custom
        if (scoreData.details.specificAdjustments && scoreData.details.specificAdjustments.length > 0) {
            parts.push(`A escolha considerou algumas regras locais da congregação: ${scoreData.details.specificAdjustments.join(', ')}.`);
        }

        // 7. Manual override ou adequação
        if (hasManualOverride && bestCandidate) {
            parts.push(`O sistema indicaria preferencialmente ${bestCandidate.name} para o momento, mas esta designação foi escolhida manualmente por você.`);
        } else if (isAssignedTopScored) {
            parts.push(`Analisando tudo, ${firstName} é a indicação ideal e mais equilibrada para assumir esta parte agora.`);
        } else {
            parts.push(`A escolha é adequada e compatível com as regras da congregação. Outras opções viáveis estão listadas abaixo.`);
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
                        <div style={{ paddingBottom: '4px', borderBottom: '1px solid #E5E7EB', marginBottom: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
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
                        <div style={{ paddingBottom: assignedPublisher ? '4px' : 0, borderBottom: assignedPublisher ? '1px solid #E5E7EB' : 'none', marginBottom: assignedPublisher ? '4px' : 0 }}>
                            {/* Verificação de Parte Não Designável (Ex: Cântico) */}
                            {eligibility?.reason === 'Cânticos não são designados' ? (
                                <div style={{ fontSize: '11px', color: '#9CA3AF', fontStyle: 'italic', padding: '4px 0' }}>
                                    (Não se aplica a esta parte)
                                </div>
                            ) : (selectedPart.resolvedPublisherName || selectedPart.rawPublisherName || effectiveName) ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '0px' }}>
                                    <div style={{
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '50%',
                                        background: '#4F46E5',
                                        color: 'white',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        flexShrink: 0,
                                    }}>
                                        {(selectedPart.resolvedPublisherName || selectedPart.rawPublisherName || effectiveName || '?').charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={valueStyle}>{selectedPart.resolvedPublisherName || selectedPart.rawPublisherName || effectiveName}</div>
                                        {assignedPublisher && (
                                            <div style={{ fontSize: '10px', color: '#4B5563', marginTop: '0px', lineHeight: '1.2' }}>
                                                <div style={{ fontWeight: '500', color: '#1F2937' }}>
                                                    {assignedPublisher.gender === 'brother' ? '👨' : '👩'} {assignedPublisher.condition} • {assignedPublisher.isBaptized ? 'Batizado' : 'Não Batizado'} • {assignedPublisher.ageGroup}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginTop: '1px' }}>
                                                    <span style={{ fontSize: '9px', color: '#6B7280' }}>
                                                        <strong>Priv.:</strong> {[
                                                            assignedPublisher.privileges.canPreside && 'Presidente',
                                                            assignedPublisher.privileges.canGiveTalks && 'Orador',
                                                            assignedPublisher.privileges.canPray && 'Oração',
                                                            assignedPublisher.privileges.canReadCBS && 'Leitor',
                                                            assignedPublisher.isHelperOnly && 'Só Ajudante'
                                                        ].filter(Boolean).join(', ') || 'Nenhum'}
                                                    </span>
                                                    {assignedPublisher?.privilegesBySection?.canParticipateInTreasures && (
                                                        <span style={{ fontSize: '9px', background: '#F3F4F6', color: '#374151', padding: '0px 3px', borderRadius: '3px', border: '1px solid #E5E7EB' }}>📖 Tesouros</span>
                                                    )}
                                                    {assignedPublisher?.privilegesBySection?.canParticipateInMinistry && (
                                                        <span style={{ fontSize: '9px', background: '#FFFBEB', color: '#92400E', padding: '0px 3px', borderRadius: '3px', border: '1px solid #FDE68A' }}>🌾 Ministério</span>
                                                    )}
                                                    {assignedPublisher?.privilegesBySection?.canParticipateInLife && (
                                                        <span style={{ fontSize: '9px', background: '#FEF2F2', color: '#991B1B', padding: '0px 3px', borderRadius: '3px', border: '1px solid #FECACA' }}>❤️ Vida Cristã</span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ ...valueStyle, color: '#DC2626', marginTop: '2px' }}>
                                    ⚠️ Nenhum publicador designado
                                </div>
                            )}
                        </div>

                        {/* 2026-05-26: Badge específico para "poluição do parser" — o que está
                            no rawPublisherName não parece nem ser nome de pessoa (título de parte,
                            range de horário, etc.). Vem ANTES do bloco genérico de órfão pois é
                            uma causa-raiz diagnosticável. */}
                        {selectedPart.rawPublisherName && !assignedPublisher && !isNonDesignatablePart(selectedPart.tipoParte || '') && (() => {
                            const invalid = validatePublisherName(selectedPart.rawPublisherName);
                            if (!invalid) return null;
                            return (
                                <div style={{
                                    background: '#FEE2E2',
                                    border: '1px solid #FCA5A5',
                                    borderRadius: '6px',
                                    padding: '8px 10px',
                                    marginBottom: '6px',
                                    fontSize: '11px',
                                    color: '#991B1B',
                                    lineHeight: '1.4'
                                }}>
                                    <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                                        🐛 Nome inválido detectado na importação
                                    </div>
                                    <div>
                                        O valor <code style={{ background: '#FECACA', padding: '0 4px', borderRadius: '3px' }}>{selectedPart.rawPublisherName}</code> {' '}
                                        provavelmente foi capturado por engano pelo parser da apostila.
                                    </div>
                                    <div style={{ marginTop: '4px', fontSize: '10px', color: '#7F1D1D' }}>
                                        Motivo heurístico: {invalid.description}.
                                    </div>
                                </div>
                            );
                        })()}

                        {/* 2026-05-26: Aviso quando designação refere publisher inexistente no cadastro.
                            Acontece quando rawPublisherName veio da apostila importada mas o nome não bate
                            com nenhum Publisher cadastrado. Sem o Publisher, a Análise & Status não tem
                            como mostrar elegibilidade/intervalo/score. Oferecemos botão para limpar a
                            designação órfã (single-row UPDATE → atômico no Postgres). */}
                        {effectiveName && !assignedPublisher && !isNonDesignatablePart(selectedPart.tipoParte || '') && (
                            <div style={{
                                background: '#FFFBEB',
                                border: '1px solid #FCD34D',
                                borderRadius: '6px',
                                padding: '8px 10px',
                                marginBottom: '6px',
                                fontSize: '11px',
                                color: '#92400E',
                                lineHeight: '1.4'
                            }}>
                                <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                                    ⚠️ Publicador não cadastrado
                                </div>
                                <div style={{ marginBottom: '6px' }}>
                                    O nome <strong>"{effectiveName}"</strong> está designado nesta parte, mas
                                    não existe na aba <em>Publicadores</em>. Por isso a análise (elegibilidade,
                                    intervalo, score, privilégios) não pode ser exibida.
                                </div>
                                <div style={{ marginBottom: '6px', fontSize: '10px', color: '#78350F' }}>
                                    Sugestões: (a) cadastrar o publicador, (b) corrigir o nome para casar com
                                    um já existente, ou (c) limpar esta designação e deixar a parte VAGA.
                                </div>
                                <button
                                    type="button"
                                    disabled={isClearingOrphan}
                                    onClick={async () => {
                                        if (!selectedPart) return;
                                        const ok = window.confirm(
                                            `Limpar a designação órfã "${effectiveName}" da parte "${selectedPart.tituloParte || selectedPart.tipoParte}"?\n\n` +
                                            `A parte voltará para status PENDENTE (sem designado). Esta ação NÃO remove o publicador do cadastro — apenas desfaz o vínculo nesta única parte.`
                                        );
                                        if (!ok) return;
                                        setIsClearingOrphan(true);
                                        try {
                                            await workbookManagementService.updatePart(selectedPart.id, {
                                                rawPublisherName: '',
                                                resolvedPublisherId: '',
                                                resolvedPublisherName: '',
                                                status: 'PENDENTE',
                                            });
                                            if (onDataChange) onDataChange();
                                        } catch (err) {
                                            console.error('[ActionControlPanel] Falha ao limpar designação órfã:', err);
                                            window.alert('Não foi possível limpar a designação. Veja o console para detalhes.');
                                        } finally {
                                            setIsClearingOrphan(false);
                                        }
                                    }}
                                    style={{
                                        background: isClearingOrphan ? '#FCD34D' : '#F59E0B',
                                        color: '#FFFFFF',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '5px 10px',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        cursor: isClearingOrphan ? 'wait' : 'pointer',
                                    }}
                                >
                                    {isClearingOrphan ? 'Limpando…' : '🧹 Limpar designação'}
                                </button>
                            </div>
                        )}

                        {/* Painel de Análise Unificado */}
                        {assignedPublisher && (
                            <div>
                                <div style={{
                                    marginBottom: '2px',
                                    borderBottom: '1px solid #E5E7EB',
                                    paddingBottom: '1px',
                                    marginTop: '2px',
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
                                            <span>Análise da escolha</span>
                                        )}
                                    </span>
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
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>

                                        {/* Status rápido sem duplicar explicação */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginBottom: '0px', flexWrap: 'wrap' }}>
                                            <span style={{
                                                fontSize: '9px',
                                                fontWeight: 'bold',
                                                background: eligibility?.eligible ? '#ECFDF5' : '#FEF2F2',
                                                color: eligibility?.eligible ? '#059669' : '#DC2626',
                                                padding: '1px 4px',
                                                borderRadius: '4px'
                                            }}>
                                                {eligibility?.eligible ? '✓ Elegível' : '⚠️ Inelegível'}
                                            </span>
                                            <span style={{
                                                fontSize: '9px',
                                                background: cooldown?.isInCooldown ? '#FFFBEB' : '#ECFDF5',
                                                color: cooldown?.isInCooldown ? '#B45309' : '#059669',
                                                padding: '1px 4px',
                                                borderRadius: '4px'
                                            }}>
                                                {cooldown?.isInCooldown ? '⏳ Intervalo recomendado ativo' : '✓ Intervalo ok'}
                                            </span>
                                            {textualConstraintSummary.active && (
                                                <span style={{
                                                    fontSize: '9px',
                                                    fontWeight: 'bold',
                                                    background: '#F5F3FF',
                                                    color: '#6D28D9',
                                                    padding: '1px 4px',
                                                    borderRadius: '4px'
                                                }}>
                                                    🟣 Regra textual ativa
                                                </span>
                                            )}

                                            <ProfileChangeTooltipChip
                                                notifications={profileChangeNotifications}
                                                publisherName={assignedPublisher?.name || selectedPart.resolvedPublisherName || selectedPart.rawPublisherName || null}
                                                tone="light"
                                            />
                                        </div>

                                        {textualConstraintSummary.active && (
                                            <div style={{
                                                background: '#FAF5FF',
                                                border: '1px solid #DDD6FE',
                                                color: '#5B21B6',
                                                borderRadius: '6px',
                                                padding: '4px 6px',
                                                fontSize: '11px',
                                                lineHeight: '1.35'
                                            }}>
                                                Esta parte traz uma orientação textual ativa: {textualConstraintSummary.labels.join(', ')}.
                                            </div>
                                        )}

                                        {eligibility && !eligibility.eligible && eligibility.reason && (
                                            <div style={{
                                                background: '#FEF2F2',
                                                border: '1px solid #FECACA',
                                                color: '#991B1B',
                                                borderRadius: '6px',
                                                padding: '4px 6px',
                                                fontSize: '11px',
                                                lineHeight: '1.35'
                                            }}>
                                                No contexto atual, {firstName.toLowerCase()} não está elegível para esta parte: {eligibility.reason}.
                                            </div>
                                        )}

                                        {/* 2. Explicação em Linguagem Natural (Texto Único) */}
                                        {unifiedNarrative && (
                                            <div style={{
                                                background: '#FFFFFF',
                                                padding: '4px 6px',
                                                borderRadius: '6px',
                                                fontSize: '12px',
                                                color: '#1E293B',
                                                borderLeft: `3px solid ${hasManualOverride ? '#F59E0B' : '#6366F1'}`,
                                                lineHeight: '1.4',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                            }}>
                                                <div style={{ fontWeight: '700', marginBottom: '1px', color: hasManualOverride ? '#92400E' : '#334155' }}>
                                                    {hasManualOverride ? '✋ Explicação da Designação (com intervenção manual)' : '📋 Explicação da Designação'}
                                                </div>
                                                <div style={{ whiteSpace: 'normal' }}>{unifiedNarrative}</div>
                                            </div>
                                        )}

                                        {/* 2.1 Próximas alternativas disponíveis (excluindo o designado) */}
                                        {(() => {
                                            const assignedName = assignedPublisher?.name;
                                            const alternatives = topCandidates.filter(c => c.name !== assignedName).slice(0, 2);
                                            if (alternatives.length === 0) return null;
                                            return (
                                                <div style={{
                                                    marginTop: '1px',
                                                    paddingTop: '4px',
                                                    borderTop: '1px solid #F3F4F6',
                                                    fontSize: '10px',
                                                    color: '#475569'
                                                }}>
                                                    <div style={{ fontWeight: 700, marginBottom: '2px', color: '#334155' }}>
                                                        Outras opções disponíveis
                                                    </div>
                                                    {alternatives.map((item, idx) => (
                                                        <div key={item.name} style={{ marginBottom: '4px', padding: '2px 0' }}>
                                                            <div style={{ fontWeight: 600, color: '#475569' }}>{idx + 1}. {item.name}</div>
                                                            <div style={{ fontSize: '10px', color: '#64748B', marginTop: '1px' }}>
                                                                {formatCandidateContext(item)}.
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })()}

                                        {/* Item 4: Histórico desta parte — todos os participantes, ordem data DESC */}
                                        {partTypeHistory.length > 0 && (
                                            <div style={{ marginTop: '6px' }}>
                                                <button
                                                    onClick={() => setShowPartHistory(v => !v)}
                                                    style={{
                                                        background: 'none',
                                                        border: '1px solid #CBD5E1',
                                                        borderRadius: '4px',
                                                        padding: '2px 8px',
                                                        fontSize: '11px',
                                                        color: '#475569',
                                                        cursor: 'pointer',
                                                        width: '100%',
                                                        textAlign: 'left',
                                                    }}
                                                >
                                                    {showPartHistory ? '▼' : '►'} 📜 Histórico desta parte ({partTypeHistory.length})
                                                </button>
                                                {showPartHistory && (
                                                    <div style={{
                                                        marginTop: '4px',
                                                        background: '#F8FAFC',
                                                        border: '1px solid #E2E8F0',
                                                        borderRadius: '4px',
                                                        padding: '4px 6px',
                                                        fontSize: '11px',
                                                        maxHeight: '200px',
                                                        overflowY: 'auto',
                                                        lineHeight: '1.6',
                                                    }}>
                                                        {partTypeHistory.map((h, idx) => {
                                                            const name = h.resolvedPublisherName || h.rawPublisherName || '?';
                                                            const deltaStr = h.deltaDays === 0
                                                                ? 'esta semana'
                                                                : h.deltaDays > 0
                                                                    ? `em +${h.deltaDays}d`
                                                                    : `há ${Math.abs(h.deltaDays)}d`;
                                                            const funcaoTag = h.funcao === 'Ajudante' ? ' 🤝' : '';
                                                            return (
                                                                <div key={idx} style={{
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    borderBottom: idx < partTypeHistory.length - 1 ? '1px solid #F1F5F9' : 'none',
                                                                    paddingBottom: '1px',
                                                                    color: h.deltaDays > 0 ? '#2563EB' : '#334155',
                                                                }}>
                                                                    <span>{name}{funcaoTag}</span>
                                                                    <span style={{ color: '#94A3B8', marginLeft: '8px' }}>{h.date.slice(5)} ({deltaStr})</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
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
