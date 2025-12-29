import { useMemo } from 'react';
import { type Publisher, type WorkbookPart } from '../types';
import { checkEligibility } from '../services/eligibilityService';
import { EnumModalidade, EnumFuncao } from '../types';

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

        return [...publishers].sort((a, b) => {
            // Checar elegibilidade A
            const eligibleA = checkEligibility(
                a,
                modalidade as Parameters<typeof checkEligibility>[1],
                funcao,
                { date: part.date, isOracaoInicial, secao: part.section }
            ).eligible;

            // Checar elegibilidade B
            const eligibleB = checkEligibility(
                b,
                modalidade as Parameters<typeof checkEligibility>[1],
                funcao,
                { date: part.date, isOracaoInicial, secao: part.section }
            ).eligible;

            // 1. Elegível vem primeiro
            if (eligibleA && !eligibleB) return -1;
            if (!eligibleA && eligibleB) return 1;

            // 2. Ordem alfabética
            return a.name.localeCompare(b.name);
        });
    }, [part, publishers]);

    // Normalizar nome para comparação (lowercase + trim + remover acentos)
    const normalizeForMatch = (s: string | undefined | null): string => {
        if (!s) return '';
        return s.toLowerCase().trim()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Remove acentos
    };

    // Determinar o valor efetivo - tentar encontrar ID pelo nome se não temos ID
    const { effectiveValue, foundPublisher } = useMemo(() => {
        if (value) {
            const pub = publishers.find(p => p.id === value);
            return { effectiveValue: value, foundPublisher: pub };
        }
        if (displayName) {
            const normalizedDisplay = normalizeForMatch(displayName);
            // Tentar match exato primeiro
            let found = publishers.find(p => p.name === displayName);
            // Se não encontrou, tentar match normalizado
            if (!found) {
                found = publishers.find(p => normalizeForMatch(p.name) === normalizedDisplay);
            }
            if (found) return { effectiveValue: found.id, foundPublisher: found };
        }
        return { effectiveValue: '', foundPublisher: undefined };
    }, [value, displayName, publishers]);

    // Se não encontrou match mas tem displayName, vamos mostrar como opção especial
    const showUnmatchedName = displayName && !foundPublisher;

    return (
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
            style={style}
        >
            <option value="">Selecione...</option>
            {/* Se temos um nome não encontrado na lista, mostrar como opção selecionada */}
            {showUnmatchedName && (
                <option value="__unmatched__" disabled style={{ fontStyle: 'italic', color: '#9CA3AF' }}>
                    ⚠️ {displayName} (não encontrado)
                </option>
            )}
            {sortedOptions.map(p => {
                return (
                    <option key={p.id} value={p.id}>
                        {p.name}
                    </option>
                );
            })}
        </select>
    );
};
