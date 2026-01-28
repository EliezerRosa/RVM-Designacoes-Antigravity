/**
 * PowerfulAgentTab - Aba dedicada para o Agente Poderoso
 * 
 * Layout de 3 colunas:
 * 1. S-140 Híbrido (Preview)
 * 2. Chat Temporal (Conversa)
 * 3. Painel de Controle (Ações/Explicações)
 */

import { useState, useEffect } from 'react';
import type { Publisher, WorkbookPart } from '../types';
import S140PreviewCarousel from './S140PreviewCarousel';
import TemporalChat from './TemporalChat';
import ActionControlPanel from './ActionControlPanel';
import { chatHistoryService } from '../services/chatHistoryService';
import { S89SelectionModal } from './S89SelectionModal';
import type { ActionResult } from '../services/agentActionService';

interface Props {
    publishers: Publisher[];
    parts: WorkbookPart[];
    weekParts: Record<string, WorkbookPart[]>;
    weekOrder: string[];
    onDataChange?: () => void; // Trigger reload of parts
}

export default function PowerfulAgentTab({ publishers, parts, weekParts, weekOrder, onDataChange }: Props) {
    // Estado de Navegação Híbrida
    // Inicializar do localStorage se disponível
    const [currentWeekId, setCurrentWeekId] = useState<string | null>(() => {
        const stored = localStorage.getItem('rvm_agent_last_week_id');
        return stored || weekOrder[0] || null;
    });

    const [showS89Modal, setShowS89Modal] = useState(false);
    const [selectedPartId, setSelectedPartId] = useState<string | null>(null);

    // Sync currentWeekId when weekOrder arrives asynchronously OR fallback if stored is invalid
    useEffect(() => {
        if (!currentWeekId && weekOrder.length > 0) {
            console.log('[AgentTab] Setting initial week to:', weekOrder[0]);
            setCurrentWeekId(weekOrder[0]);
        }
    }, [weekOrder, currentWeekId]);

    // Persist changes
    useEffect(() => {
        if (currentWeekId) {
            localStorage.setItem('rvm_agent_last_week_id', currentWeekId);
        }
    }, [currentWeekId]);

    const [showContextAlert, setShowContextAlert] = useState(false);
    const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
    const [activeModel, setActiveModel] = useState<string>('gemini-1.5-flash'); // Default model active

    // Sync week navigation with TemporalChat (placeholder implementation)
    useEffect(() => {
        // When week changes, add a system message to chat history
        // This assumes TemporalChat creates a session titled 'Temporal Chat'
        (async () => {
            const recent = await chatHistoryService.getRecentSessions(5);
            const session = recent.find(s => s.title === 'Temporal Chat');
            if (session) {
                await chatHistoryService.addMessage(session.id, {
                    role: 'assistant',
                    content: `Naveguei para a semana ${currentWeekId}`,
                    timestamp: new Date(),
                });
            }
        })();
        // Show a simple visual alert for context change
        setShowContextAlert(true);
        const timer = setTimeout(() => setShowContextAlert(false), 3000);
        return () => clearTimeout(timer);
    }, [currentWeekId]);

    // Handle actions from Chat
    const handleAgentAction = (result: ActionResult) => {
        if (result.success) {
            console.log('[PowerfulAgent] Action successful, requesting reload...');

            // Trigger data reload
            if (onDataChange) onDataChange();

            // Auto-navigate to the week if hints are present
            if (result.actionType === 'GENERATE_WEEK' && result.data?.generatedWeeks?.[0]) {
                handleCarouselNavigation(result.data.generatedWeeks[0]);
            } else if (result.actionType === 'ASSIGN_PART' && result.data?.partId) {
                // Check if we need to navigate
                const part = parts.find(p => p.id === result.data.partId);
                if (part && part.weekId !== currentWeekId) {
                    handleCarouselNavigation(part.weekId);
                }
            } else if (result.actionType === 'NAVIGATE_WEEK' && result.data?.weekId) {
                handleCarouselNavigation(result.data.weekId);
            }
        }
    };

    // Callback de navegação do carrossel (Manual)
    const handleCarouselNavigation = (weekId: string) => {
        setCurrentWeekId(weekId);
        // console.log(`[AgentTab] Usuário navegou para: ${weekId}`);
    };

    // Estilos
    const containerStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: 'minmax(300px, 1fr) minmax(400px, 1.2fr) minmax(300px, 1fr)',
        gap: '20px',
        height: 'calc(100vh - 100px)', // Ajustar conforme header
        padding: '20px',
        background: '#F3F4F6',
    };

    const columnStyle: React.CSSProperties = {
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    };

    const headerStyle: React.CSSProperties = {
        padding: '16px',
        borderBottom: '1px solid #E5E7EB',
        fontWeight: '600',
        color: '#374151',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    };

    const contentStyle: React.CSSProperties = {
        flex: 1,
        overflow: 'auto',
        position: 'relative',
    };

    return (
        <div style={containerStyle}>
            {/* Coluna 1: S-140 Híbrido */}
            <div style={columnStyle}>
                <div style={headerStyle}>
                    <span>📄</span> Visualização Contextual (S-140)
                </div>
                <div style={{ ...contentStyle, padding: '10px' }}>
                    <S140PreviewCarousel
                        weekParts={weekParts} // Use real parts
                        weekOrder={weekOrder}
                        currentWeekId={currentWeekId}
                        onWeekChange={handleCarouselNavigation}
                        onPartClick={(partId) => setSelectedPartId(partId)}
                        selectedPartId={selectedPartId}
                        onRequestS89={() => setShowS89Modal(true)}
                    />
                    <div style={{ padding: '10px', fontSize: '12px', color: '#6B7280', textAlign: 'center' }}>
                        Navegue para dar contexto ao Agente
                    </div>
                </div>
            </div>

            {/* Coluna 2: Chat Temporal */}
            <div style={columnStyle}>
                <div style={headerStyle}>
                    <span>🤖</span> Agente RVM
                    {currentWeekId && (
                        <span style={{
                            fontSize: '0.8em',
                            background: '#E5E7EB',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            color: '#4B5563',
                            fontWeight: 'normal',
                            marginRight: '8px'
                        }}>
                            Semana: {currentWeekId}
                        </span>
                    )}
                    <span
                        onClick={() => setShowSubscriptionModal(true)}
                        style={{
                            marginLeft: 'auto',
                            fontSize: '10px',
                            background: '#DCFCE7',
                            color: '#166534',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid #86EFAC',
                            cursor: 'help',
                        }} title="Clique para ver detalhes do plano">
                        🛡️ Free Tier
                    </span>
                </div>
                <div style={contentStyle}>
                    <TemporalChat
                        publishers={publishers}
                        parts={parts}
                        onAction={handleAgentAction}
                        onNavigateToWeek={handleCarouselNavigation}
                        onModelChange={setActiveModel}
                    />
                </div>

                {/* Modal de Status da Assinatura */}
                {showSubscriptionModal && (
                    <div style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999
                    }} onClick={() => setShowSubscriptionModal(false)}>
                        <div style={{
                            background: 'white',
                            padding: '24px',
                            borderRadius: '12px',
                            maxWidth: '400px',
                            width: '90%',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                        }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h3 style={{ margin: 0, color: '#111827' }}>📊 Situação da Assinatura</h3>
                                <button onClick={() => setShowSubscriptionModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>&times;</button>
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ fontWeight: '600', color: '#166534', fontSize: '14px' }}>Plano Ativo: Gemini Free Tier</div>
                                <div style={{ fontSize: '12px', color: '#15803D' }}>
                                    Modelo Atual: <strong>{activeModel}</strong>
                                </div>
                                <div style={{ fontSize: '11px', color: '#15803D', marginTop: '4px' }}>
                                    Robustez: Smart Fallback Ativo
                                </div>
                            </div>

                            <h4 style={{ fontSize: '13px', color: '#374151', margin: '0 0 8px 0' }}>Limites de Uso (Gratuito):</h4>
                            <ul style={{ fontSize: '13px', color: '#4B5563', paddingLeft: '20px', margin: '0 0 16px 0' }}>
                                <li><strong>Velocidade:</strong> 15 requisições/minuto</li>
                                <li><strong>Diário:</strong> 1.500 requisições/dia</li>
                            </ul>

                            <div style={{ fontSize: '12px', color: '#6B7280', fontStyle: 'italic', borderTop: '1px solid #E5E7EB', paddingTop: '12px' }}>
                                ℹ️ O Google não fornece dados de consumo acumulado via API. O contador "Créditos" abaixo do chat é uma estimativa local para evitar bloqueios.
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setShowSubscriptionModal(false)}
                                style={{
                                    padding: '8px 16px',
                                    background: '#4F46E5',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: '500'
                                }}
                            >
                                Entendi
                            </button>
                        </div>
                    </div>

                )}
            </div>

            {/* Coluna 3: Painel de Controle */}
            <div style={columnStyle}>
                <div style={headerStyle}>
                    <span>⚙️</span> Controle & Explicações
                </div>
                <div style={{ ...contentStyle, padding: '10px' }}>
                    <ActionControlPanel
                        selectedPartId={selectedPartId}
                        parts={parts}
                        publishers={publishers}
                    />
                    {showContextAlert && (
                        <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, margin: '0 20px', padding: '8px', background: '#FFF3CD', color: '#856404', borderRadius: '4px', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                            Contexto atualizado
                        </div>
                    )}
                </div>
            </div>

            <S89SelectionModal
                isOpen={showS89Modal}
                onClose={() => setShowS89Modal(false)}
                weekParts={weekParts[currentWeekId || ''] || []}
                weekId={currentWeekId || ''}
                publishers={publishers}
            />
        </div>
    );
}
