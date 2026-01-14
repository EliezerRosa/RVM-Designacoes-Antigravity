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

import { useState, useEffect, useCallback } from 'react';
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

// ===== Tipos =====

export interface GenerationConfig {
    period: AnalysisPeriod;
    tuningConfig: TuningConfig;
    runAutoTuning: boolean;
    isDryRun: boolean;
}

export interface GenerationResult {
    success: boolean;
    partsGenerated: number;
    warnings: string[];
    errors: string[];
    dryRun: boolean;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (config: GenerationConfig) => Promise<GenerationResult>;
    parts: WorkbookPart[];
    publishers: Publisher[];
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

// ===== Componente =====

export function GenerationModal({ isOpen, onClose, onGenerate, parts, publishers }: Props) {
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

    // Partes pendentes (filtradas)
    const pendingParts = parts.filter(p =>
        (p.funcao === 'Titular' || p.funcao === 'Ajudante') &&
        p.status !== 'DESIGNADA' &&
        p.status !== 'CONCLUIDA' &&
        p.status !== 'CANCELADA'
    );

    // Agrupar por semana para preview
    const partsByWeek = pendingParts.reduce((acc, part) => {
        const week = part.weekDisplay || part.weekId;
        if (!acc[week]) acc[week] = [];
        acc[week].push(part);
        return acc;
    }, {} as Record<string, WorkbookPart[]>);

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
    const handleGenerate = async () => {
        if (!period) return;

        try {
            setLoading(true);
            setError(null);

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
                isDryRun,
            };

            const genResult = await onGenerate(genConfig);
            setResult(genResult);

            if (genResult.success && !genResult.dryRun) {
                // Fechar modal após sucesso (não dry-run)
                setTimeout(() => onClose(), 2000);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro na geração');
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
                                <div style={{ fontSize: '11px', color: '#6B7280' }}>Participações</div>
                            </div>
                            <div style={cardStyle}>
                                <div style={{ fontSize: '20px', fontWeight: '700', color: '#059669' }}>
                                    {metrics.activePublishers}
                                </div>
                                <div style={{ fontSize: '11px', color: '#6B7280' }}>Publicadores Ativos</div>
                            </div>
                            <div style={cardStyle}>
                                <div style={{ fontSize: '20px', fontWeight: '700', color: metrics.distributionStdDev > 2 ? '#DC2626' : '#059669' }}>
                                    {metrics.distributionStdDev.toFixed(1)}
                                </div>
                                <div style={{ fontSize: '11px', color: '#6B7280' }}>Desvio Padrão</div>
                            </div>
                            <div style={cardStyle}>
                                <div style={{ fontSize: '20px', fontWeight: '700', color: metrics.idlePublishers > 0 ? '#F59E0B' : '#059669' }}>
                                    {metrics.idlePublishers}
                                </div>
                                <div style={{ fontSize: '11px', color: '#6B7280' }}>Ociosos</div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ ...cardStyle, textAlign: 'center', color: '#6B7280' }}>
                            Carregando métricas...
                        </div>
                    )}
                </div>

                {/* Seção: Configuração do Motor */}
                <div style={sectionStyle}>
                    <div style={{ ...sectionTitleStyle, cursor: 'pointer' }} onClick={() => setShowAdvanced(!showAdvanced)}>
                        <span>🎛️</span> Configuração do Motor
                        <span style={{ fontSize: '12px', color: '#6B7280', marginLeft: 'auto' }}>
                            {showAdvanced ? '▲ Ocultar' : '▼ Mostrar'}
                        </span>
                    </div>
                    {showAdvanced && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                            <div>
                                <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                                    Fator Tempo (weeksFactor)
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
                                    Semanas de Cooldown
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

                    {/* Avisos de validação */}
                    {validationWarnings.length > 0 && (
                        <div style={{ marginTop: '12px', padding: '8px 12px', background: '#FEF3C7', borderRadius: '6px', fontSize: '12px', color: '#92400E' }}>
                            ⚠️ {validationWarnings.length} parte(s) sem duração definida
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
                        onClick={() => { setIsDryRun(true); handleGenerate(); }}
                        disabled={loading || pendingParts.length === 0}
                        style={buttonStyle('#0891B2', loading || pendingParts.length === 0)}
                    >
                        🔍 Simular
                    </button>
                    <button
                        onClick={() => { setIsDryRun(false); handleGenerate(); }}
                        disabled={loading || pendingParts.length === 0}
                        style={buttonStyle('#4F46E5', loading || pendingParts.length === 0)}
                    >
                        {loading ? '⏳ Gerando...' : '🎯 Gerar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
