import React, { useState, useEffect, useRef } from 'react';
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
    
    // State to hold the analysis for each part
    const [analyses, setAnalyses] = useState<PartAnalysis[]>([]);
    
    // Controls which accordion section is open
    const [activePartId, setActivePartId] = useState<string | null>(null);

    // Auto-expand when a part is focused in the table
    useEffect(() => {
        if (focusedPartId) {
            setActivePartId(focusedPartId);
            setIsExpanded(true); // Ensure sidecar is open
        }
    }, [focusedPartId]);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        });
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

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
            // Find rule by part title
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
                    result: calculateSemanticScore(pub, rule as SemanticRule)
                }));

                const topSuggestions = ranked
                    .filter(r => r.result.score > 0)
                    .sort((a, b) => b.result.score - a.result.score)
                    .slice(0, 3);

                newAnalyses.push({ part, rule, topSuggestions });
            }
        });

        setAnalyses(newAnalyses);
        
        // Se houver análises, abra a primeira por padrão caso nenhuma esteja selecionada
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
            
            // Re-fetch to parse correctly and run analysis
            const rules = await fetchSemanticRulesForWeek(weekId);
            runAnalysis(rules);
            
        } catch (err: any) {
            setStatus('error');
            setMessage(`Falha: ${err.message || String(err)}`);
        }
    };

    // Disparo automático ao mudar de semana
    useEffect(() => {
        let isMounted = true;
        setAnalyses([]);
        setActivePartId(null);
        
        async function checkAndGenerate() {
            if (!weekId) return;
            
            // Verifica se a semana já tem regras
            const rules = await fetchSemanticRulesForWeek(weekId);
            const weekKey = `semana_${weekId}`;
            const hasRules = !!rules[weekKey];
            
            if (!hasRules && isMounted) {
                // Se não tem, dispara a geração automática
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

    // Componente interno para renderizar tags com cor
    const RuleBadge = ({ label, value, colorClass, bgColor }: { label: string, value: string, colorClass: string, bgColor: string }) => (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border" style={{ backgroundColor: bgColor, color: colorClass, borderColor: `${bgColor}darken` }}>
            <span className="opacity-75">{label}:</span> {value}
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
            }}
            className="border border-indigo-300 rounded-lg overflow-hidden flex flex-col transition-all duration-300"
        >
            {/* Header / Drag Handle */}
            <div 
                className="px-3 py-2 flex items-center justify-between cursor-move"
                style={{ backgroundColor: '#4f46e5', color: '#ffffff' }}
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-2">
                    <span>🧠</span>
                    <span className="font-semibold text-sm tracking-wide text-white">Agente Curador IA</span>
                </div>
                <button 
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-white hover:text-indigo-200 focus:outline-none"
                    style={{ color: '#ffffff' }}
                    title={isExpanded ? 'Minimizar' : 'Expandir'}
                >
                    {isExpanded ? '▼' : '▲'}
                </button>
            </div>

            {/* Body */}
            {isExpanded && (
                <div className="flex flex-col h-full overflow-hidden" style={{ maxHeight: 'calc(85vh - 40px)' }}>
                    <div className="p-4 flex flex-col gap-2 shrink-0 border-b border-gray-100">
                        <div className="flex justify-between items-center">
                            <div className="text-xs text-gray-700" style={{ color: '#374151' }}>
                                Análise Ativa para a semana:
                            </div>
                        </div>
                        <div className="font-bold text-indigo-900" style={{ color: '#312e81' }}>{weekId}</div>

                        {status === 'loading' && (
                            <div className="flex items-center gap-2 text-sm text-indigo-700 bg-indigo-50 p-2 rounded">
                                <div className="animate-spin h-4 w-4 border-2 border-indigo-500 rounded-full border-t-transparent"></div>
                                Extraindo regras e critérios da apostila...
                            </div>
                        )}

                        {status === 'error' && (
                            <div className="text-xs p-3 rounded-md border shadow-sm leading-relaxed bg-red-50 text-red-800 border-red-300" style={{ wordBreak: 'break-word' }}>
                                {message}
                                <button
                                    onClick={handleGenerate}
                                    className="mt-2 w-full py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded font-semibold transition-colors"
                                >
                                    Tentar Novamente
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Scrollable Accordion Analyses */}
                    {status === 'success' && analyses.length > 0 && (
                        <div className="overflow-y-auto flex flex-col flex-1 bg-gray-50/50 pb-2">
                            {analyses.map((analysis, idx) => {
                                const isOpen = activePartId === analysis.part.id;
                                
                                return (
                                    <div key={idx} className="border-b border-gray-200 bg-white">
                                        {/* Accordion Header */}
                                        <button 
                                            onClick={() => setActivePartId(isOpen ? null : analysis.part.id)}
                                            className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors focus:outline-none ${isOpen ? 'bg-indigo-50/50' : 'hover:bg-gray-50'}`}
                                            style={{ backgroundColor: isOpen ? '#f5f7ff' : '#ffffff' }}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span style={{ fontSize: '16px' }}>{isOpen ? '📖' : '📘'}</span>
                                                <h4 className="text-sm font-semibold leading-tight truncate max-w-[280px]" style={{ color: isOpen ? '#312e81' : '#4b5563' }}>
                                                    {analysis.part.tituloParte}
                                                </h4>
                                            </div>
                                            <span className="text-xs" style={{ color: '#9ca3af' }}>{isOpen ? '▼' : '▶'}</span>
                                        </button>

                                        {/* Accordion Body */}
                                        {isOpen && (
                                            <div className="p-4 pt-2 border-t border-indigo-100/50" style={{ backgroundColor: '#ffffff' }}>
                                                {/* Regras e Critérios */}
                                                <div className="mb-4">
                                                    <div className="flex items-center gap-1 mb-2">
                                                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#4338ca' }}>🎯 Critérios da IA</span>
                                                    </div>
                                                    
                                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                                        {analysis.rule.demografia_alvo && <RuleBadge label="Alvo" value={analysis.rule.demografia_alvo} colorClass="#047857" bgColor="#d1fae5" />}
                                                        {analysis.rule.perfil_familiar && <RuleBadge label="Perfil" value={analysis.rule.perfil_familiar} colorClass="#b45309" bgColor="#fef3c7" />}
                                                        {analysis.rule.emocional && <RuleBadge label="Tom" value={analysis.rule.emocional} colorClass="#6d28d9" bgColor="#ede9fe" />}
                                                        {analysis.rule.foco && <RuleBadge label="Foco" value={analysis.rule.foco} colorClass="#1d4ed8" bgColor="#dbeafe" />}
                                                        {analysis.rule.criterio_exato && <RuleBadge label="Exato" value={analysis.rule.criterio_exato} colorClass="#be123c" bgColor="#ffe4e6" />}
                                                    </div>

                                                    <p className="text-xs mt-2 p-2 rounded" style={{ color: '#374151', backgroundColor: '#f9fafb', borderLeft: '2px solid #6366f1' }}>
                                                        <span className="font-semibold" style={{ color: '#312e81' }}>Estratégia: </span> 
                                                        {analysis.rule.sugestao}
                                                    </p>
                                                    
                                                    {analysis.rule.texto_original && (
                                                        <p className="text-[10px] mt-2 italic" style={{ color: '#6b7280' }}>
                                                            <span className="font-semibold">Contexto:</span> "{analysis.rule.texto_original}"
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Top Matches */}
                                                <div>
                                                    <div className="flex items-center justify-between mb-2 pb-1 border-b" style={{ borderColor: '#e5e7eb' }}>
                                                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#059669' }}>🏆 Melhores Escolhas</span>
                                                    </div>
                                                    {analysis.topSuggestions.length > 0 ? (
                                                        <div className="flex flex-col gap-2">
                                                            {analysis.topSuggestions.map(({ publisher, result }) => (
                                                                <div key={publisher.id} className="flex flex-col rounded-md border p-2 text-sm transition-all" style={{ backgroundColor: result.isPerfectMatch ? '#f0fdf4' : '#ffffff', borderColor: result.isPerfectMatch ? '#6ee7b7' : '#e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                                                    <div className="flex items-center justify-between mb-1">
                                                                        <div className="flex items-center gap-1">
                                                                            <span className="font-medium" style={{ color: '#1f2937' }}>{publisher.name}</span>
                                                                            {result.isPerfectMatch && <span title="Match Perfeito!" className="text-xs">✅</span>}
                                                                        </div>
                                                                        <button
                                                                            onClick={() => onPublisherSelect(analysis.part.id, publisher.id, publisher.name)}
                                                                            className="px-3 py-1 rounded text-[11px] font-bold transition-colors focus:outline-none hover:opacity-90"
                                                                            style={{ color: '#ffffff', backgroundColor: '#4f46e5', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}
                                                                        >
                                                                            Designar
                                                                        </button>
                                                                    </div>
                                                                    
                                                                    <div className="flex flex-col gap-0.5 mt-1 pt-1" style={{ borderTop: '1px dashed #e5e7eb' }}>
                                                                        {result.matches.length > 0 && (
                                                                            <span className="text-[10px] flex items-center gap-1" style={{ color: '#059669' }}>
                                                                                <span>✓</span> {result.matches.join(', ')}
                                                                            </span>
                                                                        )}
                                                                        {result.misses.length > 0 && (
                                                                            <span className="text-[10px] flex items-center gap-1" style={{ color: '#ea580c' }}>
                                                                                <span>⚠️</span> {result.misses.join(', ')}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="mt-2 text-xs p-2 rounded border text-center" style={{ color: '#4b5563', backgroundColor: '#f9fafb', borderColor: '#e5e7eb' }}>
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
