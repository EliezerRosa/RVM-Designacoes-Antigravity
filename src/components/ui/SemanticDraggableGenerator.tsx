import React, { useState, useEffect } from 'react';
import { generateSemanticRulesForWeek, saveSemanticRulesToDb } from '../../services/semanticAgentService';
import { fetchSemanticRulesForWeek, calculateSemanticScore, SemanticRule, SemanticScoreResult } from '../../services/semanticRulesService';
import type { WorkbookPart, Publisher } from '../../types';

interface Props {
    weekId: string;
    parts: WorkbookPart[];
    publishers: Publisher[];
    onPublisherSelect: (partId: string, publisherId: string, publisherName: string) => void;
    focusedPartId?: string | null;
}

interface RankedSuggestion {
    publisher: Publisher;
    result: SemanticScoreResult;
}

interface PartAnalysis {
    part: WorkbookPart;
    rule: SemanticRule;
    topSuggestions: RankedSuggestion[];
}

export const SemanticDraggableGenerator: React.FC<Props> = ({ weekId, parts, publishers, onPublisherSelect, focusedPartId }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: window.innerWidth - 450, y: 100 });
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [isExpanded, setIsExpanded] = useState(true);
    
    const [analyses, setAnalyses] = useState<PartAnalysis[]>([]);
    const [activePartId, setActivePartId] = useState<string | null>(null);

    useEffect(() => {
        if (focusedPartId) {
            setActivePartId(focusedPartId);
            setIsExpanded(true);
        }
    }, [focusedPartId]);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };

    const handleMouseUp = () => setIsDragging(false);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const runAnalysis = (rulesData: any) => {
        const weekKey = `semana_${weekId}`;
        const weekRules = rulesData[weekKey];
        if (!weekRules) return;

        const newAnalyses: PartAnalysis[] = [];

        parts.forEach(part => {
            let rule: SemanticRule | null = null;
            for (const [key, r] of Object.entries(weekRules)) {
                if (part.tituloParte.includes(key) || key.includes(part.tituloParte)) {
                    rule = r as SemanticRule;
                    break;
                }
            }

            if (rule) {
                const ranked: RankedSuggestion[] = publishers.map(pub => ({
                    publisher: pub,
                    result: calculateSemanticScore(pub, rule as SemanticRule, publishers)
                }));

                const topSuggestions = ranked
                    .filter(r => r.result.score > 0)
                    .sort((a, b) => b.result.score - a.result.score)
                    .slice(0, 3);

                newAnalyses.push({ part, rule, topSuggestions });
            }
        });

        setAnalyses(newAnalyses);
        if (newAnalyses.length > 0 && !activePartId && !focusedPartId) {
            setActivePartId(newAnalyses[0].part.id);
        }
    };

    const handleGenerate = async () => {
        if (!weekId) {
            setStatus('error');
            setMessage('Nenhuma semana selecionada.');
            return;
        }

        setStatus('loading');
        setMessage('Lendo partes da apostila e acionando IA...');
        
        try {
            const yamlContent = await generateSemanticRulesForWeek(weekId, parts);
            await saveSemanticRulesToDb(weekId, yamlContent);
            setStatus('success');
            setMessage('Regras Semânticas geradas e ativas para esta semana!');
            const rules = await fetchSemanticRulesForWeek(weekId);
            runAnalysis(rules);
        } catch (err: any) {
            setStatus('error');
            setMessage(`Falha: ${err.message || String(err)}`);
        }
    };

    useEffect(() => {
        let isMounted = true;
        setAnalyses([]);
        setActivePartId(null);
        
        async function checkAndGenerate() {
            if (!weekId) return;
            const rules = await fetchSemanticRulesForWeek(weekId);
            const weekKey = `semana_${weekId}`;
            const hasRules = !!rules[weekKey];
            
            if (!hasRules && isMounted) {
                handleGenerate();
            } else if (hasRules && isMounted) {
                setStatus('success');
                setMessage('Regras Semânticas ativas para esta semana.');
                runAnalysis(rules);
            }
        }
        
        checkAndGenerate();
        return () => { isMounted = false; };
    }, [weekId, parts, publishers]);

    if (!weekId) return null;

    const RuleBadge = ({ label, value, colorClass, bgColor }: { label: string, value: string, colorClass: string, bgColor: string }) => (
        <span style={{ 
            display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px',
            fontSize: '10px', fontWeight: '500', backgroundColor: bgColor, color: colorClass, border: `1px solid ${colorClass}40` 
        }}>
            <span style={{ opacity: 0.75 }}>{label}:</span> {value}
        </span>
    );

    return (
        <div 
            style={{
                position: 'fixed',
                left: `${position.x}px`,
                top: `${position.y}px`,
                zIndex: 9999,
                width: '420px',
                maxHeight: '85vh',
                backgroundColor: '#ffffff',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
                borderRadius: '8px',
                border: '1px solid #a5b4fc',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                fontFamily: 'system-ui, -apple-system, sans-serif'
            }}
        >
            {/* Header / Drag Handle */}
            <div 
                style={{ 
                    padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'move', backgroundColor: '#4f46e5', color: '#ffffff' 
                }}
                onMouseDown={handleMouseDown}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>🧠</span>
                    <span style={{ fontWeight: '600', fontSize: '14px', letterSpacing: '0.025em' }}>Agente Curador IA</span>
                </div>
                <button 
                    onClick={() => setIsExpanded(!isExpanded)}
                    style={{ 
                        color: '#ffffff', background: 'transparent', border: 'none', cursor: 'pointer',
                        padding: '4px', fontSize: '14px' 
                    }}
                    title={isExpanded ? 'Minimizar' : 'Expandir'}
                >
                    {isExpanded ? '▼' : '▲'}
                </button>
            </div>

            {/* Body */}
            {isExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: 'calc(85vh - 40px)', overflow: 'hidden' }}>
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '12px', color: '#374151' }}>Análise Ativa para a semana:</div>
                        </div>
                        <div style={{ fontWeight: '700', color: '#312e81', fontSize: '16px' }}>{weekId}</div>

                        {status === 'loading' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#4338ca', backgroundColor: '#eef2ff', padding: '8px', borderRadius: '4px' }}>
                                Processando IA...
                            </div>
                        )}

                        {status === 'error' && (
                            <div style={{ fontSize: '12px', padding: '12px', borderRadius: '6px', border: '1px solid #fca5a5', backgroundColor: '#fef2f2', color: '#991b1b', wordBreak: 'break-word' }}>
                                {message}
                                <button
                                    onClick={handleGenerate}
                                    style={{ marginTop: '8px', width: '100%', padding: '6px', backgroundColor: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '4px', fontWeight: '600', cursor: 'pointer' }}
                                >
                                    Tentar Novamente
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Scrollable Accordion Analyses */}
                    {status === 'success' && analyses.length > 0 && (
                        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', flex: 1, backgroundColor: '#f9fafb', paddingBottom: '8px' }}>
                            {analyses.map((analysis, idx) => {
                                const isOpen = activePartId === analysis.part.id;
                                
                                return (
                                    <div key={idx} style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: '#ffffff' }}>
                                        {/* Accordion Header */}
                                        <button 
                                            onClick={() => setActivePartId(isOpen ? null : analysis.part.id)}
                                            style={{ 
                                                width: '100%', textAlign: 'left', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                backgroundColor: isOpen ? '#f5f7ff' : '#ffffff', border: 'none', cursor: 'pointer'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '16px' }}>{isOpen ? '📖' : '📘'}</span>
                                                <h4 style={{ fontSize: '14px', fontWeight: '600', color: isOpen ? '#312e81' : '#4b5563', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '280px' }}>
                                                    {analysis.part.tituloParte}
                                                </h4>
                                            </div>
                                            <span style={{ fontSize: '12px', color: '#9ca3af' }}>{isOpen ? '▼' : '►'}</span>
                                        </button>

                                        {/* Accordion Body */}
                                        {isOpen && (
                                            <div style={{ padding: '8px 16px 16px', borderTop: '1px solid #e0e7ff', backgroundColor: '#ffffff' }}>
                                                {/* Regras e Critérios */}
                                                <div style={{ marginBottom: '16px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                                                        <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4338ca' }}>🎯 Critérios da IA</span>
                                                    </div>
                                                    
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                                        {analysis.rule.demografia_alvo && <RuleBadge label="Alvo" value={analysis.rule.demografia_alvo} colorClass="#047857" bgColor="#d1fae5" />}
                                                        {analysis.rule.perfil_familiar && <RuleBadge label="Perfil" value={analysis.rule.perfil_familiar} colorClass="#b45309" bgColor="#fef3c7" />}
                                                        {analysis.rule.emocional && <RuleBadge label="Tom" value={analysis.rule.emocional} colorClass="#6d28d9" bgColor="#ede9fe" />}
                                                        {analysis.rule.foco && <RuleBadge label="Foco" value={analysis.rule.foco} colorClass="#1d4ed8" bgColor="#dbeafe" />}
                                                        {analysis.rule.criterio_exato && <RuleBadge label="Exato" value={analysis.rule.criterio_exato} colorClass="#be123c" bgColor="#ffe4e6" />}
                                                    </div>

                                                    <p style={{ fontSize: '12px', marginTop: '8px', padding: '8px', borderRadius: '4px', color: '#374151', backgroundColor: '#f9fafb', borderLeft: '2px solid #6366f1', margin: '8px 0 0 0' }}>
                                                        <span style={{ fontWeight: '600', color: '#312e81' }}>Estratégia: </span> 
                                                        {analysis.rule.sugestao}
                                                    </p>
                                                    
                                                    {analysis.rule.texto_original && (
                                                        <p style={{ fontSize: '10px', marginTop: '8px', fontStyle: 'italic', color: '#6b7280', margin: '8px 0 0 0' }}>
                                                            <span style={{ fontWeight: '600' }}>Contexto:</span> "{analysis.rule.texto_original}"
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Top Matches */}
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid #e5e7eb' }}>
                                                        <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#059669' }}>🏆 Melhores Escolhas</span>
                                                    </div>
                                                    {analysis.topSuggestions.length > 0 ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                            {analysis.topSuggestions.map(({ publisher, result }) => (
                                                                <div key={publisher.id} style={{ display: 'flex', flexDirection: 'column', borderRadius: '6px', border: `1px solid ${result.isPerfectMatch ? '#6ee7b7' : '#e5e7eb'}`, padding: '8px', backgroundColor: result.isPerfectMatch ? '#f0fdf4' : '#ffffff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            <span style={{ fontWeight: '500', color: '#1f2937', fontSize: '14px' }}>{publisher.name}</span>
                                                                            {result.isPerfectMatch && <span title="Match Perfeito!" style={{ fontSize: '12px' }}>✅</span>}
                                                                        </div>
                                                                        <button
                                                                            onClick={() => onPublisherSelect(analysis.part.id, publisher.id, publisher.name)}
                                                                            style={{ padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', color: '#ffffff', backgroundColor: '#4f46e5', border: 'none', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}
                                                                        >
                                                                            Designar
                                                                        </button>
                                                                    </div>
                                                                    
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed #e5e7eb' }}>
                                                                        {result.matches.length > 0 && (
                                                                            <span style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', color: '#059669' }}>
                                                                                <span>✓</span> {result.matches.join(', ')}
                                                                            </span>
                                                                        )}
                                                                        {result.misses.length > 0 && (
                                                                            <span style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', color: '#ea580c' }}>
                                                                                <span>⚠️</span> {result.misses.join(', ')}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div style={{ marginTop: '8px', fontSize: '12px', padding: '8px', borderRadius: '4px', border: '1px solid #e5e7eb', textAlign: 'center', color: '#4b5563', backgroundColor: '#f9fafb' }}>
                                                            Nenhum publicador atende fortemente a estes critérios.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
