/**
 * ActionDiagnosticPanel — UI para o Agente de Diagnóstico de Ações do Chat-IA
 *
 * Permite executar testes de todas as 21 ações ou uma específica,
 * com visualização em tempo real dos resultados.
 * Inclui tab de Testes Visuais com captura de tela + validação Gemini Vision.
 */

import { useState } from 'react';
import { runDiagnostic, type DiagnosticReport, type ActionDiagnostic, type DiagnosticStatus } from '../../services/actionDiagnosticAgent';
import { runVisualDiagnostic, getVisualActionTypes, type VisualDiagnosticReport, type VisualTestResult } from '../../services/visualDiagnosticService';
import type { AgentActionType } from '../../services/agentActionService';

const ALL_ACTIONS: AgentActionType[] = [
    'SHOW_MODAL', 'CHECK_SCORE', 'NAVIGATE_WEEK', 'VIEW_S140', 'SHARE_S140_WHATSAPP',
    'FETCH_DATA', 'GET_ANALYTICS', 'SIMULATE_ASSIGNMENT', 'MANAGE_LOCAL_NEEDS',
    'ASSIGN_PART', 'UNDO_LAST', 'UPDATE_PUBLISHER', 'UPDATE_AVAILABILITY',
    'SEND_S140', 'SEND_S89', 'IMPORT_WORKBOOK',
    'GENERATE_WEEK', 'CLEAR_WEEK', 'UPDATE_ENGINE_RULES', 'MANAGE_SPECIAL_EVENT', 'NOTIFY_REFUSAL',
];

const STATUS_ICONS: Record<DiagnosticStatus, string> = {
    PASS: '✅',
    FAIL: '❌',
    SKIP: '⏭️',
    WARN: '⚠️',
};

const STATUS_COLORS: Record<DiagnosticStatus, string> = {
    PASS: '#10B981',
    FAIL: '#EF4444',
    SKIP: '#6B7280',
    WARN: '#F59E0B',
};

export function ActionDiagnosticPanel() {
    const [activeTab, setActiveTab] = useState<'actions' | 'visual'>('actions');
    const [selectedAction, setSelectedAction] = useState<AgentActionType | 'ALL'>('ALL');
    const [report, setReport] = useState<DiagnosticReport | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    // Visual tab state
    const [selectedVisualAction, setSelectedVisualAction] = useState<AgentActionType | 'ALL'>('ALL');
    const [visualReport, setVisualReport] = useState<VisualDiagnosticReport | null>(null);
    const [isVisualRunning, setIsVisualRunning] = useState(false);
    const [expandedVisualRow, setExpandedVisualRow] = useState<string | null>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    const visualActionTypes = getVisualActionTypes();

    const handleRun = async () => {
        setIsRunning(true);
        setReport(null);
        setExpandedRow(null);
        try {
            const result = await runDiagnostic(selectedAction);
            setReport(result);
        } catch (e) {
            console.error('[DiagnosticPanel] Erro:', e);
        } finally {
            setIsRunning(false);
        }
    };

    const handleVisualRun = async () => {
        setIsVisualRunning(true);
        setVisualReport(null);
        setExpandedVisualRow(null);
        setPreviewImage(null);
        try {
            const result = await runVisualDiagnostic(selectedVisualAction);
            setVisualReport(result);
        } catch (e) {
            console.error('[VisualDiagnostic] Erro:', e);
        } finally {
            setIsVisualRunning(false);
        }
    };

    return (
        <div style={{
            background: '#0F172A',
            borderRadius: '12px',
            padding: '20px',
            color: '#E2E8F0',
            fontFamily: 'monospace',
            maxWidth: '900px',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '24px' }}>🔬</span>
                <div>
                    <h3 style={{ margin: 0, color: '#F8FAFC', fontSize: '16px' }}>Agente de Diagnóstico — Ações do Chat-IA</h3>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94A3B8' }}>
                        Testa cada ação com dados reais. Inclui validação visual com Gemini Vision.
                    </p>
                </div>
            </div>

            {/* Tab Switcher */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: '#1E293B', borderRadius: '8px', padding: '4px' }}>
                <button
                    onClick={() => setActiveTab('actions')}
                    style={{
                        flex: 1, padding: '8px', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                        background: activeTab === 'actions' ? '#3B82F6' : 'transparent',
                        color: activeTab === 'actions' ? '#fff' : '#94A3B8',
                    }}
                >
                    🧪 Testes Funcionais (21 ações)
                </button>
                <button
                    onClick={() => setActiveTab('visual')}
                    style={{
                        flex: 1, padding: '8px', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                        background: activeTab === 'visual' ? '#8B5CF6' : 'transparent',
                        color: activeTab === 'visual' ? '#fff' : '#94A3B8',
                    }}
                >
                    👁️ Testes Visuais + Gemini Vision ({visualActionTypes.length} ações)
                </button>
            </div>

            {/* ===== TAB: Testes Funcionais ===== */}
            {activeTab === 'actions' && (<>
            {/* Controles */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
                <select
                    value={selectedAction}
                    onChange={e => setSelectedAction(e.target.value as AgentActionType | 'ALL')}
                    disabled={isRunning}
                    style={{
                        background: '#1E293B',
                        color: '#E2E8F0',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '13px',
                        flex: '1',
                        minWidth: '200px',
                    }}
                >
                    <option value="ALL">🎯 TODAS AS AÇÕES (21)</option>
                    <optgroup label="Somente leitura">
                        {ALL_ACTIONS.filter(a => ['SHOW_MODAL', 'CHECK_SCORE', 'NAVIGATE_WEEK', 'VIEW_S140', 'SHARE_S140_WHATSAPP', 'FETCH_DATA', 'GET_ANALYTICS', 'SIMULATE_ASSIGNMENT', 'MANAGE_LOCAL_NEEDS'].includes(a)).map(a => (
                            <option key={a} value={a}>{a}</option>
                        ))}
                    </optgroup>
                    <optgroup label="Com efeito (rollback)">
                        {ALL_ACTIONS.filter(a => ['ASSIGN_PART', 'UPDATE_PUBLISHER', 'UPDATE_AVAILABILITY', 'SEND_S140', 'SEND_S89', 'UNDO_LAST', 'IMPORT_WORKBOOK'].includes(a)).map(a => (
                            <option key={a} value={a}>{a}</option>
                        ))}
                    </optgroup>
                    <optgroup label="Destrutivas (skip automático)">
                        {ALL_ACTIONS.filter(a => ['GENERATE_WEEK', 'CLEAR_WEEK', 'UPDATE_ENGINE_RULES', 'MANAGE_SPECIAL_EVENT', 'NOTIFY_REFUSAL'].includes(a)).map(a => (
                            <option key={a} value={a}>⚠️ {a}</option>
                        ))}
                    </optgroup>
                </select>

                <button
                    onClick={handleRun}
                    disabled={isRunning}
                    style={{
                        background: isRunning ? '#334155' : '#3B82F6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px 20px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: isRunning ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}
                >
                    {isRunning ? (
                        <>
                            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                            Executando...
                        </>
                    ) : (
                        <>▶ Executar Diagnóstico</>
                    )}
                </button>
            </div>

            {/* Resumo */}
            {report && (
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    marginBottom: '16px',
                    flexWrap: 'wrap',
                }}>
                    <StatBadge label="Total" value={report.totalActions} color="#94A3B8" />
                    <StatBadge label="Passed" value={report.passed} color="#10B981" />
                    <StatBadge label="Failed" value={report.failed} color="#EF4444" />
                    <StatBadge label="Warned" value={report.warned} color="#F59E0B" />
                    <StatBadge label="Skipped" value={report.skipped} color="#6B7280" />
                    <StatBadge label="Tempo" value={`${report.durationMs}ms`} color="#818CF8" />
                </div>
            )}

            {/* Tabela de Resultados */}
            {report && (
                <div style={{
                    background: '#1E293B',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    overflow: 'hidden',
                }}>
                    {/* Header row */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '32px 1fr 80px 80px',
                        padding: '8px 12px',
                        background: '#0F172A',
                        fontSize: '11px',
                        fontWeight: '600',
                        color: '#64748B',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                    }}>
                        <span></span>
                        <span>Ação</span>
                        <span style={{ textAlign: 'center' }}>Status</span>
                        <span style={{ textAlign: 'right' }}>Tempo</span>
                    </div>

                    {/* Result rows */}
                    {report.results.map((r, i) => (
                        <ResultRow
                            key={r.actionType + i}
                            result={r}
                            isExpanded={expandedRow === r.actionType}
                            onToggle={() => setExpandedRow(expandedRow === r.actionType ? null : r.actionType)}
                        />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!report && !isRunning && (
                <div style={{
                    textAlign: 'center',
                    padding: '40px 20px',
                    color: '#64748B',
                    fontSize: '13px',
                }}>
                    <p style={{ fontSize: '32px', marginBottom: '8px' }}>🧪</p>
                    <p>Selecione uma ação ou "TODAS" e clique em <strong>Executar Diagnóstico</strong></p>
                    <p style={{ fontSize: '11px', marginTop: '8px' }}>
                        O agente carrega dados reais do Supabase, executa cada ação com fixtures dinâmicas
                        e reporta o resultado. Ações destrutivas são automaticamente ignoradas.
                    </p>
                </div>
            )}
            </>)}

            {/* ===== TAB: Testes Visuais + Gemini Vision ===== */}
            {activeTab === 'visual' && (<>
            {/* Controles visuais */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
                <select
                    value={selectedVisualAction}
                    onChange={e => setSelectedVisualAction(e.target.value as AgentActionType | 'ALL')}
                    disabled={isVisualRunning}
                    style={{
                        background: '#1E293B', color: '#E2E8F0', border: '1px solid #334155',
                        borderRadius: '8px', padding: '8px 12px', fontSize: '13px', flex: '1', minWidth: '200px',
                    }}
                >
                    <option value="ALL">👁️ TODAS AS AÇÕES VISUAIS ({visualActionTypes.length})</option>
                    {visualActionTypes.map(a => (
                        <option key={a} value={a}>🖼️ {a}</option>
                    ))}
                </select>
                <button
                    onClick={handleVisualRun}
                    disabled={isVisualRunning}
                    style={{
                        background: isVisualRunning ? '#334155' : '#8B5CF6', color: '#fff', border: 'none',
                        borderRadius: '8px', padding: '8px 20px', fontSize: '13px', fontWeight: '600',
                        cursor: isVisualRunning ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                    }}
                >
                    {isVisualRunning ? (
                        <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> Capturando + Analisando...</>
                    ) : (
                        <>👁️ Executar Teste Visual</>
                    )}
                </button>
            </div>

            {/* Info box */}
            <div style={{
                background: '#1E1B4B', border: '1px solid #4C1D95', borderRadius: '8px',
                padding: '10px 14px', marginBottom: '16px', fontSize: '11px', color: '#C4B5FD',
            }}>
                <strong>Como funciona:</strong> Simula comandos reais do usuário → Executa a ação → Renderiza resultado visual off-screen → Captura screenshot com html2canvas → Envia ao Gemini Vision para análise e veredito (APROVADO/REPROVADO).
            </div>

            {/* Resumo visual */}
            {visualReport && (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <StatBadge label="Total" value={visualReport.totalTests} color="#94A3B8" />
                    <StatBadge label="Aprovados" value={visualReport.passed} color="#10B981" />
                    <StatBadge label="Reprovados" value={visualReport.failed} color="#EF4444" />
                    <StatBadge label="Tempo" value={`${visualReport.durationMs}ms`} color="#A78BFA" />
                </div>
            )}

            {/* Resultados visuais */}
            {visualReport && (
                <div style={{ background: '#1E293B', borderRadius: '8px', border: '1px solid #334155', overflow: 'hidden' }}>
                    <div style={{
                        display: 'grid', gridTemplateColumns: '32px 1fr 90px 80px',
                        padding: '8px 12px', background: '#0F172A', fontSize: '11px', fontWeight: '600',
                        color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>
                        <span></span><span>Ação Visual</span>
                        <span style={{ textAlign: 'center' }}>Veredito</span>
                        <span style={{ textAlign: 'right' }}>Tempo</span>
                    </div>
                    {visualReport.results.map((r, i) => (
                        <VisualResultRow
                            key={r.actionType + i}
                            result={r}
                            isExpanded={expandedVisualRow === r.actionType}
                            onToggle={() => setExpandedVisualRow(expandedVisualRow === r.actionType ? null : r.actionType)}
                            onPreview={(img) => setPreviewImage(img)}
                        />
                    ))}
                </div>
            )}

            {/* Empty state visual */}
            {!visualReport && !isVisualRunning && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748B', fontSize: '13px' }}>
                    <p style={{ fontSize: '32px', marginBottom: '8px' }}>👁️</p>
                    <p>Testes visuais capturam screenshots e pedem ao <strong>Gemini Vision</strong> para validar</p>
                    <p style={{ fontSize: '11px', marginTop: '8px', color: '#4C1D95' }}>
                        Ações testadas: {visualActionTypes.join(', ')}
                    </p>
                </div>
            )}
            </>)}

            {/* Image Preview Modal */}
            {previewImage && (
                <div
                    onClick={() => setPreviewImage(null)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out',
                    }}
                >
                    <img
                        src={previewImage}
                        alt="Preview visual"
                        style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px', boxShadow: '0 0 40px rgba(139,92,246,0.3)' }}
                    />
                </div>
            )}

            {/* CSS for spin animation */}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

// ===== Sub-componentes =====

function StatBadge({ label, value, color }: { label: string; value: number | string; color: string }) {
    return (
        <div style={{
            background: '#1E293B',
            border: `1px solid ${color}33`,
            borderRadius: '8px',
            padding: '8px 14px',
            textAlign: 'center',
            minWidth: '80px',
        }}>
            <div style={{ fontSize: '18px', fontWeight: '700', color }}>{value}</div>
            <div style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
        </div>
    );
}

function ResultRow({ result, isExpanded, onToggle }: { result: ActionDiagnostic; isExpanded: boolean; onToggle: () => void }) {
    const icon = STATUS_ICONS[result.status];
    const color = STATUS_COLORS[result.status];

    return (
        <div style={{ borderBottom: '1px solid #1E293B' }}>
            {/* Main row */}
            <div
                onClick={onToggle}
                style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 1fr 80px 80px',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    background: isExpanded ? '#1A2332' : 'transparent',
                    transition: 'background 0.15s',
                }}
                onMouseOver={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = '#1A2332'; }}
                onMouseOut={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
                <span>{icon}</span>
                <span style={{ fontSize: '13px', fontWeight: '500' }}>
                    {result.actionType}
                    {!result.safe && <span style={{ color: '#F59E0B', fontSize: '10px', marginLeft: '6px' }}>⚡LIVE</span>}
                </span>
                <span style={{ textAlign: 'center', fontSize: '12px', color, fontWeight: '600' }}>
                    {result.status}
                </span>
                <span style={{ textAlign: 'right', fontSize: '12px', color: '#94A3B8' }}>
                    {result.durationMs > 0 ? `${result.durationMs}ms` : '—'}
                </span>
            </div>

            {/* Expandido: detalhes */}
            {isExpanded && (
                <div style={{
                    padding: '0 12px 12px 44px',
                    fontSize: '12px',
                    lineHeight: '1.6',
                }}>
                    <div style={{ color: '#CBD5E1' }}>{result.message}</div>
                    {result.details && (
                        <div style={{ color: '#64748B', marginTop: '4px' }}>📋 {result.details}</div>
                    )}
                    {result.error && (
                        <div style={{ color: '#FCA5A5', marginTop: '4px', background: '#7F1D1D22', padding: '6px 8px', borderRadius: '4px' }}>
                            🐛 {result.error}
                        </div>
                    )}
                    {result.resultData && (
                        <details style={{ marginTop: '6px' }}>
                            <summary style={{ cursor: 'pointer', color: '#818CF8', fontSize: '11px' }}>
                                📦 Dados retornados
                            </summary>
                            <pre style={{
                                background: '#0F172A',
                                padding: '8px',
                                borderRadius: '4px',
                                overflow: 'auto',
                                maxHeight: '200px',
                                fontSize: '11px',
                                color: '#94A3B8',
                                marginTop: '4px',
                            }}>
                                {JSON.stringify(result.resultData, null, 2)}
                            </pre>
                        </details>
                    )}
                </div>
            )}
        </div>
    );
}

function VisualResultRow({ result, isExpanded, onToggle, onPreview }: {
    result: VisualTestResult;
    isExpanded: boolean;
    onToggle: () => void;
    onPreview: (img: string) => void;
}) {
    const passed = result.validationPassed;
    const icon = passed ? '✅' : (result.error ? '❌' : '⚠️');
    const color = passed ? '#10B981' : (result.error ? '#EF4444' : '#F59E0B');

    return (
        <div style={{ borderBottom: '1px solid #1E293B' }}>
            <div
                onClick={onToggle}
                style={{
                    display: 'grid', gridTemplateColumns: '32px 1fr 90px 80px',
                    padding: '10px 12px', cursor: 'pointer',
                    background: isExpanded ? '#1A2332' : 'transparent', transition: 'background 0.15s',
                }}
                onMouseOver={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = '#1A2332'; }}
                onMouseOut={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
                <span>{icon}</span>
                <span style={{ fontSize: '13px', fontWeight: '500' }}>
                    {result.actionType}
                    <span style={{ color: '#64748B', fontSize: '11px', marginLeft: '8px', fontWeight: '400' }}>
                        "{result.mockCommand}"
                    </span>
                </span>
                <span style={{ textAlign: 'center', fontSize: '11px', color, fontWeight: '600' }}>
                    {passed ? 'APROVADO' : 'REPROVADO'}
                </span>
                <span style={{ textAlign: 'right', fontSize: '12px', color: '#94A3B8' }}>
                    {result.durationMs > 0 ? `${result.durationMs}ms` : '—'}
                </span>
            </div>

            {isExpanded && (
                <div style={{ padding: '0 12px 12px 44px', fontSize: '12px', lineHeight: '1.6' }}>
                    {/* Mock command bubble */}
                    <div style={{
                        background: '#1E3A5F', border: '1px solid #2563EB44', borderRadius: '8px',
                        padding: '8px 12px', marginBottom: '8px', fontSize: '12px',
                    }}>
                        <span style={{ color: '#60A5FA', fontSize: '10px', fontWeight: '600' }}>COMANDO MOCKADO:</span>
                        <div style={{ color: '#E2E8F0', marginTop: '2px' }}>💬 "{result.mockCommand}"</div>
                        <div style={{ color: '#64748B', marginTop: '2px', fontSize: '11px' }}>{result.mockDescription}</div>
                    </div>

                    {/* Screenshot preview */}
                    {result.screenshotBase64 && (
                        <div style={{ marginBottom: '8px' }}>
                            <div style={{ color: '#A78BFA', fontSize: '10px', fontWeight: '600', marginBottom: '4px' }}>SCREENSHOT CAPTURADO:</div>
                            <img
                                src={result.screenshotBase64}
                                alt={`Screenshot ${result.actionType}`}
                                onClick={(e) => { e.stopPropagation(); onPreview(result.screenshotBase64!); }}
                                style={{
                                    maxWidth: '100%', maxHeight: '200px', borderRadius: '6px',
                                    border: '1px solid #334155', cursor: 'zoom-in',
                                    transition: 'transform 0.15s', objectFit: 'contain',
                                }}
                                onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.02)')}
                                onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}
                            />
                        </div>
                    )}

                    {/* Gemini Vision analysis */}
                    {result.geminiAnalysis && (
                        <div style={{
                            background: '#0F172A', border: '1px solid #4C1D9544', borderRadius: '8px',
                            padding: '10px 12px', marginBottom: '8px',
                        }}>
                            <div style={{ color: '#A78BFA', fontSize: '10px', fontWeight: '600', marginBottom: '6px' }}>
                                🤖 ANÁLISE GEMINI VISION:
                            </div>
                            <div style={{
                                color: '#CBD5E1', fontSize: '12px', lineHeight: '1.7',
                                whiteSpace: 'pre-wrap', maxHeight: '300px', overflow: 'auto',
                            }}>
                                {result.geminiAnalysis}
                            </div>
                        </div>
                    )}

                    {/* Validation details */}
                    <div style={{ color: color, fontSize: '11px', fontWeight: '600' }}>
                        {passed ? '✅' : '❌'} {result.validationDetails}
                    </div>

                    {/* Error if any */}
                    {result.error && (
                        <div style={{ color: '#FCA5A5', marginTop: '4px', background: '#7F1D1D22', padding: '6px 8px', borderRadius: '4px', fontSize: '11px' }}>
                            🐛 {result.error}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
