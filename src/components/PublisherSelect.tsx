import { useMemo } from 'react';
import { type Publisher, type WorkbookPart } from '../types';
import { checkEligibility } from '../services/eligibilityService';
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

export const PublisherSelect = ({ part, publishers, value, displayName, onChange, disabled, style }: PublisherSelectProps) => {

    // Memoizar a lista sorted para evitar recálculo excessivo
    const sortedOptions = useMemo(() => {
        const modalidade = getModalidade(part);
        const isOracaoInicial = part.tipoParte.toLowerCase().includes('inicial');
        const funcao = part.funcao === 'Ajudante' ? EnumFuncao.AJUDANTE : EnumFuncao.TITULAR;

        return [...publishers].map(p => {
            // Checar elegibilidade de cada publicador
            const result = checkEligibility(
                p,
                modalidade as Parameters<typeof checkEligibility>[1],
                funcao,
                { date: part.date, isOracaoInicial, secao: part.section }
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
                const result = checkEligibility(
                    pub,
                    modalidade as Parameters<typeof checkEligibility>[1],
                    funcao,
                    { date: part.date, isOracaoInicial, secao: part.section }
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
                const result = checkEligibility(
                    found,
                    modalidade as Parameters<typeof checkEligibility>[1],
                    funcao,
                    { date: part.date, isOracaoInicial, secao: part.section }
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

    // Construir texto do tooltip
    const getTooltipText = () => {
        if (!foundPublisher) return 'Nenhum publicador selecionado';

        const lines = [
            `📋 ${foundPublisher.name}`,
            `👔 ${foundPublisher.condition}`,
            `${foundPublisher.gender === 'brother' ? '👨 Irmão' : '👩 Irmã'}`,
        ];

        if (eligibilityInfo) {
            if (eligibilityInfo.eligible) {
                lines.push('', '✅ ELEGÍVEL para esta parte');

                // Explicação em linguagem natural do porquê é elegível
                const modalidade = getModalidade(part);
                const funcao = part.funcao === 'Ajudante' ? 'Ajudante' : 'Titular';
                const explanations: string[] = [];

                // Explicar baseado na modalidade/função
                if (funcao === 'Ajudante') {
                    explanations.push('Pode participar como ajudante em demonstrações');
                } else {
                    switch (modalidade) {
                        case EnumModalidade.PRESIDENCIA:
                            explanations.push(`${foundPublisher.condition} com privilégio de presidir`);
                            break;
                        case EnumModalidade.ORACAO:
                            explanations.push('Irmão batizado com privilégio de orar');
                            break;
                        case EnumModalidade.DISCURSO_ENSINO:
                            if (foundPublisher.condition === 'Ancião' || foundPublisher.condition === 'Anciao') {
                                explanations.push('Ancião aprovado para discursos de ensino');
                            } else {
                                explanations.push('Servo Ministerial com privilégio de discurso');
                            }
                            break;
                        case EnumModalidade.LEITURA_ESTUDANTE:
                            explanations.push('Publicador atuante pode fazer leitura');
                            break;
                        case EnumModalidade.DEMONSTRACAO:
                            if (foundPublisher.gender === 'sister') {
                                explanations.push('Irmã atuante pode fazer demonstrações');
                            } else {
                                explanations.push('Irmão atuante pode fazer demonstrações');
                            }
                            break;
                        case EnumModalidade.DISCURSO_ESTUDANTE:
                            explanations.push('Irmão atuante pode fazer discurso de estudante');
                            break;
                        case EnumModalidade.DIRIGENTE_EBC:
                            explanations.push('Ancião com privilégio de dirigir EBC');
                            break;
                        case EnumModalidade.LEITOR_EBC:
                            explanations.push('Irmão com privilégio de ler no EBC');
                            break;
                        default:
                            explanations.push('Atende os requisitos para esta parte');
                    }
                }

                if (explanations.length > 0) {
                    lines.push(`➡️ ${explanations.join('; ')}`);
                }
            } else {
                lines.push('', `❌ NÃO ELEGÍVEL: ${eligibilityInfo.reason}`);
            }
        }

        return lines.join('\n');
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
                    overflow: 'hidden'
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

            {/* Ícone de ajuda com tooltip dinâmico de elegibilidade */}
            <Tooltip content={getTooltipText()}>
                <span
                    style={{
                        cursor: 'help',
                        background: eligibilityInfo?.eligible === false ? 'rgba(239, 68, 68, 0.2)' : 'rgba(107, 114, 128, 0.2)',
                        color: eligibilityInfo?.eligible === false ? '#ef4444' : '#6b7280',
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        flexShrink: 0,
                        border: eligibilityInfo?.eligible === false ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(107, 114, 128, 0.3)'
                    }}
                >
                    ?
                </span>
            </Tooltip>
        </div>
    );
};
