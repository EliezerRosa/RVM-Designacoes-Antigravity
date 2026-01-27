/**
 * GenerationModal - Modal Inteligente de Geração de Designações
 * 
 * Features:
 * - Seletor de período de análise
 * - Métricas do período em tempo real
 * - Configuração editável do motor (TuningConfig)
 * - Preview de partes a gerar
 * - Opção de Dry Run (simulação)
 * - Auto-Tuning opcional
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { WorkbookPart, Publisher, AnalysisPeriod, TuningConfig, TuningMetrics } from '../types';
import { DEFAULT_TUNING_CONFIG } from '../types';
import {
    loadAnalysisPeriod,
    saveAnalysisPeriod,
    loadTuningConfig,
    saveTuningConfig,
    collectMetrics,
    runAutoTuning,
} from '../services/autoTuningService';
import { validatePartsBeforeGeneration, type ValidationWarning } from '../services/linearRotationService';
import { S140PreviewCarousel } from './S140PreviewCarousel';
import { rebalanceAllQueues } from '../services/queueBalancerService';

// ===== Tipos =====

export interface GenerationConfig {
    period: AnalysisPeriod;           // Período de análise (para tuning)
    tuningConfig: TuningConfig;
    runAutoTuning: boolean;
    isDryRun: boolean;
    // Novo: Período de geração (separado do tuning)
    generationWeeks?: string[];       // Semanas específicas para gerar (weekId)
    forceAllPartsInPeriod?: boolean;  // Se true, ignora status quando período definido
}

export interface GenerationResult {
    success: boolean;
    partsGenerated: number;
    warnings: string[];
    errors: string[];
    dryRun: boolean;
    generatedWeeks?: string[];  // IDs das semanas que foram geradas
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (config: GenerationConfig) => Promise<GenerationResult>;
    parts: WorkbookPart[];
    publishers: Publisher[];
    onNavigateToPart?: (partId: string) => void;  // Navegar para parte na aba Apostila
}

// ===== Estilos =====

const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
};

const modalContentStyle: React.CSSProperties = {
    background: 'white',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '700px',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
};

const headerStyle: React.CSSProperties = {
    padding: '16px 24px',
    borderBottom: '1px solid #E5E7EB',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
    color: 'white',
    borderRadius: '12px 12px 0 0',
};

const sectionStyle: React.CSSProperties = {
    padding: '16px 24px',
    borderBottom: '1px solid #F3F4F6',
};

const sectionTitleStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
};

const cardStyle: React.CSSProperties = {
    background: '#F9FAFB',
    borderRadius: '8px',
    padding: '12px 16px',
    border: '1px solid #E5E7EB',
};

const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    border: '1px solid #D1D5DB',
    borderRadius: '6px',
    fontSize: '14px',
    width: '100%',
};

const buttonStyle = (bg: string, disabled = false): React.CSSProperties => ({
    padding: '10px 20px',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? '#9CA3AF' : bg,
    color: 'white',
    transition: 'all 0.2s',
    opacity: disabled ? 0.6 : 1,
});

// Componente Tooltip Info
const InfoTooltip = ({ text }: { text: string }) => (
    <span
        title={text}
        style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            background: '#E5E7EB',
            color: '#6B7280',
            fontSize: '11px',
            fontWeight: '700',
            cursor: 'help',
            marginLeft: '4px',
            verticalAlign: 'middle',
        }}
    >
        ?
    </span>
);

// ===== Componente =====

export function GenerationModal({ isOpen, onClose, onGenerate, parts, publishers, onNavigateToPart }: Props) {
    // Estado do período
    const [period, setPeriod] = useState<AnalysisPeriod | null>(null);
    const [tempStartDate, setTempStartDate] = useState('');
    const [tempEndDate, setTempEndDate] = useState('');

    // Estado da configuração
    const [config, setConfig] = useState<TuningConfig>(DEFAULT_TUNING_CONFIG);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Estado das métricas
    const [metrics, setMetrics] = useState<TuningMetrics | null>(null);
    const [loadingMetrics, setLoadingMetrics] = useState(false);

    // Estado do preview
    const [validationWarnings, setValidationWarnings] = useState<ValidationWarning[]>([]);

    // Estado das opções
    const [runAutoTuningOption, setRunAutoTuningOption] = useState(false);
    const [isDryRun, setIsDryRun] = useState(false);

    // Estado de execução
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<GenerationResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showS140Preview, setShowS140Preview] = useState(false);

    // Estado do período de geração (separado do tuning)
    const [selectedWeeks, setSelectedWeeks] = useState<string[]>([]);

    // Semanas disponíveis para seleção (futuras, ordenadas)
    const availableWeeks = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const parseDate = (dateStr: string): Date => {
            if (!dateStr) return new Date(0);
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) return new Date(dateStr + 'T12:00:00');
            const dmy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (dmy) return new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T12:00:00`);
            return new Date(dateStr);
        };

        const weekMap = new Map<string, { weekId: string; weekDisplay: string; date: Date }>();
        parts.forEach(p => {
            const d = parseDate(p.date);
            if (d >= today && !weekMap.has(p.weekId)) {
                weekMap.set(p.weekId, { weekId: p.weekId, weekDisplay: p.weekDisplay, date: d });
            }
        });

        return Array.from(weekMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [parts]);

    // Partes a gerar - lógica XOR
    const pendingParts = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const parseDate = (dateStr: string): Date => {
            if (!dateStr) return new Date(0);
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) return new Date(dateStr + 'T12:00:00');
            const dmy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (dmy) return new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T12:00:00`);
            return new Date(dateStr);
        };

        return parts.filter(p => {
            const d = parseDate(p.date);
            if (d < today) return false; // Sempre excluir passadas
            if (p.funcao !== 'Titular' && p.funcao !== 'Ajudante') return false;
            if (p.status === 'CONCLUIDA' || p.status === 'CANCELADA') return false;

            // LÓGICA XOR:
            // Se semanas específicas selecionadas → incluir TODAS do período
            if (selectedWeeks.length > 0) {
                return selectedWeeks.includes(p.weekId);
            }

            // Senão → só PENDENTE ou sem publicador
            return p.status === 'PENDENTE' || !p.resolvedPublisherName;
        });
    }, [parts, selectedWeeks]);

    // Agrupar por semana para preview (usando weekDisplay para exibição)
    const partsByWeek = pendingParts.reduce((acc, part) => {
        const week = part.weekDisplay || part.weekId;
        if (!acc[week]) acc[week] = [];
        acc[week].push(part);
        return acc;
    }, {} as Record<string, WorkbookPart[]>);

    // Agrupar por weekId para o carrossel S-140 (precisa de todas as partes da semana)
    const partsByWeekId = parts.reduce((acc, part) => {
        const weekId = part.weekId;
        if (!acc[weekId]) acc[weekId] = [];
        acc[weekId].push(part);
        return acc;
    }, {} as Record<string, WorkbookPart[]>);

    // Semanas ordenadas para o carrossel
    const weekOrder = [...new Set(pendingParts.map(p => p.weekId))].sort();

    // Carregar dados iniciais
    useEffect(() => {
        if (isOpen) {
            loadInitialData();
        }
    }, [isOpen]);

    const loadInitialData = async () => {
        try {
            setLoading(true);
            setError(null);
            setResult(null);

            // Carregar período
            const savedPeriod = await loadAnalysisPeriod();
            setPeriod(savedPeriod);
            setTempStartDate(savedPeriod.startDate);
            setTempEndDate(savedPeriod.endDate);

            // Carregar config
            const savedConfig = await loadTuningConfig();
            setConfig(savedConfig);

            // Validar partes
            const warnings = validatePartsBeforeGeneration(pendingParts);
            setValidationWarnings(warnings);

            // Carregar métricas
            await loadMetrics(savedPeriod, publishers);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
        } finally {
            setLoading(false);
        }
    };

    const loadMetrics = useCallback(async (p: AnalysisPeriod, pubs: Publisher[]) => {
        try {
            setLoadingMetrics(true);
            const m = await collectMetrics(p, pubs);
            setMetrics(m);
        } catch (err) {
            console.error('Erro ao carregar métricas:', err);
        } finally {
            setLoadingMetrics(false);
        }
    }, []);

    // Atualizar período
    const handlePeriodChange = async () => {
        if (!tempStartDate || !tempEndDate) return;

        const newPeriod: AnalysisPeriod = {
            startDate: tempStartDate,
            endDate: tempEndDate,
            isDefault: false,
        };

        setPeriod(newPeriod);
        await loadMetrics(newPeriod, publishers);
    };

    // Presets de período
    const setPresetPeriod = async (months: number) => {
        const end = new Date();
        const start = new Date();
        start.setMonth(start.getMonth() - months);

        const newPeriod: AnalysisPeriod = {
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0],
            isDefault: months === 6,
        };

        setPeriod(newPeriod);
        setTempStartDate(newPeriod.startDate);
        setTempEndDate(newPeriod.endDate);
        await loadMetrics(newPeriod, publishers);
    };

    // Atualizar config
    const updateConfig = (key: keyof TuningConfig, value: number | boolean) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    // Executar geração
    const handleGenerate = async (forceDryRun?: boolean) => {
        if (!period) return;

        // Usar o parâmetro forçado se fornecido, senão usar o estado
        const effectiveDryRun = forceDryRun !== undefined ? forceDryRun : isDryRun;
        console.log('[Modal] handleGenerate chamado com dryRun:', effectiveDryRun);

        try {
            setLoading(true);
            setError(null);
            setShowS140Preview(false); // Reset preview

            // Salvar período e config se alterados
            await saveAnalysisPeriod(period);
            await saveTuningConfig(config);

            // Executar auto-tuning se solicitado
            if (runAutoTuningOption) {
                console.log('[Modal] Executando auto-tuning...');
                const tuningResult = await runAutoTuning(publishers, period);
                setConfig(tuningResult.newConfig);
            }

            // Chamar função de geração
            const genConfig: GenerationConfig = {
                period,
                tuningConfig: config,
                runAutoTuning: runAutoTuningOption,
                isDryRun: effectiveDryRun,
                generationWeeks: selectedWeeks.length > 0 ? selectedWeeks : undefined,
                forceAllPartsInPeriod: selectedWeeks.length > 0,
            };

            console.log('[Modal] Chamando onGenerate com config:', genConfig);
            const genResult = await onGenerate(genConfig);
            console.log('[Modal] Resultado da geração:', genResult);
            setResult(genResult);

            // Se foi simulação e teve sucesso, mostrar preview automaticamente
            if (genResult.success && genResult.dryRun) {
                console.log('[Modal] Simulação bem-sucedida, habilitando preview S-140');
                setShowS140Preview(true);
            }

            if (genResult.success && !genResult.dryRun) {
                // Fechar modal após sucesso (não dry-run)
                setTimeout(() => onClose(), 2000);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro na geração');
            console.error('[Modal] Erro na geração:', err);
        } finally {
            setLoading(false);
        }
    };

    // Rebalancear Filas (IA)
    const handleRebalance = async () => {
        if (!confirm('Isso irá reorganizar a fila de rotação baseada no Score de Justiça e resetar a ordem atual. O próximo gerado será o mais prioritário. Deseja continuar?')) return;

        try {
            setLoading(true);
            await rebalanceAllQueues(publishers);
            alert('Filas rebalanceadas com sucesso! O Robô agora seguirá a nova ordem otimizada.');

            // Recarregar métricas para garantir dados frescos
            if (period) {
                await loadMetrics(period, publishers);
            }
        } catch (err) {
            console.error('Erro ao rebalancear:', err);
            alert('Erro ao rebalancear filas: ' + (err instanceof Error ? err.message : 'Erro desconhecido'));
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={modalOverlayStyle} onClick={onClose}>
            <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '24px' }}>🎯</span>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>
                                Gerar Designações
                            </h2>
                            <span style={{ fontSize: '12px', opacity: 0.8 }}>
                                {pendingParts.length} partes pendentes em {Object.keys(partsByWeek).length} semanas
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer' }}
                    >
                        ✕
                    </button>
                </div>

                {/* Erro */}
                {error && (
                    <div style={{ padding: '12px 24px', background: '#FEE2E2', color: '#B91C1C', fontSize: '14px' }}>
                        ❌ {error}
                    </div>
                )}

                {/* Resultado */}
                {result && (
                    <div style={{
                        padding: '12px 24px',
                        background: result.success ? '#D1FAE5' : '#FEE2E2',
                        color: result.success ? '#047857' : '#B91C1C',
                        fontSize: '14px'
                    }}>
                        {result.success ? (
                            <>
                                ✅ {result.dryRun ? 'Simulação: ' : ''}{result.partsGenerated} partes geradas
                                {result.warnings.length > 0 && (
                                    <div style={{ marginTop: '8px', fontSize: '12px' }}>
                                        ⚠️ Avisos: {result.warnings.join(', ')}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>❌ {result.errors.join(', ')}</>
                        )}
                    </div>
                )}

                {/* Seção: Preview S-140 (após simulação) */}
                {result && result.dryRun && result.success && (
                    <div style={sectionStyle}>
                        <div style={{ ...sectionTitleStyle, cursor: 'pointer' }} onClick={() => setShowS140Preview(!showS140Preview)}>
                            <span>📄</span> Preview S-140 Sala B A4
                            <span style={{ fontSize: '12px', color: '#6B7280', marginLeft: 'auto' }}>
                                {showS140Preview ? '▲ Ocultar' : '▼ Mostrar'} ({weekOrder.length} semanas)
                            </span>
                        </div>
                        {showS140Preview && (
                            <S140PreviewCarousel
                                weekParts={partsByWeekId}
                                weekOrder={weekOrder}
                            />
                        )}
                    </div>
                )}

                {/* Seção: Período de Análise */}
                <div style={sectionStyle}>
                    <div style={sectionTitleStyle}>
                        <span>📊</span> Período de Análise
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                            type="date"
                            value={tempStartDate}
                            onChange={e => setTempStartDate(e.target.value)}
                            style={{ ...inputStyle, width: '150px' }}
                        />
                        <span style={{ color: '#6B7280' }}>até</span>
                        <input
                            type="date"
                            value={tempEndDate}
                            onChange={e => setTempEndDate(e.target.value)}
                            style={{ ...inputStyle, width: '150px' }}
                        />
                        <button
                            onClick={handlePeriodChange}
                            style={{ ...buttonStyle('#6366F1'), padding: '8px 12px', fontSize: '12px' }}
                        >
                            Atualizar
                        </button>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {[3, 6, 12].map(m => (
                                <button
                                    key={m}
                                    onClick={() => setPresetPeriod(m)}
                                    style={{
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        border: '1px solid #D1D5DB',
                                        borderRadius: '4px',
                                        background: 'white',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {m}m
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Seção: Período de Geração (separado do tuning) */}
                <div style={sectionStyle}>
                    <div style={sectionTitleStyle}>
                        <span>🎯</span> Período de Geração
                        <InfoTooltip text="Selecione semanas específicas para gerar TODAS as partes (ignora status). Se nenhuma selecionada, só gera PENDENTE ou sem publicador." />
                    </div>
                    <div style={{ marginBottom: '8px', fontSize: '12px', color: '#6B7280' }}>
                        {selectedWeeks.length > 0
                            ? `${selectedWeeks.length} semana(s) selecionada(s) - gerará TODAS as partes`
                            : 'Nenhuma semana selecionada - só gerará partes PENDENTE ou sem publicador'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                        {availableWeeks.map(week => {
                            const isSelected = selectedWeeks.includes(week.weekId);
                            return (
                                <button
                                    key={week.weekId}
                                    onClick={() => {
                                        if (isSelected) {
                                            setSelectedWeeks(prev => prev.filter(w => w !== week.weekId));
                                        } else {
                                            setSelectedWeeks(prev => [...prev, week.weekId]);
                                        }
                                    }}
                                    style={{
                                        padding: '4px 10px',
                                        fontSize: '11px',
                                        border: isSelected ? '2px solid #4F46E5' : '1px solid #D1D5DB',
                                        borderRadius: '16px',
                                        background: isSelected ? '#EEF2FF' : 'white',
                                        color: isSelected ? '#4F46E5' : '#374151',
                                        cursor: 'pointer',
                                        fontWeight: isSelected ? '600' : '400',
                                    }}
                                >
                                    {week.weekDisplay}
                                </button>
                            );
                        })}
                    </div>
                    <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => setSelectedWeeks(availableWeeks.map(w => w.weekId))}
                            style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid #D1D5DB', borderRadius: '4px', background: 'white', cursor: 'pointer' }}
                        >
                            Selecionar Todas
                        </button>
                        <button
                            onClick={() => setSelectedWeeks([])}
                            style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid #D1D5DB', borderRadius: '4px', background: 'white', cursor: 'pointer' }}
                        >
                            Limpar Seleção
                        </button>
                    </div>
                </div>
                {/* Seção: Métricas */}
                <div style={sectionStyle}>
                    <div style={sectionTitleStyle}>
                        <span>📈</span> Métricas do Período
                        {loadingMetrics && <span style={{ fontSize: '12px', color: '#6B7280' }}>(carregando...)</span>}
                    </div>
                    {metrics ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                            <div style={cardStyle}>
                                <div style={{ fontSize: '20px', fontWeight: '700', color: '#4F46E5' }}>
                                    {metrics.totalParticipations}
                                </div>
                                <div style={{ fontSize: '11px', color: '#6B7280' }}>
                                    Participações
                                    <InfoTooltip text="Total de participações registradas no período de análise. Usado como base para calcular distribuição." />
                                </div>
                            </div>
                            <div style={cardStyle}>
                                <div style={{ fontSize: '20px', fontWeight: '700', color: '#059669' }}>
                                    {metrics.activePublishers}
                                </div>
                                <div style={{ fontSize: '11px', color: '#6B7280' }}>
                                    Publicadores Ativos
                                    <InfoTooltip text="Quantidade de publicadores que receberam pelo menos 1 designação no período. Ideal: todos os aptos participando." />
                                </div>
                            </div>
                            <div style={cardStyle}>
                                <div style={{ fontSize: '20px', fontWeight: '700', color: metrics.distributionStdDev > 2 ? '#DC2626' : '#059669' }}>
                                    {metrics.distributionStdDev.toFixed(1)}
                                </div>
                                <div style={{ fontSize: '11px', color: '#6B7280' }}>
                                    Desvio Padrão
                                    <InfoTooltip text="Mede o equilíbrio na distribuição. Ideal: < 2.0 (verde). Valores altos indicam que alguns publicadores recebem muito mais partes que outros." />
                                </div>
                            </div>
                            <div style={cardStyle}>
                                <div style={{ fontSize: '20px', fontWeight: '700', color: metrics.idlePublishers > 0 ? '#F59E0B' : '#059669' }}>
                                    {metrics.idlePublishers}
                                </div>
                                <div style={{ fontSize: '11px', color: '#6B7280' }}>
                                    Ociosos
                                    <InfoTooltip text="Publicadores aptos sem designação há mais de 8 semanas. Ideal: 0 (verde). Amarelo indica publicadores que precisam participar." />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ ...cardStyle, textAlign: 'center', color: '#6B7280' }}>
                            Carregando métricas...
                        </div>
                    )}
                </div>

                {/* Seção: Configuração Avançada (Fase 4) */}
                <div style={sectionStyle}>
                    <div style={{ ...sectionTitleStyle, cursor: 'pointer' }} onClick={() => setShowAdvanced(!showAdvanced)}>
                        <span>🎛️</span> Configuração Avançada (Fase 4)
                        <span style={{ fontSize: '12px', color: '#6B7280', marginLeft: 'auto' }}>
                            {showAdvanced ? '▲ Ocultar' : '▼ Mostrar'}
                        </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px', fontStyle: 'italic' }}>
                        ℹ️ Estes parâmetros afetam apenas Ajudantes, Orações e outras partes da Fase 4. Presidentes, Ensino e Estudantes usam rotação linear fixa.
                    </div>
                    {showAdvanced && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                            <div>
                                <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                                    Fator Tempo (weeksFactor)
                                    <InfoTooltip text="Multiplica os dias desde a última designação. Valor maior = prioriza quem está há mais tempo sem participar. Padrão: 50" />
                                </label>
                                <input
                                    type="number"
                                    value={config.weeksFactor}
                                    onChange={e => updateConfig('weeksFactor', parseInt(e.target.value) || 50)}
                                    min={10}
                                    max={100}
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                                    Semanas de Penalização
                                    <InfoTooltip text="Participações recentes (dentro deste período) recebem penalização no score, mas NÃO são bloqueadas. Valor maior = penaliza por mais tempo. Padrão: 3 semanas" />
                                </label>
                                <input
                                    type="number"
                                    value={config.cooldownWeeks}
                                    onChange={e => updateConfig('cooldownWeeks', parseInt(e.target.value) || 3)}
                                    min={1}
                                    max={8}
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                                    Bônus Bimestral
                                    <InfoTooltip text="Pontuação extra para publicadores que não participaram nas últimas 8+ semanas. Ajuda a garantir rotatividade. Padrão: 1000 pontos" />
                                </label>
                                <input
                                    type="number"
                                    value={config.bimonthlyBonus}
                                    onChange={e => updateConfig('bimonthlyBonus', parseInt(e.target.value) || 1000)}
                                    min={100}
                                    max={5000}
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                                    Fator Peso (weightFactor)
                                    <InfoTooltip text="Influencia a pontuação base de cada categoria de parte (Ensino=1.0, Estudante=0.5, Ajudante=0.1). Valor maior = mais peso para categoria. Padrão: 5" />
                                </label>
                                <input
                                    type="number"
                                    value={config.weightFactor}
                                    onChange={e => updateConfig('weightFactor', parseInt(e.target.value) || 5)}
                                    min={1}
                                    max={20}
                                    style={inputStyle}
                                />
                            </div>
                        </div>
                    )}


                    {/* v8.3: Botão de Rebalanceamento IA */}
                    <div style={{ marginTop: '12px', borderTop: '1px solid #E5E7EB', paddingTop: '12px' }}>
                        <button
                            onClick={handleRebalance}
                            disabled={loading}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 12px',
                                background: 'linear-gradient(to right, #4F46E5, #7C3AED)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                width: '100%',
                                justifyContent: 'center'
                            }}
                        >
                            <span>🦾</span> Rebalancear Fila com IA (Justiça)
                        </button>
                        <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '4px', textAlign: 'center' }}>
                            Reorganiza a fila do robô para priorizar quem tem maior score (mais tempo sem fazer).
                        </div>
                    </div>
                </div>

                {/* Seção: Preview de Partes */}
                <div style={sectionStyle}>
                    <div style={sectionTitleStyle}>
                        <span>📋</span> Partes a Gerar
                    </div>
                    <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                        {Object.entries(partsByWeek).map(([week, weekParts]) => (
                            <div key={week} style={{ marginBottom: '8px' }}>
                                <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                                    {week} — {weekParts.length} partes
                                </div>
                                <div style={{ fontSize: '11px', color: '#6B7280', paddingLeft: '12px' }}>
                                    {weekParts.slice(0, 3).map(p => p.tipoParte).join(', ')}
                                    {weekParts.length > 3 && ` +${weekParts.length - 3} mais`}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Avisos de validação com links clicáveis */}
                    {validationWarnings.length > 0 && (
                        <div style={{ marginTop: '12px', padding: '10px 12px', background: '#FEF3C7', borderRadius: '6px', fontSize: '12px', color: '#92400E' }}>
                            <div style={{ fontWeight: '600', marginBottom: '8px' }}>
                                ⚠️ {validationWarnings.length} parte(s) com problemas:
                            </div>
                            <div style={{ maxHeight: '100px', overflowY: 'auto' }}>
                                {validationWarnings.map((w, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '4px 0',
                                            borderBottom: idx < validationWarnings.length - 1 ? '1px solid rgba(0,0,0,0.1)' : 'none'
                                        }}
                                    >
                                        <span style={{ flex: 1 }}>{w.message}</span>
                                        {onNavigateToPart && w.partId && (
                                            <button
                                                onClick={() => onNavigateToPart(w.partId!)}
                                                style={{
                                                    padding: '2px 8px',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    background: '#F59E0B',
                                                    color: 'white',
                                                    cursor: 'pointer',
                                                    fontSize: '10px',
                                                    fontWeight: '500',
                                                    marginLeft: '8px',
                                                }}
                                                title="Ver esta parte na aba Apostila"
                                            >
                                                → Ver
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Seção: Opções */}
                <div style={sectionStyle}>
                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={runAutoTuningOption}
                                onChange={e => setRunAutoTuningOption(e.target.checked)}
                                style={{ width: '16px', height: '16px' }}
                            />
                            <span style={{ fontSize: '13px', color: '#374151' }}>
                                🔄 Executar Auto-Tuning antes de gerar
                            </span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={isDryRun}
                                onChange={e => setIsDryRun(e.target.checked)}
                                style={{ width: '16px', height: '16px' }}
                            />
                            <span style={{ fontSize: '13px', color: '#374151' }}>
                                🔍 Simulação (não salvar)
                            </span>
                        </label>
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 24px',
                    borderTop: '1px solid #E5E7EB',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px',
                    background: '#F9FAFB',
                    borderRadius: '0 0 12px 12px',
                }}>
                    <button onClick={onClose} style={buttonStyle('#6B7280')}>
                        Cancelar
                    </button>
                    <button
                        onClick={() => handleGenerate(true)}
                        disabled={loading || pendingParts.length === 0}
                        style={buttonStyle('#0891B2', loading || pendingParts.length === 0)}
                    >
                        {loading && isDryRun ? '⏳ Simulando...' : '🔍 Simular'}
                    </button>
                    <button
                        onClick={() => handleGenerate(false)}
                        disabled={loading || pendingParts.length === 0}
                        style={buttonStyle('#4F46E5', loading || pendingParts.length === 0)}
                    >
                        {loading && !isDryRun ? '⏳ Gerando...' : '🎯 Gerar'}
                    </button>
                </div>
            </div>
        </div >
    );
}
