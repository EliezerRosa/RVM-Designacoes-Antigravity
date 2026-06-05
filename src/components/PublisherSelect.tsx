import React, { useMemo } from 'react';
import { type Publisher, type WorkbookPart, type HistoryRecord } from '../types';
import { checkEligibility, buildEligibilityContext, isPastWeekDate, getTextualConstraintSummary } from '../services/eligibilityService';
import { getBlockInfo, checkMultipleAssignments, type AssignmentWarning } from '../services/cooldownService';
import { getMostRecentFSMRole, wasRecentlyPairedWith, getRotationConfig } from '../services/unifiedRotationService';
import { markManualSelection } from '../services/manualSelectionTracker';
import { EnumModalidade, EnumFuncao } from '../types';
import { getRankedEligibleForPart } from '../services/rankedEligibleService';
import { Tooltip } from './Tooltip';
import { ProfileChangeTooltipChip } from './admin/ProfileChangeTooltipChip';
import { fuzzySearchWithScore, normalize } from '../utils/searchUtils';
import type { PublisherProfileChangeNotification } from '../hooks/usePublisherProfileNotifications';

interface PublisherSelectProps {
    part: WorkbookPart;
    publishers: Publisher[];
    value: string; // ID do publicador
    displayName?: string; // Nome para mostrar quando não temos ID
    onChange: (id: string, name: string) => void;
    disabled?: boolean;
    style?: React.CSSProperties;
    /** Lista de partes da semana para verificar múltiplas designações */
    weekParts?: WorkbookPart[];
    /** Histórico completo para cálculo de cooldown (se não fornecido, usa allParts/weekParts mas pode ser incompleto) */
    history?: HistoryRecord[];
    /** Callback para fallback (compatibilidade) */
    allParts?: WorkbookPart[];
    /** Notificacoes de mudanca de perfil carregadas pelo painel pai (evita subscricao por linha). */
    profileChangeNotifications?: PublisherProfileChangeNotification[];
}

// Importar mapeamento centralizado (substitui definição local)
import { getModalidadeFromTipo } from '../constants/mappings';
import { workbookPartToHistoryRecord } from '../services/historyAdapter';
import { formatWeekFromDate, toLocalISODate } from '../utils/dateUtils';

const getModalidade = (part: WorkbookPart): string => {
    if (part.modalidade) return part.modalidade;
    return getModalidadeFromTipo(part.tipoParte, part.section);
};

export const PublisherSelect = ({ part, publishers, value, displayName, onChange, disabled, style, weekParts, allParts, history, profileChangeNotifications = [] }: PublisherSelectProps) => {

    // Converter allParts para HistoryRecord[] (Memoizado para uso geral)
    // Se history já for fornecido (preferencial), usa ele.
    const historyRecords = useMemo(() =>
        history || (allParts || weekParts || []).map(workbookPartToHistoryRecord),
        [history, allParts, weekParts]);

    // CORRECTION O: Use target date for cooldown reference instead of today
    const referenceDate = useMemo(() => {
        if (!part.date) return new Date();
        // Ensure consistent date parsing (mid-day to avoid timezone shifts)
        if (part.date.includes('T')) return new Date(part.date);
        return new Date(part.date + 'T12:00:00');
    }, [part.date]);

    const weekPartsSnapshot = weekParts || [];

    // Memoizar a lista sorted para evitar recálculo excessivo
    const sortedOptions = useMemo(() => {
        return getRankedEligibleForPart(part, weekPartsSnapshot, publishers, historyRecords, {
            applyEngineRules: true,
            excludeAssignedInSameWeek: true,
        }).allCandidates;
    }, [part, publishers, weekPartsSnapshot, historyRecords]);

    const visibleOptions = useMemo(() => sortedOptions.filter(o => o.eligible), [sortedOptions]);
    const selectedIneligibleOption = useMemo(
        () => sortedOptions.find(o => o.publisher.id === value && !o.eligible),
        [sortedOptions, value]
    );

    // Determinar o valor efetivo - tentar encontrar ID pelo nome se não temos ID
    // Agora usa busca fonética/fuzzy para melhor match (ex: "eryc" encontra "Erik")
    const { effectiveValue, foundPublisher, eligibilityInfo } = useMemo(() => {
        if (value) {
            // OTIMIZAÇÃO: Tentar encontrar nos options já calculados (evita rodar checkEligibility de novo)
            const preCalculated = sortedOptions.find(o => o.publisher.id === value);
            if (preCalculated) {
                return {
                    effectiveValue: value,
                    foundPublisher: preCalculated.publisher,
                    eligibilityInfo: { eligible: preCalculated.eligible, reason: preCalculated.reason }
                };
            }

            // Fallback: Se não estiver na lista (ex: lista filtrada externamente?), buscar no raw array
            const pub = publishers.find(p => p.id === value);
            if (pub) {
                const modalidade = getModalidade(part);
                const funcao = part.funcao === 'Ajudante' ? EnumFuncao.AJUDANTE : EnumFuncao.TITULAR;

                // v8.4: Usar helper centralizado
                const eligibilityContext = buildEligibilityContext(part, weekParts, publishers);

                const result = checkEligibility(
                    pub,
                    modalidade as Parameters<typeof checkEligibility>[1],
                    funcao,
                    eligibilityContext
                );
                return {
                    effectiveValue: value,
                    foundPublisher: pub,
                    eligibilityInfo: { eligible: result.eligible, reason: result.reason }
                };
            }
        }

        if (displayName) {
            // Tentar match exato primeiro
            let found = publishers.find(p => p.name === displayName);

            // Se não encontrou, tentar match normalizado (sem acentos, lowercase)
            if (!found) {
                const normalizedDisplay = normalize(displayName);
                found = publishers.find(p => normalize(p.name) === normalizedDisplay);
            }

            // Se ainda não encontrou, tentar busca fonética/fuzzy
            if (!found) {
                const fuzzyResults = fuzzySearchWithScore(
                    displayName,
                    publishers,
                    p => p.name,
                    0.8 // Threshold alto para evitar falsos positivos
                );
                if (fuzzyResults.length > 0) {
                    found = fuzzyResults[0].item;
                }
            }

            if (found) {
                // Tentar reutilizar sortedOptions para o encontrado via nome
                const preCalculated = sortedOptions.find(o => o.publisher.id === found!.id);
                if (preCalculated) {
                    return {
                        effectiveValue: found.id,
                        foundPublisher: found,
                        eligibilityInfo: { eligible: preCalculated.eligible, reason: preCalculated.reason }
                    };
                }

                // Recalculo manual (fallback)
                const modalidade = getModalidade(part);
                const funcao = part.funcao === 'Ajudante' ? EnumFuncao.AJUDANTE : EnumFuncao.TITULAR;

                // v8.4: Usar helper centralizado
                const eligibilityContext = buildEligibilityContext(part, weekParts, publishers);

                const result = checkEligibility(
                    found,
                    modalidade as Parameters<typeof checkEligibility>[1],
                    funcao,
                    eligibilityContext
                );
                return {
                    effectiveValue: found.id,
                    foundPublisher: found,
                    eligibilityInfo: { eligible: result.eligible, reason: result.reason }
                };
            }
        }
        return { effectiveValue: '', foundPublisher: undefined, eligibilityInfo: undefined };
    }, [value, displayName, publishers, part, weekParts, sortedOptions]);

    const selectedCandidate = useMemo(
        () => sortedOptions.find(o => o.publisher.id === effectiveValue),
        [sortedOptions, effectiveValue]
    );

    // Se não encontrou match mas tem displayName, vamos mostrar como opção especial
    const showUnmatchedName = displayName && !foundPublisher;
    const profileNotificationTargetName =
        foundPublisher?.name || displayName || part.resolvedPublisherName || part.rawPublisherName || null;

    // Verificar múltiplas designações na mesma semana ou semanas adjacentes
    const multipleAssignmentWarnings = useMemo((): AssignmentWarning[] => {
        if (!foundPublisher || !weekParts || weekParts.length === 0) return [];

        // Converter weekParts para formato esperado pela função
        const partsForCheck = weekParts.map(p => ({
            id: p.id,
            weekId: p.weekId,
            weekDisplay: p.weekDisplay,
            tipoParte: p.tipoParte,
            tituloParte: p.tituloParte,
            date: p.date,
            rawPublisherName: p.rawPublisherName,
            resolvedPublisherName: p.resolvedPublisherName,
            status: p.status
        }));

        return checkMultipleAssignments(
            foundPublisher.name,
            part.weekId,
            part.id,  // currentPartId (estava faltando)
            partsForCheck,
            true // excluir partes de presidência (normal ter múltiplas)
        );
    }, [foundPublisher, weekParts, part.weekId, part.id]);

    // Cooldown Info do publicador SELECIONADO (para tooltip)
    const selectedCooldownInfo = useMemo(() => {
        if (selectedCandidate) return selectedCandidate.cooldownInfo;
        if (!foundPublisher) return null;
        const historyForCooldown = historyRecords.filter(h => h.weekId !== part.weekId);
        return getBlockInfo(foundPublisher.name, historyForCooldown, referenceDate, foundPublisher.id);
    }, [selectedCandidate, foundPublisher, part.weekId, historyRecords, referenceDate]);

    // Avisos informativos das regras do Motor automático (Q2 alternância FSM, Q3 par recente).
    // NÃO bloqueiam designação manual — só informam que o Motor evitaria.
    const motorWarnings = useMemo(() => {
        const warnings: { kind: 'alternation' | 'pair'; message: string }[] = [];
        if (!foundPublisher) return warnings;
        const cfg = getRotationConfig();
        const historyExcludingWeek = historyRecords.filter(h => h.weekId !== part.weekId);
        const t = part.tipoParte.toLowerCase();
        const m = (part.modalidade || '').toLowerCase();
        const partIsFSM = t.includes('ministerio') || t.includes('demonstra') || t.includes('estudante')
            || m.includes('demonstra') || m.includes('estudante') || m.includes('leitura');

        // Q2 — alternância Titular ↔ Ajudante em FSM
        if (partIsFSM && cfg.ROLE_ALTERNATION_WINDOW_WEEKS > 0) {
            const isHelperOnly = foundPublisher.isHelperOnly === true;
            const funcaoAtual: 'Titular' | 'Ajudante' = part.funcao === 'Ajudante' ? 'Ajudante' : 'Titular';
            const lastRole = getMostRecentFSMRole(
                foundPublisher.name,
                historyExcludingWeek,
                referenceDate,
                cfg.ROLE_ALTERNATION_WINDOW_WEEKS,
            );
            // Escape: "Só Ajudante" isento de alternância quando recebe Ajudante.
            const isEscape = funcaoAtual === 'Ajudante' && isHelperOnly;
            if (lastRole && lastRole === funcaoAtual && !isEscape) {
                warnings.push({
                    kind: 'alternation',
                    message: `Foi ${lastRole} em parte FSM há ≤${cfg.ROLE_ALTERNATION_WINDOW_WEEKS} sem. — Motor automático tenta alternar; manual: permitido.`,
                });
            }
        }

        // Q3 — não repetir par titular+ajudante em demonstração
        const isDemo = t.includes('demonstra') || m.includes('demonstra');
        if (part.funcao === 'Ajudante' && isDemo && cfg.PAIR_REPETITION_WINDOW_WEEKS > 0) {
            const ctx = buildEligibilityContext(part, weekParts, publishers);
            const titularPub = ctx.titularPublisherId
                ? publishers.find(p => p.id === ctx.titularPublisherId)
                : null;
            if (titularPub) {
                const isBypass =
                    foundPublisher.id === ctx.titularSpouseId ||
                    (ctx.titularParentIds || []).includes(foundPublisher.id) ||
                    (ctx.titularChildIds || []).includes(foundPublisher.id);
                if (!isBypass) {
                    const recently = wasRecentlyPairedWith(
                        foundPublisher.name,
                        titularPub.name,
                        historyExcludingWeek,
                        referenceDate,
                        cfg.PAIR_REPETITION_WINDOW_WEEKS,
                    );
                    if (recently) {
                        warnings.push({
                            kind: 'pair',
                            message: `Já foi par com ${titularPub.name} há ≤${cfg.PAIR_REPETITION_WINDOW_WEEKS} sem. — Motor automático evita repetir; manual: permitido.`,
                        });
                    }
                }
            }
        }
        return warnings;
    }, [foundPublisher, part, historyRecords, referenceDate, weekParts, publishers]);

    // Renderizar conteúdo do tooltip (JSX)
    const renderTooltipContent = () => {
        if (!foundPublisher) {
            if (showUnmatchedName) {
                return (
                    <div>
                        <div style={{ color: '#fca5a5', fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>
                            ⚠️ Publicador não encontrado
                        </div>
                        <div style={{ marginBottom: '6px' }}>
                            O nome <strong style={{ color: '#fff' }}>"{displayName}"</strong> consta na apostila mas não tem cadastro.
                        </div>
                        <div style={{ fontSize: '0.85em', color: '#9ca3af' }}>
                            👉 Verifique erros de digitação ou crie um novo cadastro.
                        </div>
                    </div>
                );
            }
            return <div>Nenhum publicador selecionado</div>;
        }

        const isEligible = eligibilityInfo?.eligible;
        const reason = eligibilityInfo?.reason;

        // Explicação positiva simplificada
        let explanation = 'Atende os requisitos';
        if (isEligible) {
            const modalidade = getModalidade(part);
            const funcao = part.funcao === 'Ajudante' ? 'Ajudante' : 'Titular';

            if (funcao === 'Ajudante') {
                explanation = 'Pode participar como ajudante';
            } else {
                switch (modalidade) {
                    case EnumModalidade.PRESIDENCIA: explanation = `${foundPublisher.condition} com privilégio de presidir`; break;
                    case EnumModalidade.ORACAO: explanation = 'Irmão batizado apto para orar'; break;
                    case EnumModalidade.DISCURSO_ENSINO:
                        explanation = (foundPublisher.condition === 'Ancião' || foundPublisher.condition === 'Anciao')
                            ? 'Ancião apto para ensino' : 'Servo Ministerial aprovado';
                        break;
                    case EnumModalidade.LEITURA_ESTUDANTE: explanation = 'Publicador apto para leitura'; break;
                    case EnumModalidade.DEMONSTRACAO: explanation = 'Publicador apto para demonstração'; break;
                    case EnumModalidade.DISCURSO_ESTUDANTE: explanation = 'Irmão apto para discurso'; break;
                    case EnumModalidade.DIRIGENTE_EBC: explanation = 'Ancião apto para dirigir EBC'; break;
                    case EnumModalidade.LEITOR_EBC: explanation = 'Irmão apto para ler EBC'; break;
                    default: explanation = 'Elegível para esta designação';
                }
            }
        }
        return (
            <div>
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px', marginBottom: '6px' }}>
                    <div style={{ fontSize: '1.1em', fontWeight: 'bold', color: '#fff' }}>
                        {foundPublisher.name}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', fontSize: '0.85em', color: '#d1d5db' }}>
                        <span>{foundPublisher.gender === 'brother' ? '👨 Irmão' : '👩 Irmã'}</span>
                        <span>•</span>
                        <span>{foundPublisher.condition}</span>
                    </div>
                </div>

                <div style={{ marginBottom: '4px' }}>
                    {isEligible ? (
                        <div style={{ color: '#4ade80', fontWeight: 'bold' }}>✅ ELEGÍVEL</div>
                    ) : (
                        <div style={{ color: '#f87171', fontWeight: 'bold' }}>❌ NÃO ELEGÍVEL</div>
                    )}
                </div>

                {isEligible ? (
                    <div style={{ fontSize: '0.9em', color: '#e5e7eb' }}>➡️ {explanation}</div>
                ) : (
                    <div style={{ color: '#fca5a5', fontWeight: '500', fontSize: '0.95em' }}>⚠️ {reason}</div>
                )}

                {/* Aviso de Cooldown */}
                {selectedCooldownInfo?.isInCooldown && (
                    <div style={{
                        marginTop: '8px',
                        paddingTop: '8px',
                        borderTop: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        <div style={{ color: '#fcd34d', fontWeight: 'bold', marginBottom: '4px' }}>
                            ⏳ COOLDOWN ATIVO
                        </div>
                        <div style={{ fontSize: '0.85em', color: '#fff' }}>
                            {(selectedCooldownInfo.lastDate || '') <= toLocalISODate()
                                ? <><strong>Participações Passadas:</strong> Fez <strong>{selectedCooldownInfo.lastPartType}</strong> na {selectedCooldownInfo.weekDisplay || formatWeekFromDate(selectedCooldownInfo.lastDate || '')}.</>
                                : <><strong>Designações Futuras:</strong> Designado para <strong>{selectedCooldownInfo.lastPartType}</strong> na {selectedCooldownInfo.weekDisplay || formatWeekFromDate(selectedCooldownInfo.lastDate || '')}.</>
                            }
                            <br />
                            <br />
                            <br />
                            <span style={{ color: '#9ca3af', fontSize: '0.8em', fontStyle: 'italic' }}>
                                (Convenção: Aguardar 3 semanas após partes principais. Pode ser ignorada manualmente.)
                            </span>
                        </div>
                    </div>
                )}

                {/* Avisos do Motor (alternância FSM + par recente) — informativos, não bloqueiam manual */}
                {motorWarnings.length > 0 && (
                    <div style={{
                        marginTop: '8px',
                        paddingTop: '8px',
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                    }}>
                        <div style={{ color: '#fcd34d', fontWeight: 'bold', marginBottom: '4px' }}>
                            🔁 Preferência do Motor automático (não bloqueia manual)
                        </div>
                        {motorWarnings.map((w, idx) => (
                            <div key={idx} style={{
                                fontSize: '0.85em',
                                color: '#fde68a',
                                marginBottom: '3px',
                                lineHeight: 1.35,
                            }}>
                                {w.kind === 'alternation'
                                    ? <><strong>↔️ Alternância de função (FSM):</strong> {w.message}</>
                                    : <><strong>👥 Repetição de par (demonstração):</strong> {w.message}</>}
                            </div>
                        ))}
                    </div>
                )}

                {/* Score Unificado + Contexto de Proximidade de Papel Pesado */}
                {foundPublisher && (() => {
                    const sd = selectedCandidate?.scoreData;
                    if (!sd) return null;
                    const ci = selectedCooldownInfo; // parte PRINCIPAL mais próxima (passado/futuro)
                    const lastWeekLabel = ci ? (ci.weekDisplay || formatWeekFromDate(ci.lastDate || '')) : '';
                    const lastIsFuture = ci ? ((ci.lastDate || '') > toLocalISODate()) : false;
                    return (
                        <div style={{
                            marginTop: '8px',
                            paddingTop: '8px',
                            borderTop: '1px solid rgba(255,255,255,0.1)',
                            fontSize: '0.8em',
                            color: '#9ca3af'
                        }}>
                            <div>📊 <strong>Pontuação:</strong> {sd.explanation}</div>

                            {/* 2) Carga recente (frequência) — QUANTIFICADA */}
                            <div style={{ marginTop: '4px', color: '#d1d5db' }}>
                                🔢 <strong>Carga recente (frequência):</strong> {sd.details.recentCount} parte{sd.details.recentCount === 1 ? '' : 's'} (passadas e futuras, ±12 sem.){sd.details.frequencyPenalty > 0 ? <> → <span style={{ color: '#fca5a5' }}>−{sd.details.frequencyPenalty} pts</span></> : null}
                            </div>

                            {/* 3) Última parte principal + zona de bloqueio duro */}
                            <div style={{ marginTop: '4px', color: '#d1d5db' }}>
                                📅 <strong>{lastIsFuture ? 'Próxima parte principal:' : 'Última parte principal:'}</strong>{' '}
                                {ci
                                    ? <>{lastWeekLabel} <span style={{ color: '#9ca3af' }}>({ci.lastPartType})</span></>
                                    : <span style={{ color: '#9ca3af' }}>nenhuma registrada</span>}
                                {ci && (
                                    ci.isInCooldown ? (
                                        <span style={{ marginLeft: '6px', padding: '1px 6px', background: 'rgba(239,68,68,0.22)', borderRadius: '4px', color: '#fca5a5', fontWeight: 'bold', fontSize: '0.9em' }}>
                                            🔒 BLOQUEIO DURO ({ci.weeksSinceLast} de {ci.weeksSinceLast + ci.cooldownRemaining} sem)
                                        </span>
                                    ) : (
                                        <span style={{ marginLeft: '6px', padding: '1px 6px', background: 'rgba(16,185,129,0.18)', borderRadius: '4px', color: '#6ee7b7', fontWeight: 'bold', fontSize: '0.9em' }}>
                                            🔓 fora do bloqueio ({ci.weeksSinceLast} sem)
                                        </span>
                                    )
                                )}
                            </div>
                            {/* 4) Proximidade de parte MAIN — CHAVE PRIMÁRIA da ordenação lexicográfica */}
                            {sd.details.mainProximityPenalty > 0 ? (
                                <div style={{ marginTop: '6px', padding: '4px 6px', background: 'rgba(239,68,68,0.18)', borderRadius: '4px', color: '#fca5a5', fontSize: '0.9em', lineHeight: 1.4 }}>
                                    📍 <strong>Proximidade de parte (MAIN):</strong> custo {sd.details.proximityCost.toFixed(2)}
                                    <div style={{ color: '#f87171', fontSize: '0.85em', marginTop: '2px' }}>(parte designável a ≤4 semanas desta data — chave primária de prioridade)</div>
                                </div>
                            ) : (
                                <div style={{ marginTop: '6px', color: '#6ee7b7', fontSize: '0.9em' }}>
                                    📍 <strong>Proximidade de parte (MAIN):</strong> nenhuma (±4 semanas) — prioridade máxima.
                                </div>
                            )}
                            {/* Gate duro de NÃO-REPETIÇÃO da MESMA parte na janela ±4 semanas (Camada 1) */}
                            {sd.details.samePartConflict && (
                                <div style={{ marginTop: '6px', padding: '4px 6px', background: 'rgba(239,68,68,0.28)', borderRadius: '4px', color: '#fca5a5', fontSize: '0.9em', lineHeight: 1.4 }}>
                                    🚫 <strong>Mesma parte na janela:</strong> já fez esta parte{sd.details.samePartConflictDate ? ` em ${new Date(sd.details.samePartConflictDate + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''} (±4 sem)
                                    <div style={{ color: '#f87171', fontSize: '0.85em', marginTop: '2px' }}>bloqueado para esta parte — só escolhido se o pool elegível esvaziar</div>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Warnings de múltiplas designações */}
                {multipleAssignmentWarnings.length > 0 && (
                    <div style={{
                        marginTop: '8px',
                        paddingTop: '8px',
                        borderTop: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        <div style={{ color: '#fbbf24', fontWeight: 'bold', marginBottom: '4px' }}>
                            ⚠️ MÚLTIPLAS DESIGNAÇÕES
                        </div>
                        {multipleAssignmentWarnings.map((warning, idx) => (
                            <div key={idx} style={{
                                fontSize: '0.85em',
                                color: warning.type === 'SAME_WEEK' ? '#fca5a5' : '#fcd34d',
                                marginBottom: '2px'
                            }}>
                                {warning.type === 'SAME_WEEK' ? '🔴' : '🟡'} {warning.message}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // Detectar semana passada para indicador visual
    const isPastWeek = useMemo(() => isPastWeekDate(part.date), [part.date]);

    // Indicador explícito de restrições textuais da apostila
    const textualConstraintSummary = useMemo(() => {
        const ctx = buildEligibilityContext(part, weekParts, publishers);
        return getTextualConstraintSummary(ctx);
    }, [part, weekParts, publishers]);

    // Quando o nome digitado/importado não corresponde a nenhum publicador cadastrado,
    // exibimos a opção '__unmatched__' como valor selecionado para que o nome apareça no dropdown
    // (ex.: visitas do SC com nome livre).
    const selectValue = showUnmatchedName ? '__unmatched__' : effectiveValue;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <select
                value={selectValue}
                onChange={(e) => {
                    const id = e.target.value;
                    if (!id || id === '__unmatched__') {
                        onChange('', ''); // Limpar seleção
                    } else {
                        const pub = publishers.find(p => p.id === id);
                        if (pub) {
                            onChange(pub.id, pub.name);
                            // v8.3: Registrar seleção manual para evitar duplicatas na próxima geração
                            markManualSelection(pub.name, part.tipoParte, part.weekId, part.date);
                        }
                    }
                }}
                disabled={disabled}
                style={{
                    ...style,
                    maxWidth: '100%',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    borderColor: showUnmatchedName ? '#f87171' : (style?.borderColor || 'var(--border-color)'),
                    background: showUnmatchedName ? '#fef2f2' : (style?.background || 'var(--bg-secondary)'),
                    color: showUnmatchedName ? '#ef4444' : (style?.color || 'var(--text-primary)')
                }}
            >
                <option value="">Selecione...</option>
                {/* Se temos um nome não encontrado na lista, mostrar como opção selecionada (não desabilitada para que apareça no closed select) */}
                {showUnmatchedName && (
                    <option value="__unmatched__" style={{ fontStyle: 'italic', color: '#ef4444' }}>
                        ⚠️ {displayName} (não cadastrado)
                    </option>
                )}
                {selectedIneligibleOption && (
                    <option value={selectedIneligibleOption.publisher.id} disabled style={{ fontStyle: 'italic', color: '#9CA3AF' }}>
                        ⚠️ {selectedIneligibleOption.publisher.name} (não elegível no contexto)
                    </option>
                )}
                {visibleOptions.map(({ publisher: p, cooldownInfo }) => {
                    const icon = cooldownInfo?.isInCooldown ? '⏳ ' : '';

                    return (
                        <option
                            key={p.id}
                            value={p.id}
                            style={{
                                color: 'inherit',
                                fontStyle: 'normal',
                                fontWeight: cooldownInfo?.isInCooldown ? 'bold' : 'normal'
                            }}
                            title={cooldownInfo?.isInCooldown
                                ? ((cooldownInfo.lastDate || '') <= toLocalISODate()
                                    ? `⏳ Participações Passadas: Fez ${cooldownInfo.lastPartType} na ${cooldownInfo.weekDisplay || formatWeekFromDate(cooldownInfo.lastDate || '')} `
                                    : `⏳ Designações Futuras: Designado para ${cooldownInfo.lastPartType} na ${cooldownInfo.weekDisplay || formatWeekFromDate(cooldownInfo.lastDate || '')} `)
                                : '✅ Elegível'}
                        >
                            {icon}{p.name}
                        </option>
                    );
                })}
            </select>

            {textualConstraintSummary.active && (
                <Tooltip content={`Regra textual ativa: ${textualConstraintSummary.labels.join(', ')}`}>
                    <span
                        style={{
                            cursor: 'help',
                            background: 'rgba(168, 85, 247, 0.16)',
                            color: '#7c3aed',
                            borderRadius: '999px',
                            height: '20px',
                            padding: '0 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            fontWeight: 700,
                            letterSpacing: '0.2px',
                            flexShrink: 0,
                            border: '1px solid rgba(124, 58, 237, 0.35)'
                        }}
                        title={`Regra textual ativa: ${textualConstraintSummary.labels.join(', ')}`}
                    >
                        REGRA
                    </span>
                </Tooltip>
            )}

            <ProfileChangeTooltipChip
                notifications={profileChangeNotifications}
                publisherName={profileNotificationTargetName}
                tone="light"
            />

            {/* Ícone de ajuda com tooltip dinâmico (HTML/JSX) */}
            <Tooltip content={renderTooltipContent()}>
                <span
                    style={{
                        cursor: 'help',
                        background: showUnmatchedName ? 'rgba(248, 113, 113, 0.2)' : (eligibilityInfo?.eligible === false ? 'rgba(239, 68, 68, 0.2)' : 'rgba(107, 114, 128, 0.2)'),
                        color: showUnmatchedName ? '#f87171' : (eligibilityInfo?.eligible === false ? '#ef4444' : '#6b7280'),
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        flexShrink: 0,
                        border: showUnmatchedName ? '1px solid rgba(248, 113, 113, 0.4)' : (eligibilityInfo?.eligible === false ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(107, 114, 128, 0.3)')
                    }}
                >
                    {showUnmatchedName ? '!' : '?'}
                </span>
            </Tooltip>
            {isPastWeek && (
                <Tooltip content={<div style={{ fontSize: '12px', padding: '4px' }}>📅 Semana passada — disponibilidade não verificada.<br/>A lista mostra todos os publicadores elegíveis, sem filtrar por indisponibilidade.</div>}>
                    <span
                        style={{
                            cursor: 'help',
                            background: 'rgba(234, 179, 8, 0.15)',
                            color: '#ca8a04',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            flexShrink: 0,
                            border: '1px solid rgba(234, 179, 8, 0.4)'
                        }}
                    >
                        📅
                    </span>
                </Tooltip>
            )}
        </div>
    );
};
