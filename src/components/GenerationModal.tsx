/**
 * GenerationModal - Modal Simplificado de Geração v9.0
 * 
 * Features:
 * - Seletor de semanas para gerar
 * - Preview de partes a gerar
 * - Opção de Dry Run (simulação)
 * - Preview S140
 * 
 * REMOVIDO na v9.0:
 * - Período de análise (tuning)
 * - Métricas em tempo real
 * - Configuração do motor (TuningConfig)
 * - Auto-Tuning
 * - Botão Rebalancear IA
 */

import { useState, useEffect, useMemo } from 'react';
import type { WorkbookPart, Publisher } from '../types';
import { validatePartsBeforeGeneration, type ValidationWarning } from '../services/linearRotationService';
import { S140PreviewCarousel } from './S140PreviewCarousel';

// ===== Tipos =====

export interface GenerationConfig {
    isDryRun: boolean;
    generationWeeks?: string[];       // Semanas específicas para gerar (weekId)
    forceAllPartsInPeriod?: boolean;  // Se true, ignora status quando período definido
}

export interface GenerationResult {
    success: boolean;
    partsGenerated: number;
    warnings: string[];
    errors: string[];
    dryRun: boolean;
    generatedWeeks?: string[];
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (config: GenerationConfig) => Promise<GenerationResult>;
    parts: WorkbookPart[];
    publishers: Publisher[];
    onNavigateToPart?: (partId: string) => void;
}

// ===== Estilos =====

const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
};

const modalStyle: React.CSSProperties = {
    background: 'linear-gradient(145deg, #1e1e2e 0%, #2d2d44 100%)',
    borderRadius: '16px',
    padding: '28px',
    width: '90%',
    maxWidth: '700px',
    maxHeight: '90vh',
    overflowY: 'auto',
    color: '#e5e7eb',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
};

const sectionStyle: React.CSSProperties = {
    marginBottom: '20px',
    padding: '16px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
};

const sectionTitleStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#94a3b8',
};

const chipStyle = (selected: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    border: selected ? '2px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.2)',
    background: selected ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
    color: selected ? '#93c5fd' : '#9ca3af',
    transition: 'all 0.2s ease',
});

const buttonBaseStyle: React.CSSProperties = {
    padding: '12px 24px',
    borderRadius: '10px',
    fontWeight: 600,
    fontSize: '14px',
    cursor: 'pointer',
    border: 'none',
    transition: 'all 0.2s ease',
};

// ===== Componente =====

export function GenerationModal({ isOpen, onClose, onGenerate, parts, onNavigateToPart: _onNavigateToPart }: Props) {
    // Estado das opções
    const [isDryRun, setIsDryRun] = useState(false);

    // Estado de execução
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<GenerationResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showS140Preview, setShowS140Preview] = useState(false);

    // Estado do período de geração
    const [selectedWeeks, setSelectedWeeks] = useState<string[]>([]);

    // Validação de partes
    const [validationWarnings, setValidationWarnings] = useState<ValidationWarning[]>([]);

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

        const futureParts = parts.filter(p => parseDate(p.date) >= today && p.status !== 'CANCELADA');

        const weekMap = new Map<string, { weekId: string; weekDisplay: string; count: number; pending: number }>();
        for (const part of futureParts) {
            if (!weekMap.has(part.weekId)) {
                weekMap.set(part.weekId, {
                    weekId: part.weekId,
                    weekDisplay: part.weekDisplay,
                    count: 0,
                    pending: 0
                });
            }
            const entry = weekMap.get(part.weekId)!;
            entry.count++;
            if (part.status === 'PENDENTE' || !part.resolvedPublisherName) {
                entry.pending++;
            }
        }

        return Array.from(weekMap.values())
            .sort((a, b) => a.weekId.localeCompare(b.weekId));
    }, [parts]);

    // Partes que serão geradas
    const partsToGenerate = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const parseDate = (dateStr: string): Date => {
            if (!dateStr) return new Date(0);
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) return new Date(dateStr + 'T12:00:00');
            return new Date(dateStr);
        };

        return parts.filter(p => {
            const d = parseDate(p.date);
            if (d < today) return false;
            if (p.status === 'CONCLUIDA' || p.status === 'CANCELADA') return false;

            if (selectedWeeks.length > 0) {
                return selectedWeeks.includes(p.weekId);
            }

            return p.status === 'PENDENTE' || !p.resolvedPublisherName;
        });
    }, [parts, selectedWeeks]);

    // Validar partes ao mudar seleção
    useEffect(() => {
        const warnings = validatePartsBeforeGeneration(partsToGenerate);
        setValidationWarnings(warnings);
    }, [partsToGenerate]);

    // Toggle semana
    const toggleWeek = (weekId: string) => {
        setSelectedWeeks(prev =>
            prev.includes(weekId)
                ? prev.filter(w => w !== weekId)
                : [...prev, weekId]
        );
        setResult(null);
        setError(null);
    };

    // Selecionar todas
    const selectAllWeeks = () => {
        setSelectedWeeks(availableWeeks.map(w => w.weekId));
    };

    // Limpar seleção
    const clearWeeks = () => {
        setSelectedWeeks([]);
    };

    // Executar geração
    const handleGenerate = async () => {
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const config: GenerationConfig = {
                isDryRun,
                generationWeeks: selectedWeeks.length > 0 ? selectedWeeks : undefined,
                forceAllPartsInPeriod: selectedWeeks.length > 0,
            };

            const res = await onGenerate(config);
            setResult(res);

            if (res.success && !isDryRun) {
                // Sucesso! Mostrar resultado
            }
        } catch (e: any) {
            setError(e.message || 'Erro desconhecido');
        } finally {
            setLoading(false);
        }
    };

    // Reset ao fechar
    const handleClose = () => {
        setResult(null);
        setError(null);
        setLoading(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div style={overlayStyle} onClick={handleClose}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>
                        🎯 Gerar Designações
                    </h2>
                    <button
                        onClick={handleClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#9ca3af',
                            fontSize: '24px',
                            cursor: 'pointer',
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Seção: Período de Geração */}
                <div style={sectionStyle}>
                    <div style={sectionTitleStyle}>
                        <span>📅</span> Semanas para Gerar
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        <button
                            onClick={selectAllWeeks}
                            style={{ ...buttonBaseStyle, background: '#3b82f6', color: 'white', padding: '8px 16px', fontSize: '12px' }}
                        >
                            Todas
                        </button>
                        <button
                            onClick={clearWeeks}
                            style={{ ...buttonBaseStyle, background: '#374151', color: '#9ca3af', padding: '8px 16px', fontSize: '12px' }}
                        >
                            Limpar
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {availableWeeks.map(week => (
                            <div
                                key={week.weekId}
                                onClick={() => toggleWeek(week.weekId)}
                                style={chipStyle(selectedWeeks.includes(week.weekId))}
                            >
                                {week.weekDisplay}
                                {week.pending > 0 && (
                                    <span style={{ marginLeft: '6px', opacity: 0.7 }}>
                                        ({week.pending})
                                    </span>
                                )}
                            </div>
                        ))}
                        {availableWeeks.length === 0 && (
                            <span style={{ color: '#6b7280', fontStyle: 'italic' }}>
                                Nenhuma semana futura disponível
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '12px' }}>
                        {selectedWeeks.length === 0
                            ? '💡 Nenhuma semana selecionada = apenas partes PENDENTES ou sem publicador'
                            : `✅ ${selectedWeeks.length} semana(s) selecionada(s) = TODAS as partes dessas semanas`}
                    </div>
                </div>

                {/* Preview de Partes */}
                <div style={sectionStyle}>
                    <div style={sectionTitleStyle}>
                        <span>👁️</span> Preview ({partsToGenerate.length} partes)
                    </div>
                    {validationWarnings.length > 0 && (
                        <div style={{ marginBottom: '12px', padding: '8px', background: 'rgba(251, 191, 36, 0.1)', borderRadius: '8px', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
                            <div style={{ color: '#fbbf24', fontWeight: 600, fontSize: '12px', marginBottom: '4px' }}>
                                ⚠️ {validationWarnings.length} aviso(s)
                            </div>
                            {validationWarnings.slice(0, 3).map((w, i) => (
                                <div key={i} style={{ fontSize: '11px', color: '#fcd34d' }}>
                                    • {w.message}
                                </div>
                            ))}
                            {validationWarnings.length > 3 && (
                                <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                                    ... e mais {validationWarnings.length - 3}
                                </div>
                            )}
                        </div>
                    )}
                    <div style={{ maxHeight: '150px', overflowY: 'auto', fontSize: '12px' }}>
                        {partsToGenerate.length === 0 ? (
                            <span style={{ color: '#6b7280', fontStyle: 'italic' }}>
                                Nenhuma parte para gerar
                            </span>
                        ) : (
                            partsToGenerate.slice(0, 10).map(p => (
                                <div key={p.id} style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span style={{ color: '#9ca3af' }}>{p.weekDisplay}</span>
                                    {' → '}
                                    <span>{p.tituloParte || p.tipoParte}</span>
                                    {' '}
                                    <span style={{ color: p.status === 'PENDENTE' ? '#f87171' : '#4ade80' }}>
                                        ({p.status})
                                    </span>
                                </div>
                            ))
                        )}
                        {partsToGenerate.length > 10 && (
                            <div style={{ color: '#6b7280', padding: '4px 0' }}>
                                ... e mais {partsToGenerate.length - 10} partes
                            </div>
                        )}
                    </div>
                </div>

                {/* Opções */}
                <div style={sectionStyle}>
                    <div style={sectionTitleStyle}>
                        <span>⚙️</span> Opções
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={isDryRun}
                            onChange={e => setIsDryRun(e.target.checked)}
                        />
                        <span>Simulação (não salvar - apenas ver resultado)</span>
                    </label>
                </div>

                {/* Resultado */}
                {result && (
                    <div style={{
                        ...sectionStyle,
                        background: result.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${result.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                    }}>
                        <div style={{ fontWeight: 600, marginBottom: '8px', color: result.success ? '#4ade80' : '#f87171' }}>
                            {result.success ? '✅ Sucesso!' : '❌ Erro'}
                            {result.dryRun && ' (Simulação)'}
                        </div>
                        <div style={{ fontSize: '13px' }}>
                            {result.partsGenerated} partes geradas
                        </div>
                        {result.warnings.length > 0 && (
                            <div style={{ marginTop: '8px', fontSize: '12px', color: '#fbbf24' }}>
                                ⚠️ {result.warnings.length} aviso(s)
                            </div>
                        )}
                        {result.success && !result.dryRun && (
                            <button
                                onClick={() => setShowS140Preview(true)}
                                style={{ ...buttonBaseStyle, marginTop: '12px', background: '#8b5cf6', color: 'white' }}
                            >
                                📄 Ver S-140
                            </button>
                        )}
                    </div>
                )}

                {/* Erro */}
                {error && (
                    <div style={{ ...sectionStyle, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                        <div style={{ color: '#f87171' }}>❌ {error}</div>
                    </div>
                )}

                {/* Botões */}
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                    <button
                        onClick={handleClose}
                        style={{ ...buttonBaseStyle, background: '#374151', color: '#9ca3af' }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => { setIsDryRun(true); handleGenerate(); }}
                        disabled={loading || partsToGenerate.length === 0}
                        style={{
                            ...buttonBaseStyle,
                            background: '#6366f1',
                            color: 'white',
                            opacity: loading || partsToGenerate.length === 0 ? 0.5 : 1,
                        }}
                    >
                        🔍 Simular
                    </button>
                    <button
                        onClick={() => { setIsDryRun(false); handleGenerate(); }}
                        disabled={loading || partsToGenerate.length === 0}
                        style={{
                            ...buttonBaseStyle,
                            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                            color: 'white',
                            opacity: loading || partsToGenerate.length === 0 ? 0.5 : 1,
                        }}
                    >
                        {loading ? '⏳ Gerando...' : '🚀 Gerar'}
                    </button>
                </div>
            </div>

            {/* S140 Preview Modal */}
            {showS140Preview && result?.generatedWeeks && (() => {
                // Transform parts into weekParts format expected by S140PreviewCarousel
                const weekParts: Record<string, typeof parts> = {};
                const weekOrder = result.generatedWeeks;

                for (const weekId of weekOrder) {
                    weekParts[weekId] = parts.filter(p => p.weekId === weekId);
                }

                return (
                    <S140PreviewCarousel
                        weekParts={weekParts}
                        weekOrder={weekOrder}
                        onWeekChange={() => { }}
                    />
                );
            })()}
        </div>
    );
}
