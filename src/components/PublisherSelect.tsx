import { useMemo } from 'react';
import { type Publisher, type WorkbookPart } from '../types';
import { checkEligibility, isPastWeekDate } from '../services/eligibilityService';
import { checkMultipleAssignments, type AssignmentWarning } from '../services/cooldownService';
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
}

// Helpers copiados/adaptados para garantir compatibilidade com a lógica de elegibilidade
const TIPO_TO_MODALIDADE: Record<string, string> = {
    'Presidente': EnumModalidade.PRESIDENCIA,
    'Oração Inicial': EnumModalidade.ORACAO,
    'Oração Final': EnumModalidade.ORACAO,
    'Comentários Iniciais': EnumModalidade.PRESIDENCIA,
    'Comentários Finais': EnumModalidade.PRESIDENCIA,
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
    'Necessidades Locais': EnumModalidade.DISCURSO_ENSINO,
};

const getModalidade = (part: WorkbookPart): string => {
    if (part.modalidade) return part.modalidade;
    return TIPO_TO_MODALIDADE[part.tipoParte] || EnumModalidade.DEMONSTRACAO;
};

export const PublisherSelect = ({ part, publishers, value, displayName, onChange, disabled, style, weekParts }: PublisherSelectProps) => {

    // Memoizar a lista sorted para evitar recálculo excessivo
    const sortedOptions = useMemo(() => {
        const modalidade = getModalidade(part);
        const isOracaoInicial = part.tipoParte.toLowerCase().includes('inicial');
        const funcao = part.funcao === 'Ajudante' ? EnumFuncao.AJUDANTE : EnumFuncao.TITULAR;
        const isPast = isPastWeekDate(part.date);

        return [...publishers].map(p => {
            // Checar elegibilidade de cada publicador
            const result = checkEligibility(
                p,
                modalidade as Parameters<typeof checkEligibility>[1],
                funcao,
                { date: part.date, isOracaoInicial, secao: part.section, isPastWeek: isPast }
            );
            return { publisher: p, eligible: result.eligible, reason: result.reason };
        }).sort((a, b) => {
            // 1. Elegível vem primeiro
            if (a.eligible && !b.eligible) return -1;
            if (!a.eligible && b.eligible) return 1;

            // 2. Ordem alfabética
            return a.publisher.name.localeCompare(b.publisher.name);
        });
    }, [part, publishers]);

    // Determinar o valor efetivo - tentar encontrar ID pelo nome se não temos ID
    // Agora usa busca fonética/fuzzy para melhor match (ex: "eryc" encontra "Erik")
    const { effectiveValue, foundPublisher, eligibilityInfo } = useMemo(() => {
        const modalidade = getModalidade(part);
        const isOracaoInicial = part.tipoParte.toLowerCase().includes('inicial');
        const funcao = part.funcao === 'Ajudante' ? EnumFuncao.AJUDANTE : EnumFuncao.TITULAR;

        if (value) {
            const pub = publishers.find(p => p.id === value);
            if (pub) {
                const isPast = isPastWeekDate(part.date);
                const result = checkEligibility(
                    pub,
                    modalidade as Parameters<typeof checkEligibility>[1],
                    funcao,
                    { date: part.date, isOracaoInicial, secao: part.section, isPastWeek: isPast }
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
                const isPast = isPastWeekDate(part.date);
                const result = checkEligibility(
                    found,
                    modalidade as Parameters<typeof checkEligibility>[1],
                    funcao,
                    { date: part.date, isOracaoInicial, secao: part.section, isPastWeek: isPast }
                );
                return {
                    effectiveValue: found.id,
                    foundPublisher: found,
                    eligibilityInfo: { eligible: result.eligible, reason: result.reason }
                };
            }
        }
        return { effectiveValue: '', foundPublisher: undefined, eligibilityInfo: undefined };
    }, [value, displayName, publishers, part]);

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
            partsForCheck,
            true // excluir partes de presidência (normal ter múltiplas)
        );
    }, [foundPublisher, weekParts, part.weekId]);

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
                        if (pub) onChange(pub.id, pub.name);
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
                {sortedOptions.map(({ publisher: p, eligible, reason }) => {
                    return (
                        <option
                            key={p.id}
                            value={p.id}
                            style={{
                                color: eligible ? 'inherit' : '#9CA3AF',
                                fontStyle: eligible ? 'normal' : 'italic'
                            }}
                            title={eligible ? '✅ Elegível' : `❌ ${reason}`}
                        >
                            {eligible ? '' : '⚠️ '}{p.name}
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
