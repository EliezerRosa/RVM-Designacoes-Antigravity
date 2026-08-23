import React, { useState, useRef, useEffect } from 'react';
import { generateSemanticRulesForWeek, saveSemanticRulesToDb } from '../../services/semanticAgentService';
import { fetchSemanticRulesForWeek } from '../../services/semanticRulesService';
import type { WorkbookPart } from '../../types';

interface Props {
    weekId: string;
    parts: WorkbookPart[];
}

export const SemanticDraggableGenerator: React.FC<Props> = ({ weekId, parts }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: window.innerWidth - 350, y: 100 });
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [isExpanded, setIsExpanded] = useState(true);

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
            
            setMessage('YAML gerado! Salvando no banco de dados...');
            await saveSemanticRulesToDb(weekId, yamlContent);

            setStatus('success');
            setMessage('Regras Semânticas geradas e ativas para esta semana!');
            
        } catch (err: any) {
            setStatus('error');
            setMessage(`Falha: ${err.message || String(err)}`);
        }
    };

    // Disparo automático ao mudar de semana
    useEffect(() => {
        let isMounted = true;
        
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
                setMessage('Regras Semânticas já estão ativas para esta semana.');
            }
        }
        
        checkAndGenerate();
        
        return () => { isMounted = false; };
    }, [weekId]);

    if (!weekId) return null;

    return (
        <div 
            style={{
                position: 'fixed',
                left: `${position.x}px`,
                top: `${position.y}px`,
                zIndex: 9999,
                width: '320px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}
            className="bg-white border border-indigo-200 rounded-lg overflow-hidden flex flex-col"
        >
            {/* Header / Drag Handle */}
            <div 
                className="bg-indigo-600 text-white px-3 py-2 flex items-center justify-between cursor-move"
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-2">
                    <span>💡</span>
                    <span className="font-semibold text-sm tracking-wide">Agente Especialista</span>
                </div>
                <button 
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-white hover:text-indigo-200 focus:outline-none"
                    title={isExpanded ? 'Minimizar' : 'Expandir'}
                >
                    {isExpanded ? '▼' : '▲'}
                </button>
            </div>

            {/* Body */}
            {isExpanded && (
                <div className="p-4 flex flex-col gap-3">
                    <div className="text-xs text-gray-600">
                        Gerar regras semânticas (YAML) via Gemini para a semana:
                        <div className="font-bold text-indigo-900 mt-1">{weekId}</div>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={status === 'loading'}
                        className={`w-full py-2 rounded text-sm font-semibold transition-colors flex items-center justify-center gap-2
                            ${status === 'loading' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'}`}
                    >
                        {status === 'loading' ? (
                            <>
                                <div className="animate-spin h-4 w-4 border-2 border-indigo-500 rounded-full border-t-transparent"></div>
                                Processando...
                            </>
                        ) : (
                            <>
                                <span>🤖</span> Gerar Regras via IA
                            </>
                        )}
                    </button>

                    {message && (
                        <div className={`text-xs p-2 rounded border ${
                            status === 'error' ? 'bg-red-50 text-red-700 border-red-200' :
                            status === 'success' ? 'bg-green-50 text-green-700 border-green-200' :
                            'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                            {message}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
