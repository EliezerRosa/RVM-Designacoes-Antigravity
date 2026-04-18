import React, { useMemo } from 'react';
import { type Publisher, type WorkbookPart, type HistoryRecord } from '../types';
import { checkEligibility, isElderOrMS, buildEligibilityContext } from '../services/eligibilityService';
import { getBlockInfo, checkMultipleAssignments, type AssignmentWarning } from '../services/cooldownService';
import { calculateScore } from '../services/unifiedRotationService';
import { markManualSelection } from '../services/manualSelectionTracker';
import { EnumModalidade, EnumFuncao } from '../types';
import { Tooltip } from './Tooltip';
import { fuzzySearchWithScore, normalize } from '../utils/searchUtils';

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
}

// Importar mapeamento centralizado (substitui definição local)
import { getModalidadeFromTipo } from '../constants/mappings';
import { workbookPartToHistoryRecord } from '../services/historyAdapter';
import { formatWeekFromDate } from '../utils/dateUtils';

const getModalidade = (part: WorkbookPart): string => {
    if (part.modalidade) return part.modalidade;
    return getModalidadeFromTipo(part.tipoParte, part.section);
};

export const PublisherSelect = ({ part, publishers, value, displayName, onChange, disabled, style, weekParts, allParts, history }: PublisherSelectProps) => {

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

    // Memoizar a lista sorted para evitar recálculo excessivo
    const sortedOptions = useMemo(() => {
        const modalidade = getModalidade(part);
        const funcao = part.funcao === 'Ajudante' ? EnumFuncao.AJUDANTE : EnumFuncao.TITULAR;
        // v8.4: Usar helper centralizado para contexto
        const eligibilityContext = buildEligibilityContext(part, weekParts, publishers);

        // historyRecords e today vêm do escopo externo agora
        // Coletar publicadores já designados nesta semana (excluindo a parte atual)
        const publishersInSameWeek = new Set<string>();
        if (weekParts) {
            for (const wp of weekParts) {
                // Pular a parte atual
                if (wp.id === part.id) continue;
                // Só considerar partes da mesma semana
                if (wp.weekId !== part.weekId) continue;
                // Só considerar partes com publicador atribuído
                if (wp.resolvedPublisherName) {
                    publishersInSameWeek.add(wp.resolvedPublisherName);
                }
            }
        }

        return [...publishers].map(p => {
            // Verificar se já tem designação na mesma semana
            const hasDesignationInSameWeek = publishersInSameWeek.has(p.name);

            // Checar elegibilidade de cada publicador
            let result = checkEligibility(
                p,
                modalidade as Parameters<typeof checkEligibility>[1],
                funcao,
                eligibilityContext
            );

            // Se já tem designação na semana, marcar como inelegível
            if (hasDesignationInSameWeek && result.eligible) {
                result = { eligible: false, reason: 'Já tem designação nesta semana' };
            }

            // v9.4: Identificar Presidente da semana para penalidade em Oração Final
            const currentPresidentPart = weekParts?.find(wp => wp.tipoParte.toLowerCase().includes('presidente') && wp.resolvedPublisherName);
            const currentPresident = currentPresidentPart?.resolvedPublisherName;

            // Calcular prioridade usando o NOVO serviço centralizado (Restored Unified Service)
            const scoreData = calculateScore(p, part.tipoParte, historyRecords, referenceDate, currentPresident);
            // Compatibilidade com código legado que espera apenas um número
            const priority = scoreData.score;

            // Verificar Cooldown para aviso visual (NÃO bloqueia mais, apenas avisa)
            // Usa o tipo específico da parte (ex: "Leitura da Bíblia")
            // v9.5: Filtrar histórico para excluir a semana ATUAL do cálculo de cooldown
            // (Evita que a designação desta semana, se já salva, acione o aviso "Designado para...")
            const historyForCooldown = historyRecords.filter(h => h.weekId !== part.weekId);
            const cooldownInfo = getBlockInfo(p.name, historyForCooldown, referenceDate);

            // v8.1: Prioridade para irmãs em demonstrações
            const isSisterForDemo =
                modalidade === EnumModalidade.DEMONSTRACAO &&
                p.gender === 'sister' &&
                part.funcao === 'Titular';

            return {
                publisher: p,
                eligible: result.eligible,
                reason: result.reason,
                priority,
                scoreData, // Expor dados completos para tooltip
                hasDesignationInSameWeek,
                cooldownInfo,
                isSisterForDemo
            };
        }).sort((a, b) => {
            // 1. Elegível vem primeiro
            if (a.eligible && !b.eligible) return -1;
            if (!a.eligible && b.eligible) return 1;

            // 2. (Removido) Prioridade v8.1 substituída pela lógica unificada v8.2 abaixo

            // EXCEÇÃO PARA DEMONSTRAÇÕES (v8.2)
            // Ordem: Irmã > Varão Comum > SM > Ancião
            if (modalidade === EnumModalidade.DEMONSTRACAO && a.eligible && b.eligible) {
                const getDemoScore = (p: Publisher) => {
                    if (p.gender === 'sister') return 4; // Irmã (Máxima)
                    if (!isElderOrMS(p)) return 3; // Varão Comum (Alta)
                    if (p.condition === 'Servo Ministerial') return 2; // SM (Média)
                    return 1; // Ancião (Baixa)
                }
                const scoreA = getDemoScore(a.publisher);
                const scoreB = getDemoScore(b.publisher);

                if (scoreA !== scoreB) {
                    return scoreB - scoreA;
                }
            }

            // 3. Ordenar por prioridade de rotação (maior primeiro)
            if (a.priority !== b.priority) {
                // EXCEÇÃO DE ORDENAÇÃO PARA LEITOR EBC (v8.2)
                // Se for Leitor EBC, queremos agrupar por categoria hierárquica ANTES da pontuação
                // Ordem: Varão > SM > Ancião
                if (modalidade === EnumModalidade.LEITOR_EBC && a.eligible && b.eligible) {
                    const getScore = (p: Publisher) => {
                        if (!isElderOrMS(p)) return 3; // Varão Comum (Alta)
                        if (p.condition === 'Servo Ministerial') return 2; // SM (Média)
                        return 1; // Ancião (Baixa)
                    }
                    const scoreA = getScore(a.publisher);
                    const scoreB = getScore(b.publisher);

                    if (scoreA !== scoreB) {
                        return scoreB - scoreA; // Maior score (3) aparece primeiro
                    }
                    // Se empate na categoria, usa prioridade normal abaixo
                }

                return b.priority - a.priority;
            }

            // 4. Ordem alfabética como desempate
            return a.publisher.name.localeCompare(b.publisher.name);
        });
    }, [part, publishers, weekParts, allParts]);

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

    // Se não encontrou match mas tem displayName, vamos mostrar como opção especial
    const showUnmatchedName = displayName && !foundPublisher;

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
        if (!foundPublisher) return null;
        // v9.5: Filtrar histórico para excluir semana atual
        const historyForCooldown = historyRecords.filter(h => h.weekId !== part.weekId);
        return getBlockInfo(foundPublisher.name, historyForCooldown, referenceDate);
    }, [foundPublisher, part.tipoParte, historyRecords, referenceDate]);

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

        // v9.4: Identificar Presidente da semana para avaliacao de score no tooltip
        const currentPresidentPart = weekParts?.find(wp => wp.tipoParte.toLowerCase().includes('presidente') && wp.resolvedPublisherName);
        const currentPresident = currentPresidentPart?.resolvedPublisherName;

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
                            {selectedCooldownInfo.weeksSinceLast >= 0
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

                {/* Score Unificado (Debug/Info) */}
                {foundPublisher && (
                    <div style={{
                        marginTop: '8px',
                        paddingTop: '8px',
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                        fontSize: '0.8em',
                        color: '#9ca3af'
                    }}>
                        📊 {calculateScore(foundPublisher, part.tipoParte, historyRecords, referenceDate, currentPresident).explanation}
                    </div>
                )}

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

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <select
                value={effectiveValue}
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
                {/* Se temos um nome não encontrado na lista, mostrar como opção selecionada */}
                {showUnmatchedName && (
                    <option value="__unmatched__" disabled style={{ fontStyle: 'italic', color: '#9CA3AF' }}>
                        ⚠️ {displayName} (não encontrado)
                    </option>
                )}
                {sortedOptions.map(({ publisher: p, eligible, reason, cooldownInfo }) => {
                    // Ícone de status: Se inelegível = ⚠️; Senão se em cooldown = ⏳; Senão vazio
                    const icon = !eligible ? '⚠️ ' : (cooldownInfo?.isInCooldown ? '⏳ ' : '');

                    return (
                        <option
                            key={p.id}
                            value={p.id}
                            style={{
                                color: eligible ? 'inherit' : '#9CA3AF',
                                fontStyle: eligible ? 'normal' : 'italic',
                                fontWeight: (eligible && cooldownInfo?.isInCooldown) ? 'bold' : 'normal'
                            }}
                            title={eligible
                                ? (cooldownInfo?.isInCooldown
                                    ? (cooldownInfo.weeksSinceLast >= 0
                                        ? `⏳ Participações Passadas: Fez ${cooldownInfo.lastPartType} na ${cooldownInfo.weekDisplay || formatWeekFromDate(cooldownInfo.lastDate || '')} `
                                        : `⏳ Designações Futuras: Designado para ${cooldownInfo.lastPartType} na ${cooldownInfo.weekDisplay || formatWeekFromDate(cooldownInfo.lastDate || '')} `)
                                    : '✅ Elegível')
                                : `❌ ${reason} `}
                        >
                            {icon}{p.name}
                        </option>
                    );
                })}
            </select>

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
        </div>
    );
};
