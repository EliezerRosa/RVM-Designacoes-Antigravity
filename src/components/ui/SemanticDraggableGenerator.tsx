import React, { useState, useEffect } from 'react';
import { generateSemanticRulesForWeek, saveSemanticRulesToDb } from '../../services/semanticAgentService';
import { fetchSemanticRulesForWeek, calculateSemanticScore, SemanticRule, SemanticScoreResult } from '../../services/semanticRulesService';
import type { WorkbookPart, Publisher } from '../../types';

interface Props {
    weekId: string;
    parts: WorkbookPart[];
    publishers: Publisher[];
    onPublisherSelect: (partId: string, publisherId: string, publisherName: string) => void;
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

export const SemanticDraggableGenerator: React.FC<Props> = ({ weekId, parts, publishers, onPublisherSelect }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: window.innerWidth - 450, y: 100 });
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [isExpanded, setIsExpanded] = useState(true);
    
    // State to hold the analysis for each part
    const [analyses, setAnalyses] = useState<PartAnalysis[]>([]);

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

    return (
        <div 
            style={{
                position: 'fixed',
                left: `${position.x}px`,
                top: `${position.y}px`,
                zIndex: 9999,
                width: '400px',
                maxHeight: '80vh',
                backgroundColor: '#ffffff',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
            }}
            className="border border-indigo-300 rounded-lg overflow-hidden flex flex-col"
        >
            {/* Header / Drag Handle */}
            <div 
                className="px-3 py-2 flex items-center justify-between cursor-move"
                style={{ backgroundColor: '#4f46e5', color: '#ffffff' }}
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-2">
                    <span>💡</span>
                    <span className="font-semibold text-sm tracking-wide text-white">Agente Especialista</span>
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
                <div className="flex flex-col h-full overflow-hidden" style={{ maxHeight: 'calc(80vh - 40px)' }}>
                    <div className="p-4 flex flex-col gap-3 shrink-0 border-b border-gray-100">
                        <div className="text-xs text-gray-700" style={{ color: '#374151' }}>
                            Análise Semântica via Gemini para a semana:
                            <div className="font-bold text-indigo-900 mt-1" style={{ color: '#312e81' }}>{weekId}</div>
                        </div>

                        {status === 'loading' && (
                            <div className="flex items-center gap-2 text-sm text-indigo-700 bg-indigo-50 p-2 rounded">
                                <div className="animate-spin h-4 w-4 border-2 border-indigo-500 rounded-full border-t-transparent"></div>
                                Processando IA...
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

                    {/* Scrollable Analyses */}
                    {status === 'success' && analyses.length > 0 && (
                        <div className="overflow-y-auto p-4 flex flex-col gap-4 bg-gray-50/50 flex-1">
                            {analyses.map((analysis, idx) => (
                                <div key={idx} className="bg-white border border-indigo-100 rounded-lg p-3 shadow-sm">
                                    <div className="flex items-start gap-2 mb-2">
                                        <span className="text-xl" title="Sugestão da IA">💡</span>
                                        <div>
                                            <h4 className="text-sm font-semibold text-indigo-900 leading-tight">
                                                {analysis.part.tituloParte}
                                            </h4>
                                            <p className="text-xs text-indigo-700 italic mt-1">
                                                {analysis.rule.sugestao}
                                            </p>
                                        </div>
                                    </div>

                                    {analysis.rule.texto_original && (
                                        <div className="mb-3 px-3 py-2 bg-indigo-900/5 rounded border-l-2 border-indigo-300 text-xs text-indigo-900/80 italic shadow-inner">
                                            <span className="font-semibold block mb-1">Texto da apostila:</span>
                                            "{analysis.rule.texto_original}"
                                        </div>
                                    )}

                                    {analysis.topSuggestions.length > 0 ? (
                                        <div className="mt-2 flex flex-col gap-2">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[11px] font-medium text-indigo-400 uppercase tracking-wider">Top Matches</span>
                                            </div>
                                            {analysis.topSuggestions.map(({ publisher, result }) => (
                                                <div key={publisher.id} className={`flex flex-col bg-white rounded border p-2 text-sm transition-colors ${result.isPerfectMatch ? 'border-green-300 bg-green-50/30' : 'border-indigo-50'}`}>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className="flex items-center gap-1">
                                                            <span className="font-medium text-gray-800" style={{ color: '#1f2937' }}>{publisher.name}</span>
                                                            {result.isPerfectMatch && <span title="Match Perfeito!" className="text-xs">✅</span>}
                                                        </div>
                                                        <button
                                                            onClick={() => onPublisherSelect(analysis.part.id, publisher.id, publisher.name)}
                                                            className="px-2 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded text-xs font-semibold transition-colors focus:outline-none"
                                                            style={{ color: '#4338ca', backgroundColor: '#e0e7ff' }}
                                                        >
                                                            Aceitar
                                                        </button>
                                                    </div>
                                                    
                                                    <div className="flex flex-col gap-0.5 mt-1 border-t border-gray-100 pt-1">
                                                        {result.matches.length > 0 && (
                                                            <span className="text-[10px] text-green-600 flex items-center gap-1">
                                                                <span>✓</span> Atende: {result.matches.join(', ')}
                                                            </span>
                                                        )}
                                                        {result.misses.length > 0 && (
                                                            <span className="text-[10px] text-orange-500 flex items-center gap-1">
                                                                <span>⚠️</span> Faltou: {result.misses.join(', ')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="mt-2 text-xs text-indigo-600 bg-indigo-50/50 p-2 rounded border border-indigo-50">
                                            Nenhum match forte na congregação.
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
