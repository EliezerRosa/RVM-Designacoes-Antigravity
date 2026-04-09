/**
 * ActionDiagnosticPanel — UI para o Agente de Diagnóstico de Ações do Chat-IA
 *
 * Permite executar testes de todas as 21 ações ou uma específica,
 * com visualização em tempo real dos resultados.
 */

import { useState } from 'react';
import { runDiagnostic, type DiagnosticReport, type ActionDiagnostic, type DiagnosticStatus } from '../../services/actionDiagnosticAgent';
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
    const [selectedAction, setSelectedAction] = useState<AgentActionType | 'ALL'>('ALL');
    const [report, setReport] = useState<DiagnosticReport | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

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
                        Testa cada ação com dados reais do banco. Ações destrutivas são automaticamente ignoradas.
                    </p>
                </div>
            </div>

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
