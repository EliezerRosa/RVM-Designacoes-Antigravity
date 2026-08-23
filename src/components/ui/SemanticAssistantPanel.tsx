import React, { useEffect, useState, useMemo } from 'react';
import { getRuleForPart, calculateSemanticScore, SemanticRule, SemanticScoreResult } from '../../services/semanticRulesService';
import type { Publisher } from '../../types';

interface SemanticAssistantPanelProps {
    weekId: string;
    partTitle: string;
    eligiblePublishers: Publisher[];
    onAcceptSuggestion: (publisherId: string, publisherName: string) => void;
}

interface RankedSuggestion {
    publisher: Publisher;
    result: SemanticScoreResult;
}

export const SemanticAssistantPanel: React.FC<SemanticAssistantPanelProps> = ({
    weekId,
    partTitle,
    eligiblePublishers,
    onAcceptSuggestion
}) => {
    const [rule, setRule] = useState<SemanticRule | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);

        getRuleForPart(weekId, partTitle)
            .then(foundRule => {
                if (isMounted) {
                    setRule(foundRule);
                    setLoading(false);
                }
            })
            .catch(() => {
                if (isMounted) setLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [weekId, partTitle]);

    const topSuggestions = useMemo(() => {
        if (!rule || eligiblePublishers.length === 0) return [];

        const ranked: RankedSuggestion[] = eligiblePublishers.map(pub => ({
            publisher: pub,
            result: calculateSemanticScore(pub, rule)
        }));

        // Filtrar quem teve score > 0 e ordenar do maior pro menor
        return ranked
            .filter(r => r.result.score > 0)
            .sort((a, b) => b.result.score - a.result.score)
            .slice(0, 3); // Pegar os top 3
    }, [rule, eligiblePublishers]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="animate-spin h-4 w-4 border-2 border-primary-500 rounded-full border-t-transparent"></div>
                Consultando Especialista IA...
            </div>
        );
    }

    if (!rule) {
        return null; // Nenhuma regra semântica encontrada para esta parte
    }

    return (
        <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-3 my-3 shadow-sm">
            <div className="flex items-start gap-2 mb-2">
                <span className="text-xl" title="Sugestão da IA">💡</span>
                <div>
                    <h4 className="text-sm font-semibold text-indigo-900 leading-tight">
                        Especialista de Critérios
                    </h4>
                    <p className="text-xs text-indigo-700 italic">
                        {rule.sugestao}
                    </p>
                </div>
            </div>

            {rule.texto_original && (
                <div className="mb-3 px-3 py-2 bg-indigo-900/5 rounded border-l-2 border-indigo-300 text-xs text-indigo-900/80 italic shadow-inner">
                    <span className="font-semibold block mb-1">Texto analisado na apostila:</span>
                    "{rule.texto_original}"
                </div>
            )}

            {topSuggestions.length > 0 ? (
                <div className="mt-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-indigo-400 uppercase tracking-wider">Top Matches (Semântico)</span>
                        <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 rounded-full">Auditoria do Curador ativada</span>
                    </div>
                    {topSuggestions.map(({ publisher, result }) => (
                        <div key={publisher.id} className={`flex flex-col bg-white rounded border p-2 text-sm transition-colors ${result.isPerfectMatch ? 'border-green-300 bg-green-50/30' : 'border-indigo-50 hover:border-indigo-200'}`}>
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1">
                                    <span className="font-medium text-gray-800">{publisher.name}</span>
                                    {result.isPerfectMatch && <span title="Match Perfeito!" className="text-xs">✅</span>}
                                    {result.score < 0 && <span title="Não atende critério exato" className="text-xs">❌</span>}
                                </div>
                                <button
                                    onClick={() => onAcceptSuggestion(publisher.id, publisher.name)}
                                    className="px-3 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded text-xs font-semibold transition-colors"
                                >
                                    Aceitar
                                </button>
                            </div>
                            
                            {/* Feedback do Curador */}
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
                                <span className="text-[10px] text-gray-400">Score de Match: {result.score} pts</span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="mt-2 text-xs text-indigo-600 bg-white/60 p-2 rounded border border-indigo-50">
                    Nenhum publicador da lista atual teve Match forte com os critérios semânticos.
                </div>
            )}
        </div>
    );
};
