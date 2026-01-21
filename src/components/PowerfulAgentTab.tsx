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

interface Props {
    publishers: Publisher[];
    parts: WorkbookPart[];
    weekParts: Record<string, WorkbookPart[]>;
    weekOrder: string[];
}

export default function PowerfulAgentTab({ publishers, parts, weekParts, weekOrder }: Props) {
    // Estado de Navegação Híbrida
    const [currentWeekId, setCurrentWeekId] = useState<string | null>(weekOrder[0] || null);
    const [selectedPartId, setSelectedPartId] = useState<string | null>(null);

    // Silence linter for unused vars (Phase 1 placeholder)
    console.log('[AgentTab] Debug:', { publishersCount: publishers.length, partsCount: parts.length, selectedPartId, setSelectedPartId });
    const [showContextAlert, setShowContextAlert] = useState(false);

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

    // Callback de navegação do carrossel (Manual)
    const handleCarouselNavigation = (weekId: string) => {
        setCurrentWeekId(weekId);
        console.log(`[AgentTab] Usuário navegou para: ${weekId}`);
        // TODO: Notificar chat ("Vendo contexto da semana X...")
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

    // handlePartClick removed – not needed for current UI (debug button was removed)

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
                        weekParts={weekParts}
                        weekOrder={weekOrder}
                        currentWeekId={currentWeekId}
                        onWeekChange={handleCarouselNavigation}
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
                </div>
                <div style={contentStyle}>
                    <TemporalChat />
                </div>
            </div>

            {/* Coluna 3: Painel de Controle */}
            <div style={columnStyle}>
                <div style={headerStyle}>
                    <span>⚙️</span> Controle & Explicações
                </div>
                <div style={contentStyle}>
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
        </div>
    );
}
