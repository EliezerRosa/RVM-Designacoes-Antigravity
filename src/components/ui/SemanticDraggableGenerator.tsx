import React, { useState, useEffect, useRef } from 'react';
import { generateSemanticRulesForWeek, saveSemanticRulesToDb } from '../../services/semanticAgentService';
import { fetchSemanticRulesForWeek, calculateSemanticScore, SemanticRule, SemanticScoreResult } from '../../services/semanticRulesService';
import { participationAnalyticsService, PublisherStats } from '../../services/participationAnalyticsService';
import { getRankedEligibleForPart } from '../../services/rankedEligibleService';
import type { WorkbookPart, Publisher, HistoryRecord } from '../../types';

interface Props {
    weekId: string;
    parts: WorkbookPart[];
    publishers: Publisher[];
    history?: HistoryRecord[];
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

export const SemanticDraggableGenerator: React.FC<Props> = ({ weekId, parts, publishers, history, onPublisherSelect, focusedPartId }) => {
    const getDefaultBottomLeft = () => ({
        x: 24,
        y: typeof window !== 'undefined' ? Math.max(20, window.innerHeight - 68) : 700
    });

    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState(getDefaultBottomLeft);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const dragOriginRef = useRef({ x: 0, y: 0 });
    const hasDraggedRef = useRef(false);
    
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);
    
    const [analyses, setAnalyses] = useState<PartAnalysis[]>([]);
    const [activePartId, setActivePartId] = useState<string | null>(null);
    const [affinityMap, setAffinityMap] = useState<Record<string, PublisherStats>>({});
    const lastAnalyzedWeekRef = useRef<string | null>(null);

    // Carrega histórico para cálculo de afinidade
    useEffect(() => {
        const fetchHistory = async () => {
            if (!publishers || publishers.length === 0) return;
            
            const endDate = new Date().toISOString().split('T')[0];
            const startDateObj = new Date();
            startDateObj.setFullYear(startDateObj.getFullYear() - 1); // 1 ano de histórico
            const startDate = startDateObj.toISOString().split('T')[0];

            const names = publishers.map(p => p.name);

            try {
                const comparisonData = await participationAnalyticsService.comparePublishers(names, {
                    startDate,
                    endDate
                });

                const map: Record<string, PublisherStats> = {};
                comparisonData.publishers.forEach(p => {
                    map[p.name] = p;
                });
                setAffinityMap(map);
            } catch (err) {
                console.error('[SemanticDraggable] Error fetching affinity map:', err);
            }
        };
        fetchHistory();
    }, [publishers]);

    useEffect(() => {
        if (focusedPartId) {
            setActivePartId(focusedPartId);
        }
    }, [focusedPartId]);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
        dragOriginRef.current = { x: e.clientX, y: e.clientY };
        hasDraggedRef.current = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        const deltaX = Math.abs(e.clientX - dragOriginRef.current.x);
        const deltaY = Math.abs(e.clientY - dragOriginRef.current.y);
        if (deltaX > 4 || deltaY > 4) {
            hasDraggedRef.current = true;
        }

        const maxX = window.innerWidth - (isExpanded ? 430 : 160);
        const maxY = window.innerHeight - (isExpanded ? 200 : 50);
        const newX = Math.min(Math.max(10, e.clientX - dragStartRef.current.x), Math.max(10, maxX));
        const newY = Math.min(Math.max(10, e.clientY - dragStartRef.current.y), Math.max(10, maxY));

        setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleButtonClick = () => {
        if (hasDraggedRef.current) {
            // Apenas reposicionou o botão arrastando, não abre o painel
            return;
        }
        // Se estiver muito próximo do chão da tela, sobe o Y para caber o painel
        const panelHeight = Math.min(window.innerHeight * 0.85, 580);
        if (position.y + panelHeight > window.innerHeight - 20) {
            setPosition(prev => ({
                ...prev,
                y: Math.max(20, window.innerHeight - panelHeight - 20)
            }));
        }
        setIsExpanded(true);
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
    }, [isDragging, isExpanded]);

    // Passar affinityMap para a função, precisamos dela como dependência ou apenas capturar no closure.
    // Como runAnalysis é engatilhado por botões, ele vai ver o state atual.
    const runAnalysis = (rulesData: any) => {
        const weekKey = `semana_${weekId}`;
        const weekRules = rulesData[weekKey] || rulesData[weekId] || rulesData;
        if (!weekRules || typeof weekRules !== 'object') {
            console.warn(`[SemanticUI] runAnalysis: nenhuma weekRules válida para key=${weekKey}`);
            return;
        }
        const ruleKeys = Object.keys(weekRules);
        console.log(`[SemanticUI] runAnalysis: ${ruleKeys.length} regras no dict, ${parts.length} partes na UI`);

        const newAnalyses: PartAnalysis[] = [];

        parts.forEach(part => {
            let rule: SemanticRule | null = null;
            // Busca primária pelo ID exato
            if (weekRules[part.id]) {
                rule = weekRules[part.id] as SemanticRule;
            } else if (weekRules[`[PART_ID: ${part.id}]`]) {
                // Retrocompatibilidade imediata caso a IA tenha gravado o bracket literalmente
                rule = weekRules[`[PART_ID: ${part.id}]`] as SemanticRule;
            } else {
                // Fallback para fuzzy matching (títulos) para regras antigas gravadas no banco
                for (const [key, r] of Object.entries(weekRules)) {
                    if (part.tituloParte.includes(key) || key.includes(part.tituloParte)) {
                        rule = r as SemanticRule;
                        break;
                    }
                }
            }
            
            // Sempre adiciona a parte à análise, mesmo se a IA não retornou regra específica.
            // Cria uma regra default para evitar quebras de renderização (analysis.rule.property)
            const finalRule = rule || ({
                part_id: part.id,
                titulo_parte: part.tituloParte,
                sugestao: 'Sem restrições da IA. Usando compatibilidade histórica e função.'
            } as SemanticRule);

            // Requisito do Usuário:
            // "A seleção do Curador deve ser feita com os elegíveis que ficam visíveis quando o botão de desbloqueio é ativado."
            // "Com o filtro do item 1, naturalmente todas as regras do motor já estarão aplicadas"
            const eligibleResult = getRankedEligibleForPart(
                part,
                parts,
                publishers,
                history || [],
                {
                    applyEngineRules: false, // Simula o botão de desbloqueio ativado
                    excludeAssignedInSameWeek: true,
                }
            );

            // Filtra estritamente os candidatos elegíveis para a parte
            const candidatePublishers = eligibleResult.eligibleCandidates.map(c => c.publisher);

            const ranked: RankedSuggestion[] = candidatePublishers.map(pub => {
                const rotationCandidate = eligibleResult.eligibleCandidates.find(c => c.publisher.id === pub.id);
                const semanticScore = calculateSemanticScore(pub, finalRule, publishers, affinityMap);
                
                // Combina pontuação semântica com o score de rotação (critério de desempate)
                const combinedScore = semanticScore.score + (rotationCandidate ? rotationCandidate.score / 100 : 0);

                return {
                    publisher: pub,
                    result: {
                        ...semanticScore,
                        score: combinedScore
                    }
                };
            });

            const topSuggestions = ranked
                .sort((a, b) => b.result.score - a.result.score)
                .slice(0, 3);

            newAnalyses.push({ part, rule: finalRule, topSuggestions });
        });

        setAnalyses(newAnalyses);
        console.log(`[SemanticUI] runAnalysis concluído: ${newAnalyses.length} análises, ${newAnalyses.filter(a => a.topSuggestions.length > 0).length} com sugestões`);
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

        console.log(`[SemanticUI] handleGenerate disparado: weekId=${weekId}, parts.length=${parts.length}`);
        setStatus('loading');
        setMessage('Lendo partes da apostila e acionando IA...');
        
        try {
            const yamlContent = await generateSemanticRulesForWeek(weekId, parts);
            await saveSemanticRulesToDb(weekId, yamlContent);
            lastAnalyzedWeekRef.current = weekId;
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
        // Se mudou de semana, sempre reposiciona para a esquerda no rodapé e recolhe
        if (weekId !== lastAnalyzedWeekRef.current) {
            setPosition(getDefaultBottomLeft());
            setIsExpanded(false);
            setAnalyses([]);
            setActivePartId(null);
            setStatus('idle');
            setMessage('');
        }

        // Regra de Ouro: O Agente Curador só deve executar análise UMA VEZ na entrada na semana.
        // Se a semana atual já foi analisada, ignora re-renderizações subsequentes de parts e publishers.
        if (!weekId || lastAnalyzedWeekRef.current === weekId) {
            return;
        }

        // Aguarda carregar as partes da apostila da semana antes de disparar
        if (!parts || parts.length === 0) {
            return;
        }

        let isMounted = true;
        lastAnalyzedWeekRef.current = weekId;

        async function checkAndGenerateOnce() {
            if (!weekId) return;

            console.log(`[SemanticUI] Análise inicial única na entrada da semana: weekId=${weekId}, parts=${parts.length}`);

            try {
                const rules = await fetchSemanticRulesForWeek(weekId);
                const weekKey = `semana_${weekId}`;
                const weekData = rules[weekKey];
                const hasRules = !!weekData && Object.keys(weekData).length > 0;
                console.log(`[SemanticUI] checkAndGenerateOnce: hasRules=${hasRules}, keys=${weekData ? Object.keys(weekData).length : 0}`);

                if (!isMounted) return;

                if (!hasRules) {
                    console.log(`[SemanticUI] Sem regras salvas, gerando regras via IA uma única vez...`);
                    await handleGenerate();
                } else {
                    setStatus('success');
                    setMessage('Regras Semânticas ativas para esta semana.');
                    runAnalysis(rules);
                }
            } catch (err: any) {
                console.error('[SemanticUI] Erro na análise única da semana:', err);
                if (isMounted) {
                    setStatus('error');
                    setMessage(`Falha: ${err.message || String(err)}`);
                }
            }
        }

        checkAndGenerateOnce();
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

    if (!isExpanded) {
        return (
            <button 
                onMouseDown={handleMouseDown}
                onClick={handleButtonClick}
                title="Arraste para mover ou clique para expandir o Agente Curador IA"
                style={{
                    position: 'fixed',
                    left: `${position.x}px`,
                    top: `${position.y}px`,
                    zIndex: 9999,
                    background: 'linear-gradient(135deg, #4F46E5 0%, #3730A3 100%)',
                    color: '#ffffff',
                    border: '1px solid #818CF8',
                    borderRadius: '9999px',
                    padding: '10px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    boxShadow: isDragging 
                        ? '0 20px 30px -5px rgba(79, 70, 229, 0.6), 0 10px 10px -5px rgba(0, 0, 0, 0.2)' 
                        : '0 10px 25px -5px rgba(79, 70, 229, 0.45), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    userSelect: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    transition: isDragging ? 'none' : 'box-shadow 0.15s ease',
                }}
            >
                <span style={{ fontSize: '18px' }}>🧠</span>
                <span>Agente Curador IA</span>
                {status === 'loading' && (
                    <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: '4px' }}>
                        ⏳ Analisando...
                    </span>
                )}
                {status === 'success' && analyses.length > 0 && (
                    <span style={{
                        background: '#10B981',
                        color: 'white',
                        borderRadius: '9999px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: 700,
                    }}>
                        {analyses.length}
                    </span>
                )}
                <span style={{ fontSize: '12px', opacity: 0.85, marginLeft: '2px' }}>▲</span>
            </button>
        );
    }

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
                boxShadow: '0 20px 35px -5px rgba(0, 0, 0, 0.35), 0 10px 15px -5px rgba(0, 0, 0, 0.2)',
                borderRadius: '12px',
                border: '1px solid #818CF8',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                fontFamily: 'system-ui, -apple-system, sans-serif'
            }}
        >
            {/* Header / Drag Handle */}
            <div 
                style={{ 
                    padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: isDragging ? 'grabbing' : 'grab', backgroundColor: '#4f46e5', color: '#ffffff',
                    userSelect: 'none'
                }}
                onMouseDown={handleMouseDown}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>🧠</span>
                    <span style={{ fontWeight: '600', fontSize: '14px', letterSpacing: '0.025em' }}>Agente Curador IA</span>
                </div>
                <button 
                    onClick={() => {
                        setIsExpanded(false);
                        setPosition(prev => ({
                            x: Math.min(Math.max(10, prev.x), window.innerWidth - 200),
                            y: Math.min(Math.max(10, prev.y), window.innerHeight - 60)
                        }));
                    }}
                    style={{ 
                        color: '#ffffff', background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer',
                        padding: '4px 10px', fontSize: '12px', fontWeight: 600, borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px'
                    }}
                    title="Recolher para o rodapé"
                >
                    <span>▼</span>
                    <span>Recolher</span>
                </button>
            </div>

            {/* Body */}
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

                        {status === 'idle' && (
                            <div style={{ fontSize: '13px', padding: '12px', borderRadius: '6px', backgroundColor: '#f3f4f6', color: '#4b5563', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Aguardando dados...</span>
                                <button onClick={handleGenerate} style={{ padding: '6px 12px', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Gerar Regras</button>
                            </div>
                        )}

                        {status === 'success' && analyses.length === 0 && (
                            <div style={{ fontSize: '13px', padding: '12px', borderRadius: '6px', backgroundColor: '#f3f4f6', color: '#4b5563' }}>
                                <div>Nenhuma recomendação aplicável.</div>
                                <button onClick={handleGenerate} style={{ marginTop: '8px', width: '100%', padding: '6px', backgroundColor: '#e5e7eb', color: '#374151', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Forçar Regeneração</button>
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
                                                        {analysis.rule.perfil_sintetico && <RuleBadge label="Sintético" value={analysis.rule.perfil_sintetico} colorClass="#db2777" bgColor="#fce7f3" />}
                                                        {analysis.rule.afinidade_tipo_parte && <RuleBadge label="Afinidade" value={analysis.rule.afinidade_tipo_parte} colorClass="#059669" bgColor="#d1fae5" />}
                                                        {analysis.rule.demografia_alvo && <RuleBadge label="Alvo" value={analysis.rule.demografia_alvo} colorClass="#047857" bgColor="#d1fae5" />}
                                                        {analysis.rule.genero_alvo && <RuleBadge label="Gênero" value={analysis.rule.genero_alvo} colorClass="#4338ca" bgColor="#e0e7ff" />}
                                                        {analysis.rule.foco_treinamento && <RuleBadge label="Treinamento" value={analysis.rule.foco_treinamento} colorClass="#b45309" bgColor="#fef3c7" />}
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
                                                                    
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed #e5e7eb' }}>
                                                                        {result.matches.length > 0 && (
                                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                                                {result.matches.map((matchStr, i) => {
                                                                                    const isSynthetic = ['Conselheiro Experiente', 'Jovem Promissor', 'Apologista Maduro', 'Mentoria Feminina', 'Família Base', 'Jovem em Treinamento'].includes(matchStr);
                                                                                    const isAffinity = matchStr.includes('Afinidade Histórica');
                                                                                    
                                                                                    let bg = '#d1fae5';
                                                                                    let color = '#059669';
                                                                                    let icon = '✓';
                                                                                    
                                                                                    if (isSynthetic) {
                                                                                        bg = '#fce7f3';
                                                                                        color = '#db2777';
                                                                                        icon = '💎';
                                                                                    } else if (isAffinity) {
                                                                                        bg = '#e0e7ff';
                                                                                        color = '#4338ca';
                                                                                        icon = '📈';
                                                                                    }
                                                                                    
                                                                                    return (
                                                                                        <span key={i} style={{ 
                                                                                            fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px', 
                                                                                            color, backgroundColor: bg, padding: '2px 6px', borderRadius: '4px', fontWeight: '500' 
                                                                                        }}>
                                                                                            <span>{icon}</span> {matchStr}
                                                                                        </span>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        )}
                                                                        {result.misses.length > 0 && (
                                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                                                                                <span style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', color: '#ea580c' }}>
                                                                                    <span>⚠️</span> Falta: {result.misses.map(m => m.replace('Falta: ', '')).join(', ')}
                                                                                </span>
                                                                            </div>
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
        </div>
    );
};
